import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, LockMode } from '@mikro-orm/core';
import { SettingsService } from '@forga/core-api';
import { PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import {
  ATTENDANCE_TOLERANCE_MINUTES,
  CHECKED_IN_VIA_TERMINAL,
  type TerminalAttendance,
  TerminalCheckInInput,
  type TerminalSession,
  type TerminalSessionScope,
  terminalCheckInWindow,
  type TrainingSettings,
  type TrainingTerminalCheckIn,
} from '@forga/training-contracts';
import { AttendanceEntity, SessionEntity } from '../training.entities.js';

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/**
 * Check-in at an info terminal: like the QR check-in the attendance stays unconfirmed (`confirmed: false`) until the
 * list is saved, so a session with such check-ins cannot be closed. Only sessions of the department at the station of
 * the terminal (or without a station), never closed ones, and only within the window.
 */
@Injectable()
export class TerminalCheckInService implements TrainingTerminalCheckIn {
  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  private async beforeMinutes(): Promise<number> {
    return ((await this.settings.get<TrainingSettings>('training.general')) as TrainingSettings).checkInBeforeMinutes;
  }

  private summary(session: SessionEntity, beforeMinutes: number, scope: TerminalSessionScope): TerminalSession {
    const window = terminalCheckInWindow(
      { startsAt: session.startsAt.toISOString(), endsAt: session.endsAt.toISOString() },
      { beforeMinutes, afterEndMinutes: scope.afterEndMinutes },
    );
    return {
      sessionId: session.id,
      title: session.title,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      stationId: session.stationId ?? null,
      departmentIds: session.departmentIds,
      ...window,
      present: session.attendance.getItems().filter((a) => a.status === 'present').length,
    };
  }

  private inScope(session: SessionEntity, scope: TerminalSessionScope): boolean {
    return session.departmentIds.includes(scope.departmentId) && (!session.stationId || session.stationId === scope.stationId) && session.status !== 'closed';
  }

  async sessions(scope: TerminalSessionScope, from: Date, to: Date): Promise<TerminalSession[]> {
    const before = await this.beforeMinutes();
    const sessions = await this.em.fork().find(
      SessionEntity,
      {
        departmentIds: { $contains: [scope.departmentId] },
        status: { $ne: 'closed' },
        $and: [{ $or: [{ stationId: null }, { stationId: scope.stationId }] }],
        endsAt: { $gte: new Date(from.getTime() - scope.afterEndMinutes * 60_000) },
        startsAt: { $lte: new Date(to.getTime() + before * 60_000) },
      },
      { populate: ['attendance'], orderBy: { startsAt: 'asc' }, limit: 50 },
    );
    return sessions.map((s) => this.summary(s, before, scope));
  }

  /** The session of the scope while its window is open: `404` outside the scope, `409` outside the window or closed. */
  private async open(em: EntityManager, sessionId: string, scope: TerminalSessionScope, now: Date, lock = false) {
    const session = /^[0-9a-f-]{36}$/i.test(sessionId) ? await em.findOne(SessionEntity, sessionId, lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {}) : null;
    if (!session || !session.departmentIds.includes(scope.departmentId) || (session.stationId && session.stationId !== scope.stationId)) {
      throw new NotFoundException({ code: 'info-terminal.sessionNotFound' });
    }
    if (session.status === 'closed') throw new ConflictException({ code: 'training.closed' });
    await em.populate(session, ['attendance']);
    const summary = this.summary(session, await this.beforeMinutes(), scope);
    if (now < new Date(summary.opensAt) || now > new Date(summary.closesAt)) throw new ConflictException({ code: 'info-terminal.windowClosed' });
    return { session, summary };
  }

  private static editable(a: AttendanceEntity): boolean {
    return a.checkedInVia === CHECKED_IN_VIA_TERMINAL && !a.confirmed;
  }

  async session(sessionId: string, scope: TerminalSessionScope, now = new Date()) {
    const { session, summary } = await this.open(this.em.fork(), sessionId, scope, now);
    if (!this.inScope(session, scope)) throw new NotFoundException({ code: 'info-terminal.sessionNotFound' });
    // Persons whose processing is restricted (Art. 18) never appear at the info terminal.
    const restricted = await this.directory.restrictedIds(session.attendance.getItems().map((a) => a.personId));
    const attendance: TerminalAttendance[] = session.attendance
      .getItems()
      .filter((a) => a.status === 'present' && !restricted.has(a.personId))
      .map((a) => ({ personId: a.personId, role: a.role ?? null, breathingApparatus: a.breathingApparatus, from: iso(a.from), to: iso(a.to), editable: TerminalCheckInService.editable(a) }));
    return { session: summary, attendance };
  }

  async checkIn(sessionId: string, scope: TerminalSessionScope, raw: TerminalCheckInInput, now = new Date()): Promise<void> {
    const input = TerminalCheckInInput.parse(raw);
    const [person] = await this.directory.snapshots([input.personId]);
    if (!person || person.status === 'left' || (await this.directory.isRestricted(person.id))) throw new BadRequestException({ code: 'training.unknownPerson', personId: input.personId });
    await this.em.fork().transactional(async (em) => {
      const { session } = await this.open(em, sessionId, scope, now, true);
      // Own times inside the session, give or take the tolerance, like the attendance list.
      const from = input.from ? new Date(input.from) : session.startsAt;
      const to = input.to ? new Date(input.to) : session.endsAt;
      if (to <= from) throw new BadRequestException({ code: 'info-terminal.endBeforeStart' });
      const tolerance = ATTENDANCE_TOLERANCE_MINUTES * 60_000;
      if (from.getTime() < session.startsAt.getTime() - tolerance || to.getTime() > session.endsAt.getTime() + tolerance) {
        throw new BadRequestException({ code: 'training.attendanceOutsideSession', personId: input.personId });
      }
      const existing = session.attendance.getItems().find((a) => a.personId === input.personId);
      // Attendance confirmed by the person responsible (or checked in by QR) is not changed at the terminal.
      if (existing && existing.status === 'present' && !TerminalCheckInService.editable(existing)) throw new ConflictException({ code: 'info-terminal.entryLocked' });
      const values = {
        status: 'present' as const,
        role: input.role || null,
        breathingApparatus: input.breathingApparatus,
        from: input.from ? from : null,
        to: input.to ? to : null,
        // A new time tells the list being edited that the check-in changed (it keeps unseen check-ins).
        checkedInAt: now,
        checkedInVia: CHECKED_IN_VIA_TERMINAL,
        confirmed: false,
      };
      // An excuse sent before stays as note, like with the QR check-in.
      if (existing) Object.assign(existing, values);
      else session.attendance.add(em.create(AttendanceEntity, { session, personId: input.personId, injured: false, ...values }));
      if (session.status === 'planned') session.status = 'held';
    });
  }

  async cancel(sessionId: string, scope: TerminalSessionScope, personId: string, now = new Date()): Promise<void> {
    await this.em.fork().transactional(async (em) => {
      const { session } = await this.open(em, sessionId, scope, now, true);
      const row = session.attendance.getItems().find((a) => a.personId === personId);
      if (!row) throw new NotFoundException({ code: 'info-terminal.entryNotFound' });
      if (!TerminalCheckInService.editable(row)) throw new ConflictException({ code: 'info-terminal.entryLocked' });
      // Back to the excuse sent before, else the row goes.
      if (row.note) Object.assign(row, { status: 'excused', checkedInAt: null, checkedInVia: null, confirmed: true, role: null, breathingApparatus: false, from: null, to: null });
      else session.attendance.remove(row);
      session.status = session.attendance.getItems().some((a) => a.status === 'present') ? 'held' : 'planned';
    });
  }
}
