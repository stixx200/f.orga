import { Injectable } from '@nestjs/common';
import { berlinDayEnd, HistoryEntry, wordsWhere } from '@forga/core-api';
import { EntityManager, wrap } from '@mikro-orm/core';
import type { AuthenticatedUser, DeadlineInput, DeadlineProvider, DescribeContext, PersonDataSection } from '@forga/core-api';
import type { SearchHit } from '@forga/core-contracts';
import { AttendanceEntity, SessionEntity, SessionTypeEntity } from '../training.entities.js';
import { ATTENDANCE, CLOSE, READ, SessionsService } from '../sessions/sessions.service.js';

const DAY = 86_400_000;

/** Search, export and deadlines of the training module. */
@Injectable()
export class TrainingData implements DeadlineProvider {
  readonly module = 'training';

  constructor(
    private readonly em: EntityManager,
    private readonly sessions: SessionsService,
  ) {}

  async search(user: AuthenticatedUser, query: string): Promise<SearchHit[]> {
    const visible = this.sessions.visible(user, READ);
    if (!visible) return [];
    const words = wordsWhere(query, ['title', 'topic']);
    if (!words) return [];
    const found = await this.em.fork().find(SessionEntity, { $and: [visible, words] } as never, { orderBy: { startsAt: 'desc' }, limit: 6 });
    return found.map((s) => ({
      id: s.id,
      group: { de: 'Dienste', en: 'Sessions' },
      title: s.title,
      description: s.startsAt.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' }),
      to: `/training/sessions/${s.id}`,
    }));
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const plain = async <T extends object>(entity: new () => T) => (await em.find(entity, {})).map((e) => wrap(e).toObject());
    return { sessionTypes: await plain(SessionTypeEntity), sessions: await plain(SessionEntity), attendance: await plain(AttendanceEntity) };
  }

  async exportPerson(personId: string): Promise<Record<string, unknown>> {
    const rows = await this.em.fork().find(AttendanceEntity, { personId }, { populate: ['session'] });
    return { attendance: rows.map((a) => ({ ...wrap(a).toObject(), session: { id: a.session.id, title: a.session.title, startsAt: a.session.startsAt } })) };
  }

