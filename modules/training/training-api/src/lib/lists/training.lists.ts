import { Inject, Injectable } from '@nestjs/common';
import { berlinDayStart, berlinDayAfter } from '@forga/core-api';
import { EntityManager } from '@mikro-orm/core';
import { z } from 'zod';
import type { Language, ListColumn } from '@forga/core-contracts';
import type { AuthenticatedUser, ListDefinition } from '@forga/core-api';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { SessionEntity, SessionTypeEntity } from '../training.entities.js';
import { participation } from '../sessions/participation.js';
import { READ, SessionsService } from '../sessions/sessions.service.js';

const col = (key: string, de: string, en: string, width?: number, align?: ListColumn['align']): ListColumn => ({ key, label: { de, en }, ...(width ? { width } : {}), ...(align ? { align } : {}) });
const thisYear = () => new Date().getFullYear();
const Period = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), departmentId: z.uuid().optional() });
type Period = z.infer<typeof Period>;
const period = (p: Period) => ({ from: p.from ?? `${thisYear()}-01-01`, to: p.to ?? `${thisYear()}-12-31` });
const periodParameters = [
  { key: 'from', label: { de: 'Von', en: 'From' }, type: 'date' as const },
  { key: 'to', label: { de: 'Bis', en: 'To' }, type: 'date' as const },
  { key: 'departmentId', label: { de: 'Abteilung', en: 'Department' }, type: 'department' as const },
];
const SessionParam = z.object({ sessionId: z.uuid() });
const YearParams = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional(), departmentId: z.uuid().optional() });
const dateTime = (d: Date, language: Language) =>
  d.toLocaleString(language === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' });
const hours = (from: Date, to: Date) => Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 10) / 10;

