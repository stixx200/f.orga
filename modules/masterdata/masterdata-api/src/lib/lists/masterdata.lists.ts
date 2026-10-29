import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { z } from 'zod';
import { CONSENTS, type ConsentLookup, type Language, type ListCell, type ListColumn, type LocalizedText } from '@forga/core-contracts';
import { AccessLog, type AuthenticatedUser, type ListDefinition, SettingsService } from '@forga/core-api';
import { courseLabel, type MembershipSettings, PersonStatus } from '@forga/masterdata-contracts';
import { CatalogEntry } from '../catalog/catalog.js';
import { CourseAttendance, CourseNomination } from '../courses/course.entities.js';
import { OPEN_NOMINATION, PLAN } from '../courses/courses.controller.js';
import { Department, Person, Vehicle } from '../masterdata.entities.js';
import {
  activeMemberships,
  currentRank,
  PersonsService,
  primaryDepartment,
  READ,
  SENSITIVE,
  validQualifications,
} from '../persons/persons.service.js';
import { today } from '../shared/access.js';
import { ageOn } from '../shared/dates.js';

const col = (key: string, de: string, en: string, width?: number, align?: ListColumn['align']): ListColumn => ({
  key,
  label: { de, en },
  ...(width ? { width } : {}),
  ...(align ? { align } : {}),
});

const NAME = col('name', 'Name', 'Name', 2);
const DEPARTMENT = col('department', 'Abteilung', 'Department', 1.5);

const STATUS_LABELS: Record<PersonStatus, LocalizedText> = {
  probation: { de: 'Probezeit', en: 'Probation' },
  active: { de: 'Aktiv', en: 'Active' },
  passive: { de: 'Passiv', en: 'Passive' },
  youth: { de: 'Jugend', en: 'Youth' },
  veterans: { de: 'Altersabteilung', en: 'Veterans' },
  left: { de: 'Ausgeschieden', en: 'Left' },
};

const departmentParameter = { key: 'departmentId', label: { de: 'Abteilung', en: 'Department' }, type: 'department' as const };
const statusParameter = {
  key: 'status',
  label: { de: 'Status', en: 'Status' },
  type: 'select' as const,
  options: PersonStatus.options.map((value) => ({ value, label: STATUS_LABELS[value] })),
};


/**
 * Purpose of the phone list (decision 9 of the data protection concept): the list of the leaders (persons with a current
 * office) is part of the brigade's task; in the list of the whole department the mobile number needs a consent.
 */
const PhonePurpose = z.enum(['department', 'leaders']);
const phonePurposeParameter = {
  key: 'purpose',
  label: { de: 'Zweck', en: 'Purpose' },
  type: 'select' as const,
  options: [
    { value: 'department', label: { de: 'Telefonliste der Abteilung (Handynummer nur mit Einwilligung)', en: 'Phone list of the department (mobile number only with consent)' } },
    { value: 'leaders', label: { de: 'Führungskräfte (Alarmierung, Erreichbarkeit)', en: 'Leaders (alerting, reachability)' } },
  ],
};

/** Qualifications that make a person one of the leaders of the phone list. */
const LEADER_QUALIFICATIONS = new Set(['group-leader', 'platoon-leader', 'unit-leader']);

/** Purpose of the birthday list: internal for the commander, or posting in the station (only persons with consent). */
const BirthdayPurpose = z.enum(['internal', 'posting']);
const birthdayPurposeParameter = {
  key: 'purpose',
  label: { de: 'Zweck', en: 'Purpose' },
  type: 'select' as const,
  options: [
    { value: 'internal', label: { de: 'intern für den Kommandanten', en: 'internal for the commander' } },
    { value: 'posting', label: { de: 'Aushang (nur mit Einwilligung)', en: 'Posting (only with consent)' } },
  ],
};

/** Read log area of lists with contact or sensitive data (L15). */
export const LISTS_ACCESS_AREA = 'masterdata.lists';

