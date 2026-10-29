import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { berlinTime, type ImportContext, type ImportLookup, type ImportProfile, type ImportRow, type ImportRunResult, normalizeHeading, parseDate, parseLocalDateTime, ZodPipe } from '@forga/core-api';
import type { ImportMessage, ImportRowResult } from '@forga/core-contracts';
import { type AttendanceStatus, SessionTypeInput } from '@forga/training-contracts';
import { membersOnDate, ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { AttendanceEntity, SessionEntity, SessionTypeEntity } from '../training.entities.js';
import { PLAN, SETTINGS } from '../sessions/sessions.service.js';

const field = (key: string, de: string, en: string, aliases: string[], required = false) => ({ key, label: { de, en }, required, aliases });

/** One row per participant and session, e.g. exported from MP-Feuer "Übungen". */
const FIELDS = [
  field('date', 'Datum', 'Date', ['Datum', 'Übungsdatum', 'Tag'], true),
  field('start', 'Beginn', 'Start', ['Beginn', 'von', 'Uhrzeit']),
  field('end', 'Ende', 'End', ['Ende', 'bis']),
  field('type', 'Diensttyp', 'Session type', ['Typ', 'Art', 'Dienstart', 'Übungsart']),
  field('title', 'Titel / Thema', 'Title / topic', ['Thema', 'Titel', 'Bezeichnung'], true),
  field('department', 'Abteilung', 'Department', ['Abteilung', 'Abt.'], true),
  field('personName', 'Name', 'Name', ['Name', 'Teilnehmer']),
  field('personnelNumber', 'Personalnummer', 'Personnel number', ['Pers.-Nr.', 'Personalnummer']),
  field('attendance', 'Anwesenheit', 'Attendance', ['Anwesenheit', 'Teilnahme']),
  field('breathingApparatus', 'Atemschutz', 'Breathing apparatus', ['AS', 'Atemschutz']),
];

const YES = new Set(['ja', 'j', 'yes', 'true', 'wahr', '1', 'x']);
/** "entschuldigt", "krank", "Urlaub" count as excused, everything else as present. */
const attendanceStatus = (text: string | undefined): AttendanceStatus =>
  /entschuldigt|krank|urlaub|excused/i.test(text ?? '') ? 'excused' : /abwesend|unentschuldigt|absent/i.test(text ?? '') ? 'absent' : 'present';

const nameKey = (text: string) => text.toLowerCase().split(/[\s,]+/).filter(Boolean).toSorted().join(' ');
const time = (date: string, clock: string | undefined, fallback: string) => {
  const local = parseLocalDateTime(`${date} ${clock || fallback}`) ?? `${date}T${fallback}:00`;
  return berlinTime(local);
};

@Injectable()
export class SessionsImport {
  constructor(
    private readonly em: EntityManager,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  profile(): ImportProfile {
    return {
      id: 'training.sessions',
      name: { de: 'Dienste mit Teilnehmern', en: 'Sessions with participants' },
      description: {
        de: 'Eine Zeile je Teilnehmer und Dienst (z. B. MP-Feuer „Übungen“). Ein Dienst ist Abteilung + Datum + Beginn + Thema; ein erneuter Import ergänzt die Teilnehmer. Importierte Dienste sind durchgeführt, aber nicht abgeschlossen.',
        en: 'One row per participant and session (e.g. MP-Feuer "Übungen"). A session is department + date + start + topic; importing again adds participants. Imported sessions are held but not closed.',
      },
      permission: PLAN,
      fields: FIELDS,
      run: (rows, context) => this.run(rows, context),
    };
  }

  /** Session types for types of the file that are not known. */
  lookup(): ImportLookup {
    return {
      kind: 'session-type',
      name: { de: 'Diensttypen', en: 'Session types' },
      keyFormat: 'slug',
      entries: async () =>
        (await this.em.fork().find(SessionTypeEntity, { active: true }, { orderBy: { sortOrder: 'asc', key: 'asc' } })).map((t) => ({ key: t.key, name: t.name })),
      all: async () => (await this.em.fork().find(SessionTypeEntity, {})).map((t) => ({ key: t.key, name: t.name })),
      create: {
        permission: SETTINGS,
        run: async ({ key, name }) => {
          const em = this.em.fork();
          if (await em.count(SessionTypeEntity, { key })) throw new ConflictException({ code: 'catalog.keyTaken', key });
          const [last] = await em.find(SessionTypeEntity, {}, { orderBy: { sortOrder: 'desc' }, limit: 1 });
          const type = em.create(SessionTypeEntity, { ...new ZodPipe(SessionTypeInput).transform({ key, name: { de: name, en: name }, sortOrder: (last?.sortOrder ?? 0) + 10 }) });
          await em.flush();
          return { key: type.key, name: type.name };
        },
      },
    };
  }

  /** An apply runs in one transaction, so a part of a large import is taken over completely or not at all. */
  private async run(rows: ImportRow[], context: ImportContext): Promise<ImportRunResult> {
    const em = this.em.fork();
    return context.dryRun ? this.apply(em, rows, context) : em.transactional((tx) => this.apply(tx, rows, context));
  }

  private async apply(em: EntityManager, rows: ImportRow[], { user, dryRun, mapped, unmatched }: ImportContext): Promise<ImportRunResult> {
    const departments = await this.organization.departments();
    const types = await em.find(SessionTypeEntity, {});
    const results: ImportRowResult[] = [];
    const groups = new Map<string, ImportRow[]>();
    for (const row of rows) {
      const v = row.values;
      const key = [normalizeHeading(v['department'] ?? ''), v['date'], v['start'] ?? '', v['title']].join('|');
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const persons = await this.directory.memberPeriods();

    for (const [index, group] of [...groups.values()].entries()) {
      // Every query flushes the unit of work first; keeping it small keeps large imports linear.
      if (!dryRun && index > 0 && index % 50 === 0) {
        await em.flush();
        em.clear();
      }
      const first = group[0].values;
      const label = `${first['date']} ${first['title'] ?? ''}`.trim();
      const fail = (code: string, params?: Record<string, string>) => {
        for (const { row } of group) results.push({ row, action: 'error', label, messages: [{ code, params }] });
      };
      const date = parseDate(first['date'] ?? '');
      const wanted = normalizeHeading((first['department'] ?? '').replace(/^(abteilung|abt\.?)\s*/i, ''));
      const department = departments.find((d) => normalizeHeading(d.shortName) === wanted || normalizeHeading(d.name) === normalizeHeading(first['department'] ?? ''));
      if (!date) { fail('imports.invalidDate'); continue; }
      if (!department) { fail('masterdata.import.unknownDepartment', { name: first['department'] ?? '' }); continue; }
      if (!user.can(PLAN, department.id)) { fail('auth.forbidden'); continue; }
      // Unknown types become exercises unless the user chose a type for them.
      const typeSource = (first['type'] ?? '').trim();
      const typeText = normalizeHeading(typeSource);
      // Names first, then the chosen or remembered mappings; the user is asked only if neither matches.
      const matched = typeText
        ? (types.find((t) => t.key === typeText || normalizeHeading(t.name.de) === typeText || normalizeHeading(t.name.en) === typeText) ??
          types.find((t) => t.key === mapped('session-type', typeSource)))
        : undefined;
      const type = matched ?? types.find((t) => t.key === 'exercise') ?? types[0];
      if (!type) { fail('training.unknownType', { key: typeSource }); continue; }
      const startsAt = time(date, first['start'], '19:00');
      const endsAt = first['end'] ? time(date, first['end'], '21:00') : new Date(startsAt.getTime() + 2 * 3_600_000);

      const members = membersOnDate(persons, date);
      let session: SessionEntity | null = await em.findOne(SessionEntity, { title: first['title'], startsAt, departmentIds: { $overlap: [department.id] } }, { populate: ['attendance'] });
      if (session?.status === 'closed') { fail('training.closed'); continue; }
      const created = !session;
      // The type only matters for new sessions.
      const messages: ImportMessage[] = [];
      if (created && typeSource && !matched) {
        messages.push({ code: 'training.import.unknownType', params: { kind: 'session-type', value: typeSource } });
        unmatched('session-type', typeSource);
      }
      if (!session && !dryRun) {
        session = em.create(SessionEntity, { type: type.key, title: first['title'], startsAt, endsAt, departmentIds: [department.id], instructorIds: [], status: 'held' });
      }
      for (const [position, { row, values }] of group.entries()) {
        // Messages about the session appear once, at its first row.
        const rowMessages = position === 0 ? messages : [];
        // A row without a person only carries the session (e.g. a session without participants in a data transfer).
        if (!values['personName']?.trim() && !values['personnelNumber']?.trim()) {
          results.push({ row, action: created ? 'create' : 'unchanged', label, messages: rowMessages });
          continue;
        }
        // Personnel number first, otherwise "Last First" in any order among the members on that day.
        const personId = values['personnelNumber']
          ? (await this.directory.findByPersonnelNumber(values['personnelNumber']))?.id
          : members.find((m) => nameKey(`${m.lastName} ${m.firstName}`) === nameKey(values['personName'] ?? ''))?.id;
        if (!personId) {
          results.push({ row, action: 'error', label, messages: [{ code: 'training.import.unknownPerson', params: { name: values['personName'] ?? values['personnelNumber'] ?? '' } }] });
          continue;
        }
        const exists = session?.attendance.getItems().some((a) => a.personId === personId);
        if (!exists && session && !dryRun) {
          session.attendance.add(
            em.create(AttendanceEntity, {
              session,
              personId,
              status: attendanceStatus(values['attendance']),
              breathingApparatus: YES.has((values['breathingApparatus'] ?? '').trim().toLowerCase()),
              injured: false,
            }),
          );
        }
        results.push({ row, action: exists ? 'unchanged' : created ? 'create' : 'update', label, messages: rowMessages });
      }
    }
    if (!dryRun) await em.flush();
    const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
    for (const r of results) counts[r.action]++;
    return { dryRun, counts, rows: results.toSorted((a, b) => a.row - b.row) };
  }
}
