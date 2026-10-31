import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { type ImportContext, type ImportProfile, type ImportRow, type ImportRunResult, parseDate } from '@forga/core-api';
import type { ImportMessage, ImportRowResult } from '@forga/core-contracts';
import { type CatalogKind, COURSE_TARGET_PREFIX } from '@forga/masterdata-contracts';
import { CatalogEntry } from '../catalog/catalog.js';
import { attendanceDescription } from '../courses/course-description.js';
import { Course, CourseAttendance } from '../courses/course.entities.js';
import { Department, HonorAward, OfficeAssignment, Person, PersonQualification, RankAssignment } from '../masterdata.entities.js';
import { PersonsService, validQualifications, WRITE } from '../persons/persons.service.js';
import { today } from '../shared/access.js';
import { addMonths } from '../shared/dates.js';
import { matchCatalog } from './catalog-match.js';

const field = (key: string, de: string, en: string, aliases: string[], required = false) => ({ key, label: { de, en }, required, aliases });

const FIELDS = [
  field('personnelNumber', 'Personalnummer', 'Personnel number', ['Pers.-Nr.', 'Personalnummer']),
  field('personName', 'Name (Nachname Vorname)', 'Name (last first)', ['Name']),
  field('birthDate', 'Geburtsdatum', 'Date of birth', ['Geburtsdatum', 'Geb.-Datum']),
  field('kind', 'Art (Lehrgang, Dienstgrad, Ehrung, Amt)', 'Kind (course, rank, honor, office)', ['Art', 'Kategorie'], true),
  field('department', 'Abteilung', 'Department', ['Abteilung', 'Abt.']),
  field('name', 'Bezeichnung', 'Name', ['Bezeichnung', 'Lehrgang', 'Dienstgrad', 'Ehrung'], true),
  field('date', 'Datum', 'Date', ['Datum', 'Abschluss', 'von'], true),
  field('validUntil', 'Gültig bis', 'Valid until', ['gültig bis']),
];

type CareerKind = Extract<CatalogKind, 'qualification' | 'rank' | 'honor' | 'office'>;

const KINDS: [RegExp, CareerKind][] = [
  [/amt|office|funktion/i, 'office'],
  [/lehrg|qualifi|ausbild|course/i, 'qualification'],
  [/dienstgrad|rank|bef(ö|oe)rder/i, 'rank'],
  [/ehrung|honou?r|auszeichnung/i, 'honor'],
];

const nameKey = (text: string) => text.toLowerCase().split(/[\s,]+/).filter(Boolean).toSorted().join(' ');