const date = z.iso.date();
const PersonFilter = z.object({ departmentId: z.uuid().optional(), status: PersonStatus.optional() });
type PersonFilter = z.infer<typeof PersonFilter>;

/** One row of the personnel strength list. */
function strengthRow(label: string, list: Person[]) {
  return {
    department: label,
    active: list.filter((p) => p.status === 'active').length,
    probation: list.filter((p) => p.status === 'probation').length,
    youth: list.filter((p) => p.status === 'youth').length,
    veterans: list.filter((p) => p.status === 'veterans').length,
    passive: list.filter((p) => p.status === 'passive').length,
    female: list.filter((p) => p.gender === 'female').length,
    total: list.length,
  };
}

function name(person: Person): string {
  return `${person.lastName}, ${person.firstName}`;
}

/** The list templates of the masterdata module. Rows only contain persons the user may see. */
@Injectable()
export class MasterdataLists {
  constructor(
    private readonly em: EntityManager,
    private readonly persons: PersonsService,
    private readonly settings: SettingsService,
    private readonly accessLog: AccessLog,
    @Inject(CONSENTS) private readonly consents: ConsentLookup,
  ) {}

  /** Lists with contact or sensitive data are recorded in the read log, per person in the list. */
  private logged(user: AuthenticatedUser, persons: readonly Person[]): Promise<void> {
    return this.accessLog.record(user, persons.map((p) => p.id), LISTS_ACCESS_AREA);
  }

  private async rules(): Promise<MembershipSettings> {
    return (await this.settings.get<MembershipSettings>('masterdata.membership')) as MembershipSettings;
  }

  definitions(): ListDefinition<never>[] {
    const lists: ListDefinition<never>[] = [
      this.members(),
      this.signatures(),
      this.phones(),
      this.complete(),
      this.birthdays(),
      this.jubilees(),
      this.qualificationMatrix(),
      this.breathingApparatus(),
      this.probation(),
      this.ageLimits(),
      this.strength(),
      this.vehicles(),
      this.courseNominations(),
      this.courseYear(),
    ] as ListDefinition<never>[];
    return lists;
  }

  private async labels(language: Language) {
    const em = this.em.fork();
    const departments = new Map((await em.find(Department, {})).map((d) => [d.id, d.name]));
    const catalog = await em.find(CatalogEntry, {});
    const entry = (kind: string, key: string | null) =>
      key ? (catalog.find((c) => c.kind === kind && c.key === key)?.name[language] ?? key) : '';
    return { departments, entry, catalog };
  }

  private async filtered(user: AuthenticatedUser, permission: string, filter: PersonFilter): Promise<Person[]> {
    const persons = await this.persons.findVisible(user, permission, {
      status: filter.status ?? { $nin: ['left'] },
    });
    return filter.departmentId
      ? persons.filter((p) => activeMemberships(p).some((m) => m.department.id === filter.departmentId))
      : persons;
  }

  private members(): ListDefinition<PersonFilter> {
    return {
      id: 'masterdata.members',
      name: { de: 'Mitgliederliste', en: 'Member list' },
      permission: READ,
      parameters: [departmentParameter, statusParameter],
      schema: PersonFilter,
      columns: [
        NAME,
        DEPARTMENT,
        col('rank', 'Dienstgrad', 'Rank', 1.5),
        col('status', 'Status', 'Status'),
        col('joinedOn', 'Eintritt', 'Joined'),
        col('phoneMobile', 'Mobil', 'Mobile', 1.2),
        col('email', 'E-Mail', 'E-mail', 2),
      ],
      orientation: 'landscape',
      rows: async (user, params, language) => {
        const { departments, entry } = await this.labels(language);
        const persons = await this.filtered(user, READ, params);
        await this.logged(user, persons);
        return {
          rows: persons.map((p) => ({
            name: name(p),
            department: departments.get(primaryDepartment(p) ?? '') ?? '',
            rank: entry('rank', currentRank(p)),
            status: STATUS_LABELS[p.status][language],
            joinedOn: p.joinedOn ?? null,
            phoneMobile: p.phoneMobile,
            email: p.email,
          })),
        };
      },
    };
  }