/** List templates of the training module. */
@Injectable()
export class TrainingLists {
  constructor(
    private readonly em: EntityManager,
    private readonly sessions: SessionsService,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  definitions(): ListDefinition<never>[] {
    return [this.schedule(), this.serviceBook(), this.participation(), this.participants(), this.signatures(), this.instructors()] as ListDefinition<never>[];
  }

  private async load(user: AuthenticatedUser, params: Period) {
    const { from, to } = period(params);
    const visible = this.sessions.visible(user, READ) ?? { id: null };
    const where = {
      $and: [
        visible,
        { startsAt: { $gte: berlinDayStart(from), $lt: berlinDayAfter(to) } },
        params.departmentId ? { departmentIds: { $overlap: [params.departmentId] } } : {},
      ],
    };
    const sessions = await this.em.fork().find(SessionEntity, where as never, { populate: ['attendance'], orderBy: { startsAt: 'asc' } });
    const types = new Map((await this.em.fork().find(SessionTypeEntity, {})).map((t) => [t.key, t]));
    return { from, to, sessions, types };
  }

  private async names(ids: string[]): Promise<Map<string, string>> {
    const persons = await this.directory.snapshots([...new Set(ids)]);
    return new Map(persons.map((p) => [p.id, `${p.lastName}, ${p.firstName}`]));
  }

  /** Training schedule of a year (Dienstplan), e.g. to hand out or pin up per department. */
  private schedule(): ListDefinition<z.infer<typeof YearParams>> {
    return {
      id: 'training.schedule',
      name: { de: 'Dienstplan', en: 'Training schedule' },
      description: { de: 'Alle Dienste eines Jahres mit Zeit, Ort und Verantwortlichem, je Abteilung oder gesamt', en: 'All sessions of a year with time, place and person responsible, per department or in total' },
      permission: READ,
      parameters: [
        { key: 'year', label: { de: 'Jahr', en: 'Year' }, type: 'year' },
        { key: 'departmentId', label: { de: 'Abteilung', en: 'Department' }, type: 'department' },
      ],
      schema: YearParams,
      orientation: 'landscape',
      columns: [
        col('date', 'Datum', 'Date', 1.3),
        col('time', 'Zeit', 'Time'),
        col('type', 'Art', 'Type'),
        col('title', 'Thema', 'Topic', 2.5),
        col('place', 'Ort', 'Place', 1.3),
        col('departments', 'Abteilungen', 'Departments', 1.2),
        col('responsible', 'Verantwortlich', 'Responsible', 1.5),
      ],
      rows: async (user, params, language) => {
        const year = params.year ?? thisYear();
        const { sessions, types } = await this.load(user, { from: `${year}-01-01`, to: `${year}-12-31`, departmentId: params.departmentId });
        const [names, stations, departments] = await Promise.all([this.names(sessions.flatMap((s) => (s.responsiblePersonId ? [s.responsiblePersonId] : []))), this.organization.stations(), this.organization.departments()]);
        const locale = language === 'de' ? 'de-DE' : 'en-GB';
        const department = departments.find((d) => d.id === params.departmentId);
        const time = (d: Date) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
        return {
          subtitle: [String(year), department?.name].filter(Boolean).join(' · '),
          rows: sessions.map((s) => ({
            date: s.startsAt.toLocaleDateString(locale, { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin' }),
            time: `${time(s.startsAt)} – ${time(s.endsAt)}`,
            type: types.get(s.type)?.name[language] ?? s.type,
            title: [s.title, s.topic].filter(Boolean).join(': '),
            place: stations.find((x) => x.id === s.stationId)?.name ?? '',
            departments: s.departmentIds.map((id) => departments.find((d) => d.id === id)?.shortName ?? '').join(', '),
            responsible: s.responsiblePersonId ? (names.get(s.responsiblePersonId) ?? '') : '',
          })),
        };
      },
    };
  }

  private serviceBook(): ListDefinition<Period> {
    return {
      id: 'training.service-book',
      name: { de: 'Dienstbuch', en: 'Service book' },
      permission: READ,
      parameters: periodParameters,
      schema: Period,
      orientation: 'landscape',
      columns: [col('date', 'Datum', 'Date'), col('type', 'Art', 'Type'), col('title', 'Titel', 'Title', 1.5), col('topic', 'Thema', 'Topic', 2), col('instructors', 'Ausbilder', 'Instructors', 1.5), col('present', 'Teilnehmer', 'Participants', 0.8, 'right')],
      rows: async (user, params, language) => {
        const { from, to, sessions, types } = await this.load(user, params);
        const names = await this.names(sessions.flatMap((s) => s.instructorIds));
        return {
          subtitle: `${from} – ${to}`,
          rows: sessions.map((s) => ({
            date: dateTime(s.startsAt, language),
            type: types.get(s.type)?.name[language] ?? s.type,
            title: s.title,
            topic: s.topic,
            instructors: s.instructorIds.map((id) => names.get(id) ?? '').join('; '),
            present: s.attendance.getItems().filter((a) => a.status === 'present').length,
          })),
        };
      },
    };
  }

  private participation(): ListDefinition<Period> {
    return {
      id: 'training.participation',
      name: { de: 'Dienstbeteiligung', en: 'Participation' },
      permission: READ,
      parameters: periodParameters,
      schema: Period,
      // The rate counts the sessions of the person's departments while a member, not all sessions of the brigade.
      columns: [
        col('name', 'Name', 'Name', 2),
        col('department', 'Abteilung', 'Department', 1.2),
        col('sessions', 'Dienste', 'Sessions', 0.8, 'right'),
        col('present', 'anwesend', 'present', 1, 'right'),
        col('excused', 'entschuldigt', 'excused', 1, 'right'),
        col('rate', 'Quote %', 'Rate %', 1, 'right'),
        col('hours', 'Stunden', 'Hours', 1, 'right'),
      ],
      rows: async (user, params) => {
        const { from, to, sessions, types } = await this.load(user, params);
        const counted = sessions.filter((s) => s.status !== 'planned' && types.get(s.type)?.countsForParticipation !== false);
        const rows = participation(
          counted.map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt, departmentIds: s.departmentIds, attendance: s.attendance.getItems().map((a) => ({ personId: a.personId, status: a.status, from: a.from ?? null, to: a.to ?? null })) })),
          await this.directory.memberPeriods(),
          { to, departmentId: params.departmentId },
        );
        const [names, departments] = await Promise.all([this.names(rows.map((r) => r.personId)), this.organization.departments()]);
        const shortNames = new Map(departments.map((d) => [d.id, d.shortName]));
        return {
          subtitle: `${from} – ${to} · ${counted.length}`,
          rows: rows
            .map((r) => ({ name: names.get(r.personId) ?? '', department: shortNames.get(r.departmentId ?? '') ?? '', sessions: r.sessions, present: r.present, excused: r.excused, rate: r.rate, hours: r.hours }))
            .toSorted((a, b) => String(a.name).localeCompare(String(b.name))),
        };
      },
    };
  }