  /**
   * Access report: attendance at sessions with excuses (reason and own text), and sessions the person led or taught.
   * Other participants are not named.
   */
  async describePerson(personId: string, ctx: DescribeContext): Promise<PersonDataSection[]> {
    const em = this.em.fork();
    const attendance = await em.find(AttendanceEntity, { personId }, { populate: ['session'] });
    const led = await em.find(SessionEntity, { $or: [{ responsiblePersonId: personId }, { instructorIds: { $contains: [personId] } }] }, { orderBy: { startsAt: 'desc' } });
    if (!attendance.length && !led.length) return [];
    const types = new Map((await em.find(SessionTypeEntity, {})).map((t) => [t.key, ctx.text(t.name)]));
    const session = (s: SessionEntity) => [s.title, types.get(s.type)].filter(Boolean).join(' · ');
    const status = { present: ctx.t('anwesend', 'present'), excused: ctx.t('entschuldigt', 'excused'), absent: ctx.t('abwesend', 'absent') };
    const reasons = {
      work: ctx.t('Arbeit', 'work'),
      private: ctx.t('privat', 'private'),
      sick: ctx.t('krank', 'sick'),
      vacation: ctx.t('Urlaub', 'vacation'),
      other: ctx.t('sonstiges', 'other'),
    };
    const sorted = attendance.toSorted((a, b) => b.session.startsAt.getTime() - a.session.startsAt.getTime());
    const hours = (a: AttendanceEntity) => ((a.to ?? a.session.endsAt).getTime() - (a.from ?? a.session.startsAt).getTime()) / 3_600_000;
    const years = new Map<string, { present: number; hours: number; total: number }>();
    for (const a of sorted) {
      const year = ctx.date(a.session.startsAt).slice(-4);
      const sum = years.get(year) ?? { present: 0, hours: 0, total: 0 };
      sum.total += 1;
      if (a.status === 'present') {
        sum.present += 1;
        sum.hours += Math.max(0, hours(a));
      }
      years.set(year, sum);
    }
    const blocks: PersonDataSection['blocks'] = [];
    if (sorted.length) {
      blocks.push({
        kind: 'table',
        title: ctx.t('Anwesenheit bei Diensten', 'Attendance at sessions'),
        columns: [ctx.t('Datum', 'Date'), ctx.t('Dienst', 'Session'), ctx.t('Zeit', 'Time'), ctx.t('Stand', 'Status'), ctx.t('Funktion', 'Function'), ctx.t('Atemschutz', 'Breathing apparatus'), ctx.t('Bemerkung', 'Remark')],
        rows: sorted.map((a) => [
          ctx.date(a.session.startsAt),
          session(a.session),
          `${ctx.time(a.from ?? a.session.startsAt)}–${ctx.time(a.to ?? a.session.endsAt)}`,
          [status[a.status], a.excuseReason ? reasons[a.excuseReason] : '', a.checkedInVia === 'info-terminal' ? ctx.t('am Infoterminal eingetragen', 'checked in at the info terminal') : a.checkedInVia === 'qr' ? ctx.t('per QR-Code eingetragen', 'checked in by QR code') : '']
            .filter(Boolean)
            .join(', '),
          ctx.value(a.role),
          a.breathingApparatus ? [ctx.t('ja', 'yes'), typeof a.kilojoules === 'number' ? `${ctx.number(a.kilojoules)} kJ` : '', a.passed === null || a.passed === undefined ? '' : a.passed ? ctx.t('bestanden', 'passed') : ctx.t('nicht bestanden', 'not passed')].filter(Boolean).join(', ') : ctx.t('nein', 'no'),
          [a.injured ? ctx.t('verletzt', 'injured') : '', a.note].filter(Boolean).join('; ') || '–',
        ]),
        summary: [...years].map(([year, sum]) =>
          ctx.t(`${year}: ${sum.present} von ${sum.total} Diensten anwesend, ${ctx.number(sum.hours, 1)} Stunden`, `${year}: present at ${sum.present} of ${sum.total} sessions, ${ctx.number(sum.hours, 1)} hours`),
        ),
      });
    }
    if (led.length) {
      blocks.push({
        kind: 'table',
        title: ctx.t('Dienste, die Sie verantwortet oder ausgebildet haben', 'Sessions you were responsible for or taught'),
        columns: [ctx.t('Datum', 'Date'), ctx.t('Dienst', 'Session'), ctx.t('Aufgabe', 'Task')],
        rows: led.map((s) => [
          ctx.date(s.startsAt),
          session(s),
          [s.responsiblePersonId === personId ? ctx.t('verantwortlich', 'responsible') : '', s.instructorIds.includes(personId) ? ctx.t('Ausbilder', 'instructor') : ''].filter(Boolean).join(', '),
        ]),
      });
    }
    return [
      {
        key: 'training',
        title: ctx.t('Dienste', 'Sessions'),
        activity: 'training.sessions',
        categories: [ctx.t('Anwesenheit und Dienstzeiten', 'Attendance and times'), ctx.t('Entschuldigungen mit Grund', 'Excuses with reason')],
        // „krank“ as reason of an excuse tells something about the health of the person.
        health: attendance.some((a) => a.excuseReason === 'sick' || a.injured),
        blocks,
        records: [{ entity: 'training.attendance', ids: attendance.map((a) => a.id), label: ctx.t('Anwesenheit', 'Attendance') }],
      },
    ];
  }

  /** Anonymised persons: excuse texts of their attendances are emptied, and so is the history holding them. */
  async anonymize(personIds: readonly string[]): Promise<void> {
    const em = this.em.fork();
    const attendances = await em.find(AttendanceEntity, { personId: { $in: [...personIds] } });
    if (!attendances.length) return;
    await em.nativeUpdate(AttendanceEntity, { personId: { $in: [...personIds] } }, { note: '', excuseReason: null });
    await em.nativeDelete(HistoryEntry, { entity: 'training.attendance', entityId: { $in: attendances.map((a) => a.id) } });
  }

  /** Past sessions without attendance (for those who record it) and held sessions not closed after 14 days. */
  async deadlines(asOf: string): Promise<DeadlineInput[]> {
    const now = berlinDayEnd(asOf);
    const sessions = await this.em.fork().find(SessionEntity, { status: { $in: ['planned', 'held'] }, endsAt: { $lt: now } });
    return sessions.map((s) => {
      const held = s.status === 'held';
      const due = new Date(s.endsAt.getTime() + (held ? 14 : 2) * DAY).toISOString().slice(0, 10);
      return {
        id: `${held ? 'close' : 'attendance'}:${s.id}`,
        kind: held ? 'session-close' : 'session-attendance',
        title: held ? { de: 'Dienst abschließen', en: 'Close session' } : { de: 'Anwesenheit erfassen', en: 'Record attendance' },
        subject: { type: 'training.session', id: s.id, label: `${s.title} (${s.startsAt.toISOString().slice(0, 10)})` },
        dueOn: due,
        leadDays: 14,
        departmentIds: s.departmentIds,
        permission: held ? CLOSE : ATTENDANCE,
      };
    });
  }
}