  private signatures(): ListDefinition<PersonFilter & { title?: string; date?: string }> {
    return {
      id: 'masterdata.signatures',
      name: { de: 'Unterschriftenliste', en: 'Signature list' },
      permission: READ,
      parameters: [
        departmentParameter,
        statusParameter,
        { key: 'title', label: { de: 'Anlass', en: 'Occasion' }, type: 'text' },
        { key: 'date', label: { de: 'Datum', en: 'Date' }, type: 'date' },
      ],
      schema: PersonFilter.extend({ title: z.string().max(200).optional(), date: date.optional() }),
      columns: [col('number', 'Nr.', 'No.', 0.4, 'right'), NAME, DEPARTMENT],
      signatureColumn: true,
      rows: async (user, params, language) => {
        const { departments } = await this.labels(language);
        const persons = await this.filtered(user, READ, params);
        const dateText = params.date ? params.date.split('-').toReversed().join('.') : '';
        return {
          subtitle: [params.title, dateText].filter(Boolean).join(' – ') || undefined,
          rows: persons.map((p, i) => ({
            number: i + 1,
            name: name(p),
            department: departments.get(primaryDepartment(p) ?? '') ?? '',
          })),
        };
      },
    };
  }

  private phones(): ListDefinition<PersonFilter & { purpose?: z.infer<typeof PhonePurpose> }> {
    return {
      id: 'masterdata.phones',
      name: { de: 'Telefonliste', en: 'Phone list' },
      description: {
        de: 'Für die Abteilung steht die Handynummer nur bei Personen mit Einwilligung, sonst „über Gruppenführer“; die Liste der Führungskräfte zeigt sie immer.',
        en: 'For the department the mobile number is only shown for persons with consent, otherwise “via group leader”; the list of leaders always shows it.',
      },
      permission: READ,
      parameters: [phonePurposeParameter, departmentParameter],
      schema: PersonFilter.extend({ purpose: PhonePurpose.optional() }),
      columns: [NAME, DEPARTMENT, col('phoneMobile', 'Mobil', 'Mobile', 1.3), col('phonePrivate', 'Privat', 'Private', 1.3), col('phoneWork', 'Dienstlich', 'Work', 1.3)],
      rows: async (user, params, language) => {
        const { departments } = await this.labels(language);
        const day = today();
        const leaders = params.purpose === 'leaders';
        // Leaders: a current office (commander, wardens …) or a leader qualification (group, platoon, unit leader).
        const persons = (await this.filtered(user, READ, params)).filter(
          (p) => !leaders || p.offices.getItems().some((o) => o.from <= day && (!o.to || o.to >= day)) || validQualifications(p).some((q) => LEADER_QUALIFICATIONS.has(q)),
        );
        await this.logged(user, persons);
        const consented = leaders ? null : await this.consents.withEffect('masterdata.phone-list-mobile', persons.map((p) => p.id));
        const viaGroupLeader = language === 'de' ? 'über Gruppenführer' : 'via group leader';
        return {
          subtitle: leaders ? (language === 'de' ? 'Führungskräfte' : 'Leaders') : undefined,
          rows: persons.map((p) => ({
            name: name(p),
            department: departments.get(primaryDepartment(p) ?? '') ?? '',
            phoneMobile: !consented || consented.has(p.id) ? p.phoneMobile : p.phoneMobile ? viaGroupLeader : '',
            phonePrivate: p.phonePrivate,
            phoneWork: p.phoneWork,
          })),
        };
      },
    };
  }