  private participants(): ListDefinition<z.infer<typeof SessionParam>> {
    return {
      id: 'training.participants',
      name: { de: 'Teilnehmerliste', en: 'Participants' },
      permission: READ,
      parameters: [{ key: 'sessionId', label: { de: 'Dienst (ID)', en: 'Session (ID)' }, type: 'text', required: true }],
      schema: SessionParam,
      columns: [col('name', 'Name', 'Name', 2), col('status', 'Status', 'Status'), col('role', 'Funktion', 'Role'), col('ba', 'Atemschutz', 'BA', 0.8, 'center')],
      rows: async (user, params, language) => {
        const session = await this.sessions.load(this.em.fork(), params.sessionId, user);
        const names = await this.names(session.attendance.getItems().map((a) => a.personId));
        const status = { present: { de: 'anwesend', en: 'present' }, excused: { de: 'entschuldigt', en: 'excused' }, absent: { de: 'unentschuldigt', en: 'absent' } };
        return {
          subtitle: `${session.title} · ${dateTime(session.startsAt, language)}`,
          rows: session.attendance
            .getItems()
            .map((a) => ({ name: names.get(a.personId) ?? '', status: status[a.status][language], role: a.role ?? '', ba: a.breathingApparatus }))
            .toSorted((a, b) => String(a.name).localeCompare(String(b.name))),
        };
      },
    };
  }

  private signatures(): ListDefinition<z.infer<typeof SessionParam>> {
    return {
      id: 'training.signatures',
      name: { de: 'Unterschriftenliste Dienst', en: 'Signature list (session)' },
      permission: READ,
      parameters: [{ key: 'sessionId', label: { de: 'Dienst (ID)', en: 'Session (ID)' }, type: 'text', required: true }],
      schema: SessionParam,
      signatureColumn: true,
      columns: [col('name', 'Name', 'Name', 2), col('department', 'Abteilung', 'Department')],
      rows: async (user, params, language) => {
        const session = await this.sessions.load(this.em.fork(), params.sessionId, user);
        const date = session.startsAt.toISOString().slice(0, 10);
        const members = (await this.directory.membersOn(date)).filter((p) => p.departmentIds.some((d) => session.departmentIds.includes(d)) && ['active', 'probation', 'youth'].includes(p.status));
        const departments = new Map((await this.organization.departments()).map((d) => [d.id, d.shortName]));
        return {
          subtitle: `${session.title} · ${dateTime(session.startsAt, language)}`,
          rows: members
            .map((p) => ({ name: `${p.lastName}, ${p.firstName}`, department: departments.get(p.primaryDepartmentId ?? '') ?? '' }))
            .toSorted((a, b) => a.name.localeCompare(b.name)),
        };
      },
    };
  }

  private instructors(): ListDefinition<Period> {
    return {
      id: 'training.instructor-hours',
      name: { de: 'Ausbilderstunden', en: 'Instructor hours' },
      permission: READ,
      parameters: periodParameters,
      schema: Period,
      columns: [col('name', 'Name', 'Name', 2), col('sessions', 'Dienste', 'Sessions', 1, 'right'), col('hours', 'Stunden', 'Hours', 1, 'right')],
      rows: async (user, params) => {
        const { from, to, sessions } = await this.load(user, params);
        const totals = new Map<string, { sessions: number; hours: number }>();
        for (const s of sessions.filter((x) => x.status !== 'planned')) {
          for (const id of s.instructorIds) {
            const t = totals.get(id) ?? { sessions: 0, hours: 0 };
            t.sessions++;
            t.hours += hours(s.startsAt, s.endsAt);
            totals.set(id, t);
          }
        }
        const names = await this.names([...totals.keys()]);
        return { subtitle: `${from} – ${to}`, rows: [...totals].map(([id, t]) => ({ name: names.get(id) ?? '', sessions: t.sessions, hours: Math.round(t.hours * 10) / 10 })) };
      },
    };
  }
}