/** Key for a new catalog entry from its name, e.g. "Motorsägen-Grundlehrgang" → `motorsaegen-grundlehrgang`. */
function newKey(name: string, taken: (key: string) => boolean): string {
  const base = name.toLowerCase().replaceAll('ä', 'ae').replaceAll('ö', 'oe').replaceAll('ü', 'ue').replaceAll('ß', 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'entry';
  let key = base;
  for (let n = 2; taken(key); n++) key = `${base}-${n}`;
  return key;
}

/**
 * Qualifications, course attendances, ranks and honors of persons, e.g. courses and history of MP-Feuer. A course name
 * matching no qualification but a course of the course catalog, or mapped to a course (`course:<key>`), becomes a
 * passed attendance granting the course's qualifications; a collective course like "other course" keeps the name as
 * description and grants nothing else.
 */
@Injectable()
export class CareerImport {
  constructor(
    private readonly em: EntityManager,
    private readonly persons: PersonsService,
  ) {}

  profile(): ImportProfile {
    return {
      id: 'masterdata.career',
      name: { de: 'Lehrgänge, Dienstgrade und Ehrungen', en: 'Courses, ranks and honors' },
      description: {
        de: 'Eine Zeile je Lehrgang, Beförderung, Ehrung oder Amt einer Person. Die Bezeichnung wird dem Katalog zugeordnet (z. B. „Truppführer, Lehrgang auf Kreisebene“ → Truppführer, „Abteilungskommandant“ → Amt). Eine Funktion aus MP-Feuer wird als Amt übernommen; ohne Abteilung gilt sie für die Gesamtwehr. Lehrgänge ohne passende Qualifikation werden als Lehrgangsteilnahme eingetragen, wenn sie zu einem Lehrgang des Lehrgangskatalogs passen oder ihm zugeordnet werden; beim Sammellehrgang „Anderer Lehrgang“ wird die Bezeichnung als Beschreibung übernommen. Schon vorhandene Einträge mit demselben Datum bleiben unverändert.',
        en: 'One row per course, promotion, honor or office of a person. The name is matched to the catalog (e.g. "Truppführer, Lehrgang auf Kreisebene" → squad leader, "Abteilungskommandant" → office). A function from MP-Feuer is taken over as an office; without a department it applies to the whole brigade. Courses without a matching qualification are recorded as course attendance when they match or are assigned to a course of the course catalog; for the collective course "Other course" the name is kept as description. Existing entries with the same date stay unchanged.',
      },
      permission: WRITE,
      fields: FIELDS,
      options: [{ key: 'createCatalogEntries', label: { de: 'Unbekannte Bezeichnungen im Katalog anlegen', en: 'Add unknown names to the catalog' }, default: false }],
      run: (rows, context) => this.run(rows, context),
    };
  }

  private async run(rows: ImportRow[], { user, options, dryRun, mapped, unmatched }: ImportContext): Promise<ImportRunResult> {
    const em = this.em.fork();
    const persons = await em.find(Person, {}, { populate: ['memberships.department', 'qualifications', 'ranks', 'honors', 'offices'] });
    const departments = await em.find(Department, {});
    const catalog = await em.find(CatalogEntry, { kind: { $in: ['qualification', 'rank', 'honor', 'office'] } });
    const courses = await em.find(Course, { active: true });
    // Matched by name only without a qualification of that name; collective courses only through a mapping.
    const namedCourses = courses.filter((c) => !c.describe).map((course) => ({ key: course.key, name: course.name, attributes: {}, course }));
    const attendances = await em.find(CourseAttendance, { result: 'passed' }, { populate: ['course'] });
    const createEntries = options['createCatalogEntries'] && user.can('masterdata.catalogs.manage');
    const results: ImportRowResult[] = [];

    for (const { row, values } of rows) {
      const messages: ImportMessage[] = [];
      const label = [values['personName'] || values['personnelNumber'], values['name']].filter(Boolean).join(' · ');
      const fail = (code: string, params?: ImportMessage['params']) => results.push({ row, action: 'error', label, messages: [{ code, params }] });

      const kind = KINDS.find(([pattern]) => pattern.test(values['kind'] ?? ''))?.[1];
      if (!kind) { fail('masterdata.import.unknownCareerKind', { value: values['kind'] ?? '' }); continue; }
      const date = parseDate(values['date'] ?? '');
      const validUntil = values['validUntil'] ? parseDate(values['validUntil']) : null;
      if (!date || (values['validUntil'] && !validUntil)) { fail('imports.invalidDate'); continue; }
      const birthDate = values['birthDate'] ? parseDate(values['birthDate']) : null;

      const matches = values['personnelNumber']
        ? persons.filter((p) => p.personnelNumber === values['personnelNumber'])
        : persons.filter((p) => nameKey(`${p.lastName} ${p.firstName}`) === nameKey(values['personName'] ?? '') && (!birthDate || !p.birthDate || p.birthDate === birthDate));
      if (matches.length !== 1) { fail(matches.length ? 'masterdata.import.ambiguous' : 'masterdata.import.unknownPerson', { name: values['personName'] || values['personnelNumber'] || '' }); continue; }
      const person = matches[0];
      if (!this.persons.can(user, WRITE, person)) { fail('auth.forbidden'); continue; }

      const name = (values['name'] ?? '').trim();
      const active = catalog.filter((e) => e.kind === kind && e.active);
      // Names first (qualifications before courses), then the chosen or remembered mappings; the user is asked only if
      // neither matches. A mapping to `course:<key>` targets a course of the course catalog.
      let entry = matchCatalog(active, name);
      let course = !entry && kind === 'qualification' ? matchCatalog(namedCourses, name)?.course : undefined;
      if (!entry && !course && name) {
        const key = mapped(kind, name);
        if (kind === 'qualification' && key?.startsWith(COURSE_TARGET_PREFIX)) course = courses.find((c) => `${COURSE_TARGET_PREFIX}${c.key}` === key);
        else entry = active.find((e) => e.key === key);
      }
      if (course) {
        const outcome = this.attend(em, person, course, name, date, validUntil, catalog, attendances);
        if (typeof outcome === 'string') results.push({ row, action: outcome, label, messages });
        else fail(outcome.error);
        continue;
      }
      if (!entry && createEntries && name) {
        entry = em.create(CatalogEntry, {
          kind,
          key: newKey(name, (key) => catalog.some((e) => e.kind === kind && e.key === key)),
          name: { de: name, en: name },
          sortOrder: 1000,
          active: true,
          attributes: kind === 'rank' ? { abbreviation: '', level: 0 } : kind === 'qualification' ? { validityMonths: null } : {},
        });
        catalog.push(entry);
        messages.push({ code: 'masterdata.import.catalogEntryCreated', params: { name } });
      }
      if (!entry) {
        if (name) unmatched(kind, name);
        fail('masterdata.import.unknownCatalogEntry', { kind, value: name, name });
        continue;
      }
      const { key } = entry;

      let exists: boolean;
      if (kind === 'qualification') {
        exists = person.qualifications.getItems().some((q) => q.qualification === key && q.acquiredOn === date);
        const months = entry.attributes['validityMonths'] as number | null | undefined;
        if (!exists) person.qualifications.add(em.create(PersonQualification, { person, qualification: key, acquiredOn: date, validUntil: validUntil ?? (months ? addMonths(date, months) : null), courseAttendanceId: null, notes: '' }));
      } else if (kind === 'rank') {
        exists = person.ranks.getItems().some((r) => r.rank === key && r.since === date);
        if (!exists) person.ranks.add(em.create(RankAssignment, { person, rank: key, since: date, notes: '' }));
      } else if (kind === 'honor') {
        exists = person.honors.getItems().some((h) => h.honor === key && h.awardedOn === date);
        if (!exists) person.honors.add(em.create(HonorAward, { person, honor: key, awardedOn: date, notes: '' }));
      } else {
        const brigade = /^(ja|yes|1)$/i.test(values['brigadeOffice'] ?? '');
        const departmentName = (values['department'] ?? '').trim();
        const departmentId = brigade || !departmentName ? null : this.departmentId(departments, departmentName);
        if (!brigade && departmentName && !departmentId) {
          unmatched('department', departmentName);
          fail('masterdata.import.unknownDepartment', { name: departmentName });
          continue;
        }
        exists = person.offices.getItems().some((o) => o.office === key && o.from === date);
        if (!exists) person.offices.add(em.create(OfficeAssignment, { person, office: key, departmentId, from: date, to: validUntil, notes: '' }));
      }
      results.push({ row, action: exists ? 'unchanged' : 'create', label, messages });
    }

    if (!dryRun) await em.flush();
    const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
    for (const r of results) counts[r.action]++;
    return { dryRun, counts, rows: results };
  }

  /** Department by its name or short name; a leading "Abteilung" is ignored. */
  private departmentId(departments: Department[], name: string): string | null {
    const text = name.trim().toLowerCase();
    const stripped = text.replace(/^(abteilung|abt\.?)\s*/, '');
    const found = departments.find((d) => [d.name, d.shortName].some((n) => n.toLowerCase() === text || n.toLowerCase() === stripped));
    return found?.id ?? null;
  }

  /**
   * A passed attendance of the course on the date, like one entered by hand but without events (imported history,
   * so no course allowance): a collective course keeps the imported name as description, other courses grant their
   * qualifications the person does not hold validly yet. The same person, course, date and description is
   * `unchanged`; another passed attendance of the course (with the same description) is an error.
   */
  private attend(
    em: EntityManager,
    person: Person,
    course: Course,
    name: string,
    date: string,
    validUntil: string | null,
    catalog: CatalogEntry[],
    attendances: CourseAttendance[],
  ): 'create' | 'unchanged' | { error: string } {
    const description = attendanceDescription(course, name);
    if (description === null) return { error: 'masterdata.descriptionRequired' };
    const passed = attendances.filter((a) => a.person.id === person.id && a.course.id === course.id && (!course.describe || a.description === description));
    if (passed.some((a) => a.startsOn === date)) return 'unchanged';
    if (passed.length) return { error: 'masterdata.coursePassedAlready' };
    if (date > today()) return { error: 'masterdata.attendanceInFuture' };
    const attendance = em.create(CourseAttendance, { id: uuidv7(), person, course, run: null, startsOn: date, endsOn: null, result: 'passed', location: '', notes: '', description });
    attendances.push(attendance);
    const valid = new Set(validQualifications(person, date));
    for (const key of course.grantsQualifications.filter((q) => !valid.has(q))) {
      const months = catalog.find((e) => e.kind === 'qualification' && e.key === key)?.attributes['validityMonths'] as number | null | undefined;
      person.qualifications.add(em.create(PersonQualification, { person, qualification: key, acquiredOn: date, validUntil: validUntil ?? (months ? addMonths(date, months) : null), courseAttendanceId: attendance.id, notes: '' }));
    }
    return 'create';
  }
}