  private complete(): ListDefinition<PersonFilter> {
    return {
      id: 'masterdata.complete',
      name: { de: 'Komplettdaten', en: 'Complete data' },
      description: { de: 'Alle Stammdaten je Person, einschließlich sensibler Felder.', en: 'All master data per person, including sensitive fields.' },
      permission: SENSITIVE,
      parameters: [departmentParameter, statusParameter],
      schema: PersonFilter,
      columns: [
        col('personnelNumber', 'Pers.-Nr.', 'No.', 0.7),
        NAME,
        col('birthDate', 'Geburtsdatum', 'Date of birth'),
        col('address', 'Anschrift', 'Address', 2.5),
        col('phoneMobile', 'Mobil', 'Mobile', 1.2),
        col('email', 'E-Mail', 'E-mail', 1.8),
        DEPARTMENT,
        col('rank', 'Dienstgrad', 'Rank', 1.2),
        col('joinedOn', 'Eintritt', 'Joined'),
        col('employer', 'Arbeitgeber', 'Employer', 1.5),
      ],
      orientation: 'landscape',
      rows: async (user, params, language) => {
        const { departments, entry } = await this.labels(language);
        const persons = await this.filtered(user, SENSITIVE, params);
        await this.logged(user, persons);
        return {
          rows: persons.map((p) => ({
            personnelNumber: p.personnelNumber ?? '',
            name: name(p),
            birthDate: p.birthDate ?? null,
            address: [p.street, [p.postalCode, p.city].filter(Boolean).join(' ')].filter(Boolean).join(', '),
            phoneMobile: p.phoneMobile,
            email: p.email,
            department: departments.get(primaryDepartment(p) ?? '') ?? '',
            rank: entry('rank', currentRank(p)),
            joinedOn: p.joinedOn ?? null,
            employer: p.employer?.name ?? '',
          })),
        };
      },
    };
  }

  private birthdays(): ListDefinition<{ from?: string; to?: string; departmentId?: string; purpose?: z.infer<typeof BirthdayPurpose> }> {
    return {
      id: 'masterdata.birthdays',
      name: { de: 'Geburtstage', en: 'Birthdays' },
      description: {
        de: 'Runde Geburtstage sind markiert. Zum Aushang nur Personen mit Einwilligung.',
        en: 'Milestone birthdays are marked. For posting only persons with consent.',
      },
      permission: SENSITIVE,
      parameters: [
        birthdayPurposeParameter,
        { key: 'from', label: { de: 'Von', en: 'From' }, type: 'date' },
        { key: 'to', label: { de: 'Bis', en: 'To' }, type: 'date' },
        departmentParameter,
      ],
      schema: z.object({ from: date.optional(), to: date.optional(), departmentId: z.uuid().optional(), purpose: BirthdayPurpose.optional() }),
      columns: [col('birthday', 'Geburtstag', 'Birthday'), NAME, col('age', 'Alter', 'Age', 0.6, 'right'), col('milestone', 'Rund', 'Milestone', 0.6), DEPARTMENT],
      rows: async (user, params, language) => {
        const from = params.from ?? today();
        const to = params.to ?? `${from.slice(0, 4)}-12-31`;
        const { departments } = await this.labels(language);
        const all = await this.filtered(user, SENSITIVE, { departmentId: params.departmentId });
        // Posting in the station: only persons who consented (L9); internal use needs none.
        const consented = params.purpose === 'posting' ? await this.consents.withEffect('masterdata.birthdays-posting', all.map((p) => p.id)) : null;
        const persons = consented ? all.filter((p) => consented.has(p.id)) : all;
        await this.logged(user, persons);
        const rows: Record<string, ListCell>[] = [];
        const { youthEndAge, minimumAgeIncidents } = await this.rules();
        const milestones = new Set([youthEndAge, minimumAgeIncidents]);
        for (const p of persons) {
          if (!p.birthDate) continue;
          for (let year = Number(from.slice(0, 4)); year <= Number(to.slice(0, 4)); year++) {
            const birthday = `${year}${p.birthDate.slice(4)}`;
            if (birthday < from || birthday > to) continue;
            const age = ageOn(p.birthDate, birthday);
            rows.push({
              birthday,
              name: name(p),
              age,
              milestone: age % 10 === 0 || milestones.has(age) ? '*' : '',
              department: departments.get(primaryDepartment(p) ?? '') ?? '',
            });
          }
        }
        const purpose = consented ? (language === 'de' ? ' · Aushang' : ' · posting') : '';
        return { subtitle: `${from} – ${to}${purpose}`, rows: rows.toSorted((a, b) => String(a['birthday']).localeCompare(String(b['birthday']))) };
      },
    };
  }

  private jubilees(): ListDefinition<{ year?: number; departmentId?: string }> {
    return {
      id: 'masterdata.jubilees',
      name: { de: 'Dienstjubiläen', en: 'Service anniversaries' },
      permission: READ,
      parameters: [{ key: 'year', label: { de: 'Jahr', en: 'Year' }, type: 'year' }, departmentParameter],
      schema: z.object({ year: z.coerce.number().int().min(1900).max(2200).optional(), departmentId: z.uuid().optional() }),
      columns: [NAME, col('joinedOn', 'Eintritt', 'Joined'), col('years', 'Jahre', 'Years', 0.6, 'right'), DEPARTMENT],
      rows: async (user, params, language) => {
        const year = params.year ?? Number(today().slice(0, 4));
        const { departments } = await this.labels(language);
        const { jubileeYears } = await this.rules();
        const persons = await this.filtered(user, READ, { departmentId: params.departmentId });
        return {
          subtitle: String(year),
          rows: persons
            .filter((p) => p.joinedOn && jubileeYears.includes(year - Number(p.joinedOn.slice(0, 4))))
            .map((p) => ({
              name: name(p),
              joinedOn: p.joinedOn ?? null,
              years: year - Number((p.joinedOn ?? '').slice(0, 4)),
              department: departments.get(primaryDepartment(p) ?? '') ?? '',
            }))
            .toSorted((a, b) => b.years - a.years),
        };
      },
    };
  }

  private qualificationMatrix(): ListDefinition<PersonFilter> {
    return {
      id: 'masterdata.qualification-matrix',
      name: { de: 'Qualifikationsübersicht', en: 'Qualification matrix' },
      permission: READ,
      parameters: [departmentParameter],
      schema: PersonFilter,
      columns: [NAME],
      orientation: 'landscape',
      rows: async (user, params, language) => {
        const { catalog } = await this.labels(language);
        const qualifications = catalog
          .filter((c) => c.kind === 'qualification' && c.active)
          .toSorted((a, b) => a.sortOrder - b.sortOrder);
        const persons = await this.filtered(user, READ, params);
        return {
          columns: [NAME, ...qualifications.map((q) => ({ key: q.key, label: q.name, width: 0.8, align: 'center' as const }))],
          rows: persons.map((p) => {
            const held = new Set(validQualifications(p));
            return { name: name(p), ...Object.fromEntries(qualifications.map((q) => [q.key, held.has(q.key) ? 'x' : ''])) };
          }),
        };
      },
    };
  }

  private breathingApparatus(): ListDefinition<PersonFilter> {
    return {
      id: 'masterdata.breathing-apparatus',
      name: { de: 'Atemschutzgeräteträger', en: 'Breathing apparatus wearers' },
      description: {
        de: 'Personen mit gültiger Qualifikation. Die Tauglichkeit mit Fristen liefert das Modul Atemschutz.',
        en: 'Persons with a valid qualification. Fitness with deadlines comes from the respiratory protection module.',
      },
      permission: READ,
      parameters: [departmentParameter],
      schema: PersonFilter,
      columns: [NAME, DEPARTMENT, col('acquiredOn', 'Erworben', 'Acquired'), col('validUntil', 'Gültig bis', 'Valid until')],
      rows: async (user, params, language) => {
        const { departments } = await this.labels(language);
        const persons = (await this.filtered(user, READ, params)).filter((p) => validQualifications(p).includes('breathing-apparatus'));
        return {
          rows: persons.map((p) => {
            const entry = p.qualifications
              .getItems()
              .filter((q) => q.qualification === 'breathing-apparatus')
              .toSorted((a, b) => b.acquiredOn.localeCompare(a.acquiredOn))[0];
            return {
              name: name(p),
              department: departments.get(primaryDepartment(p) ?? '') ?? '',
              acquiredOn: entry?.acquiredOn ?? null,
              validUntil: entry?.validUntil ?? null,
            };
          }),
        };
      },
    };
  }

  private probation(): ListDefinition<PersonFilter> {
    return {
      id: 'masterdata.probation',
      name: { de: 'Probezeit', en: 'Probation' },
      permission: READ,
      parameters: [departmentParameter],
      schema: PersonFilter,
      columns: [NAME, DEPARTMENT, col('joinedOn', 'Eintritt', 'Joined'), col('probationEndsOn', 'Ende Probezeit', 'Probation ends'), col('basicTraining', 'Truppmann Teil 1', 'Basic training', 1, 'center')],
      rows: async (user, params, language) => {
        const { departments } = await this.labels(language);
        const persons = await this.filtered(user, READ, { ...params, status: 'probation' });
        const required = (await this.rules()).probationQualifications;
        return {
          rows: persons
            .map((p) => ({
              name: name(p),
              department: departments.get(primaryDepartment(p) ?? '') ?? '',
              joinedOn: p.joinedOn ?? null,
              probationEndsOn: p.probationEndsOn ?? null,
              basicTraining: required.every((q) => validQualifications(p).includes(q)),
            }))
            .toSorted((a, b) => String(a.probationEndsOn).localeCompare(String(b.probationEndsOn))),
        };
      },
    };
  }

  private ageLimits(): ListDefinition<{ year?: number; departmentId?: string }> {
    return {
      id: 'masterdata.age-limits',
      name: { de: 'Altersgrenzen', en: 'Age limits' },
      permission: SENSITIVE,
      parameters: [{ key: 'year', label: { de: 'Jahr', en: 'Year' }, type: 'year' }, departmentParameter],
      schema: z.object({ year: z.coerce.number().int().min(1900).max(2200).optional(), departmentId: z.uuid().optional() }),
      columns: [NAME, col('birthDate', 'Geburtsdatum', 'Date of birth'), col('age', 'Alter', 'Age', 0.5, 'right'), col('meaning', 'Bedeutung', 'Meaning', 3), DEPARTMENT],
      rows: async (user, params, language) => {
        const year = params.year ?? Number(today().slice(0, 4));
        const { departments } = await this.labels(language);
        const persons = await this.filtered(user, SENSITIVE, { departmentId: params.departmentId });
        await this.logged(user, persons);
        // The ages come from the membership settings; several meanings of one age are joined.
        const rules = await this.rules();
        const limits: { age: number; label: LocalizedText }[] = [
          { age: rules.minimumAgeOperational, label: { de: 'Aufnahme in die Einsatzabteilung möglich', en: 'May join the operational department' } },
          { age: rules.minimumAgeIncidents, label: { de: 'Einsatzdienst möglich', en: 'Incident duty possible' } },
          { age: rules.youthEndAge, label: { de: 'Ende Jugendfeuerwehr', en: 'End of youth fire brigade' } },
          { age: rules.veteransApplicationAge, label: { de: 'Antrag Altersabteilung möglich', en: 'May apply for veterans department' } },
          { age: rules.ageLimitOperational, label: { de: 'Altersgrenze Einsatzabteilung', en: 'Age limit operational department' } },
        ];
        const rows: Record<string, ListCell>[] = [];
        for (const p of persons) {
          if (!p.birthDate) continue;
          const age = year - Number(p.birthDate.slice(0, 4));
          const meanings = limits.filter((l) => l.age === age).map((l) => l.label[language]);
          if (!meanings.length) continue;
          rows.push({
            name: name(p),
            birthDate: p.birthDate,
            age,
            meaning: meanings.join(' / '),
            department: departments.get(primaryDepartment(p) ?? '') ?? '',
          });
        }
        return { subtitle: String(year), rows: rows.toSorted((a, b) => String(a['birthDate']).localeCompare(String(b['birthDate']))) };
      },
    };
  }

  private strength(): ListDefinition<Record<string, never>> {
    return {
      id: 'masterdata.strength',
      name: { de: 'Personalstärke', en: 'Personnel strength' },
      permission: READ,
      schema: z.object({}).strip() as unknown as z.ZodType<Record<string, never>>,
      columns: [
        col('department', 'Abteilung', 'Department', 2),
        ...(['active', 'probation', 'youth', 'veterans', 'passive'] as const).map((s) =>
          col(s, STATUS_LABELS[s].de, STATUS_LABELS[s].en, 1, 'right'),
        ),
        col('female', 'Davon weiblich', 'Thereof female', 1, 'right'),
        col('total', 'Gesamt', 'Total', 1, 'right'),
      ],
      rows: async (user, _params, language) => {
        const { departments } = await this.labels(language);
        const persons = await this.filtered(user, READ, {});
        const byDepartment = new Map<string, Person[]>();
        for (const p of persons) {
          const id = primaryDepartment(p) ?? '';
          byDepartment.set(id, [...(byDepartment.get(id) ?? []), p]);
        }
        const rows = [...byDepartment.entries()]
          .map(([id, list]) => strengthRow(departments.get(id) ?? '–', list))
          .toSorted((a, b) => a.department.localeCompare(b.department));
        return { rows: [...rows, strengthRow(language === 'de' ? 'Gesamt' : 'Total', persons)] };
      },
    };
  }

  private vehicles(): ListDefinition<{ departmentId?: string }> {
    return {
      id: 'masterdata.vehicles',
      name: { de: 'Fahrzeugliste', en: 'Vehicle list' },
      permission: READ,
      parameters: [departmentParameter],
      schema: z.object({ departmentId: z.uuid().optional() }),
      columns: [
        col('designation', 'Fahrzeug', 'Vehicle', 1.5),
        col('radioCallSign', 'Funkrufname', 'Call sign', 1.8),
        col('type', 'Typ', 'Type'),
        DEPARTMENT,
        col('station', 'Wache', 'Station', 1.5),
        col('seats', 'Plätze', 'Seats', 0.6, 'right'),
        col('statisticsCategory', 'Statistik', 'Statistics', 0.8),
      ],
      orientation: 'landscape',
      rows: async (_user, params, language) => {
        const { departments, entry } = await this.labels(language);
        const vehicles = await this.em
          .fork()
          .find(
            Vehicle,
            { status: { $ne: 'retired' }, ...(params.departmentId ? { department: params.departmentId } : {}) },
            { populate: ['station'], orderBy: { designation: 'asc' } },
          );
        return {
          rows: vehicles.map((v) => ({
            designation: v.designation,
            radioCallSign: v.radioCallSign,
            type: entry('vehicle-type', v.vehicleType),
            department: departments.get(v.department.id) ?? '',
            station: v.station?.name ?? '',
            seats: v.seats,
            statisticsCategory: v.statisticsCategory,
          })),
        };
      },
    };
  }

  /** Open nominations ("Lehrgangsvormerkungen") of the persons the user may plan courses for. */
  private courseNominations(): ListDefinition<{ departmentId?: string }> {
    return {
      id: 'masterdata.course-nominations',
      name: { de: 'Lehrgangsvormerkungen', en: 'Course nominations' },
      permission: PLAN,
      parameters: [departmentParameter],
      schema: z.object({ departmentId: z.uuid().optional() }),
      columns: [
        col('course', 'Lehrgang', 'Course', 1.6),
        NAME,
        DEPARTMENT,
        col('priority', 'Priorität', 'Priority', 0.7),
        col('desiredPeriod', 'Gewünscht', 'Desired', 0.8),
        col('run', 'Termin', 'Date', 1),
        col('status', 'Status', 'Status', 1),
      ],
      orientation: 'landscape',
      rows: async (user, params, language) => {
        const { departments } = await this.labels(language);
        const visible = this.persons.visibleWhere(user, PLAN) ?? { id: null };
        const nominations = await this.em.fork().find(
          CourseNomination,
          { person: visible, status: { $in: [...OPEN_NOMINATION] } },
          { populate: ['course', 'run', 'person.memberships.department'], orderBy: { course: { sortOrder: 'asc' }, priority: 'asc', createdAt: 'asc' } },
        );
        const priorities: Record<number, LocalizedText> = { 1: { de: 'hoch', en: 'high' }, 2: { de: 'mittel', en: 'medium' }, 3: { de: 'niedrig', en: 'low' } };
        const statuses: Record<string, LocalizedText> = {
          nominated: { de: 'vorgemerkt', en: 'nominated' },
          registered: { de: 'angemeldet', en: 'registered' },
          confirmed: { de: 'Platz zugesagt', en: 'place confirmed' },
        };
        return {
          rows: nominations
            .filter((n) => !params.departmentId || activeMemberships(n.person).some((m) => m.department.id === params.departmentId))
            .map((n) => ({
              course: n.course.name[language],
              name: name(n.person),
              department: departments.get(primaryDepartment(n.person) ?? '') ?? '',
              priority: priorities[n.priority]?.[language] ?? String(n.priority),
              desiredPeriod: n.desiredPeriod,
              run: n.run ? [n.run.startsOn, n.run.endsOn].filter(Boolean).join(' – ') : '',
              status: statuses[n.status]?.[language] ?? n.status,
            })),
        };
      },
    };
  }

  /** Course attendances of a year ("Lehrgänge im Jahr"), e.g. for the annual report. */
  private courseYear(): ListDefinition<{ year?: number; departmentId?: string }> {
    return {
      id: 'masterdata.course-year',
      name: { de: 'Lehrgänge im Jahr', en: 'Courses of the year' },
      permission: PLAN,
      parameters: [{ key: 'year', label: { de: 'Jahr', en: 'Year' }, type: 'year' }, departmentParameter],
      schema: z.object({ year: z.coerce.number().int().min(1900).max(2200).optional(), departmentId: z.uuid().optional() }),
      columns: [
        col('course', 'Lehrgang', 'Course', 1.6),
        col('startsOn', 'Beginn', 'Start'),
        col('endsOn', 'Ende', 'End'),
        col('location', 'Ort', 'Location', 1.2),
        NAME,
        DEPARTMENT,
        col('result', 'Ergebnis', 'Result', 0.9),
      ],
      orientation: 'landscape',
      rows: async (user, params, language) => {
        const year = params.year ?? Number(today().slice(0, 4));
        const { departments } = await this.labels(language);
        const visible = this.persons.visibleWhere(user, PLAN) ?? { id: null };
        const attendances = await this.em.fork().find(
          CourseAttendance,
          { person: visible, startsOn: { $lte: `${year}-12-31` }, $or: [{ endsOn: { $gte: `${year}-01-01` } }, { endsOn: null, startsOn: { $gte: `${year}-01-01` } }] },
          { populate: ['course', 'person.memberships.department'], orderBy: { startsOn: 'asc' } },
        );
        return {
          subtitle: String(year),
          rows: attendances
            .filter((a) => !params.departmentId || a.person.memberships.getItems().some((m) => m.department.id === params.departmentId))
            .map((a) => ({
              course: courseLabel(a.course.name[language], a.description),
              startsOn: a.startsOn,
              endsOn: a.endsOn ?? null,
              location: a.location,
              name: name(a.person),
              department: departments.get(primaryDepartment(a.person, a.startsOn) ?? primaryDepartment(a.person) ?? '') ?? '',
              result: a.result === 'passed' ? (language === 'de' ? 'bestanden' : 'passed') : language === 'de' ? 'nicht bestanden' : 'failed',
            })),
        };
      },
    };
  }
}
