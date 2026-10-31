import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { addBerlinDays, assertVersion, Attachments, Audit, type AuthenticatedUser, berlinDate, berlinDayAfter, berlinDayEnd, berlinDayStart, DomainEvents, SettingsService } from '@forga/core-api';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import {
  ATTENDANCE_TOLERANCE_MINUTES,
  AttendanceInput,
  CHECK_IN_ROTATION_SECONDS,
  type CheckIn,
  type Session,
  type SessionClosedEvent,
  type SessionReopenedEvent,
  type SessionCopyResult,
  SessionInput,
  TRAINING_EVENTS,
  type SessionCategory,
  type PersonalSession,
  type PersonalUpcoming,
  type SessionReference,
  type TrainingCasualties,
  type TrainingSessions,
  type TrainingSettings,
} from '@forga/training-contracts';
import { AttendanceEntity, SessionEntity, SessionTypeEntity } from '../training.entities.js';

export const READ = 'training.read';
export const PLAN = 'training.plan';
export const ATTENDANCE = 'training.attendance';
export const CLOSE = 'training.close';
export const SETTINGS = 'training.settings.manage';

type ParsedSession = ReturnType<typeof SessionInput.parse>;

/** Identifies a copy: same type, title, start and departments. */
const copyKey = (s: { type: string; title: string; startsAt: Date; departmentIds: string[] }) => `${s.type}|${s.title}|${s.startsAt.getTime()}|${s.departmentIds.toSorted().join(',')}`;
type ParsedAttendance = ReturnType<typeof AttendanceInput.parse>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Number of the current period of the rotating check-in code. */
const checkInPeriod = (now: Date) => Math.floor(now.getTime() / (CHECK_IN_ROTATION_SECONDS * 1000));
/** Signature of a check-in code: HMAC of session and period with the session's secret. */
const checkInSignature = (secret: string, sessionId: string, period: number) => createHmac('sha256', secret).update(`${sessionId}:${period}`).digest('base64url').slice(0, 22);
const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
/** Minutes a check-in ticket stays valid: time to log in after scanning the QR code. */
export const CHECK_IN_TICKET_MINUTES = 10;
/** Signature of a check-in ticket: HMAC of session and expiry (seconds) with the session's secret. */
const ticketSignature = (secret: string, sessionId: string, expires: number) => createHmac('sha256', secret).update(`${sessionId}:ticket:${expires}`).digest('base64url').slice(0, 22);

@Injectable()
export class SessionsService implements TrainingCasualties, TrainingSessions {
  constructor(
    private readonly em: EntityManager,
    private readonly events: DomainEvents,
    private readonly settings: SettingsService,
    private readonly attachments: Attachments,
    private readonly audit: Audit,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  /** Sessions of departments the user may read (brigade-wide: all). */
  visible(user: AuthenticatedUser, permission = READ): FilterQuery<SessionEntity> | null {
    const grant = user.grant(permission);
    if (!grant) return null;
    if (grant === 'brigade') return {};
    return { departmentIds: { $overlap: grant } };
  }

  can(user: AuthenticatedUser, permission: string, session: Pick<SessionEntity, 'departmentIds'>): boolean {
    return session.departmentIds.some((id) => user.can(permission, id));
  }

  async load(em: EntityManager, id: string, user: AuthenticatedUser): Promise<SessionEntity> {
    const session = await em.findOne(SessionEntity, id, { populate: ['attendance'] });
    if (!session || !this.can(user, READ, session)) throw new NotFoundException();
    return session;
  }

  async sessions(sessionIds: readonly string[]): Promise<SessionReference[]> {
    if (!sessionIds.length) return [];
    const sessions = await this.em.fork().find(SessionEntity, { id: { $in: [...sessionIds] } });
    return sessions.map((s) => ({ sessionId: s.id, departmentIds: [...s.departmentIds], status: s.status }));
  }

  /** Next sessions of the given departments for the personal access link. */
  async upcomingForDepartments(departmentIds: readonly string[]): Promise<PersonalUpcoming[]> {
    if (!departmentIds.length) return [];
    const em = this.em.fork();
    const now = new Date();
    const [sessions, types] = await Promise.all([
      em.find(SessionEntity, { departmentIds: { $overlap: [...departmentIds] }, endsAt: { $gte: now }, status: { $ne: 'closed' } }, { orderBy: { startsAt: 'asc' }, limit: 10 }),
      em.find(SessionTypeEntity, {}),
    ]);
    const names = new Map(types.map((type) => [type.key, type.name]));
    return sessions.map((session) => ({
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      title: session.title,
      typeName: names.get(session.type) ?? { de: session.type, en: session.type },
    }));
  }

  /** Newest sessions of a person for the personal access link. The excuse note stays out. */
  async recentForPerson(personId: string): Promise<PersonalSession[]> {
    const sessions = await this.em.fork().find(SessionEntity, { attendance: { personId } }, { populate: ['attendance'], orderBy: { startsAt: 'desc' }, limit: 15 });
    return sessions.flatMap((session) => {
      const own = session.attendance.getItems().find((row) => row.personId === personId);
      return own ? [{ startsAt: session.startsAt.toISOString(), title: session.title, status: own.status }] : [];
    });
  }

  /** Sessions in a period; `category` keeps those whose type belongs to it (e.g. only special services). */
  async list(user: AuthenticatedUser, filter: { from?: string; to?: string; departmentId?: string; type?: string; category?: SessionCategory }): Promise<Session[]> {
    const visible = this.visible(user);
    if (!visible) return [];
    const where: FilterQuery<SessionEntity>[] = [visible];
    if (filter.from) where.push({ startsAt: { $gte: berlinDayStart(filter.from) } });
    if (filter.to) where.push({ startsAt: { $lt: berlinDayAfter(filter.to) } });
    if (filter.departmentId) where.push({ departmentIds: { $overlap: [filter.departmentId] } });
    if (filter.type) where.push({ type: filter.type });
    const em = this.em.fork();
    if (filter.category) where.push({ type: { $in: (await em.find(SessionTypeEntity, { category: filter.category })).map((t) => t.key) } });
    const sessions = await em.find(SessionEntity, { $and: where }, { populate: ['attendance'], orderBy: { startsAt: 'asc' }, limit: 1000 });
    return sessions.map((s) => this.toDtoFor(user, s, []));
  }

  async requireType(em: EntityManager, key: string): Promise<SessionTypeEntity> {
    const type = await em.findOne(SessionTypeEntity, { key });
    if (!type) throw new BadRequestException({ code: 'training.unknownType', key });
    return type;
  }

  private assertPlan(user: AuthenticatedUser, departmentIds: string[]): void {
    const missing = departmentIds.filter((id) => !user.can(PLAN, id));
    if (missing.length) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [PLAN] });
  }

  async create(user: AuthenticatedUser, input: ParsedSession): Promise<SessionEntity> {
    this.assertPlan(user, input.departmentIds);
    const em = this.em.fork();
    await this.requireType(em, input.type);
    const session = em.create(SessionEntity, this.fields(input));
    await em.flush();
    return session;
  }

  /** Creates the session and copies of it every `intervalWeeks` weeks until the given date (at most 60). */
  async createSeries(user: AuthenticatedUser, input: ParsedSession, intervalWeeks: number, until: string): Promise<SessionEntity[]> {
    this.assertPlan(user, input.departmentIds);
    const em = this.em.fork();
    await this.requireType(em, input.type);
    const last = berlinDayEnd(until);
    const created: SessionEntity[] = [];
    // Same local time each week, also after a daylight saving change.
    for (let i = 0; i < 60; i++) {
      const startsAt = addBerlinDays(new Date(input.startsAt), i * intervalWeeks * 7);
      if (startsAt > last) break;
      const endsAt = addBerlinDays(new Date(input.endsAt), i * intervalWeeks * 7);
      created.push(em.create(SessionEntity, this.fields({ ...input, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })));
    }
    await em.flush();
    return created;
  }

  /**
   * Copies the sessions of the period the user may plan in all their departments. A copy that already exists
   * (same type, title, start and departments) is skipped, so copying twice creates nothing new.
   */
  async copy(user: AuthenticatedUser, input: { from: string; to: string; weeks: number; departmentId: string | null }): Promise<SessionCopyResult> {
    const em = this.em.fork();
    const where: FilterQuery<SessionEntity>[] = [{ startsAt: { $gte: berlinDayStart(input.from), $lt: berlinDayAfter(input.to) } }];
    if (input.departmentId) where.push({ departmentIds: { $overlap: [input.departmentId] } });
    const sources = (await em.find(SessionEntity, { $and: where }, { orderBy: { startsAt: 'asc' } })).filter((s) => s.departmentIds.every((d) => user.can(PLAN, d)));
    const shift = input.weeks * 7;
    const shifted = sources.map((s) => ({ source: s, startsAt: addBerlinDays(s.startsAt, shift), endsAt: addBerlinDays(s.endsAt, shift) }));
    const existing = shifted.length
      ? await em.find(SessionEntity, { startsAt: { $in: [...new Set(shifted.map((c) => c.startsAt.getTime()))].map((t) => new Date(t)) } })
      : [];
    const known = new Set(existing.map(copyKey));
    let created = 0;
    for (const { source, startsAt, endsAt } of shifted) {
      const fields = { ...this.copyFields(source), startsAt, endsAt };
      if (known.has(copyKey(fields))) continue;
      known.add(copyKey(fields));
      em.create(SessionEntity, fields);
      created++;
    }
    await em.flush();
    return { created, skipped: shifted.length - created };
  }

  private copyFields(s: SessionEntity) {
    return {
      type: s.type,
      title: s.title,
      stationId: s.stationId ?? null,
      departmentIds: [...s.departmentIds],
      responsiblePersonId: s.responsiblePersonId ?? null,
      instructorIds: [...s.instructorIds],
      topic: s.topic,
      goals: s.goals,
      procedure: s.procedure,
      material: s.material,
    };
  }

  async update(user: AuthenticatedUser, id: string, input: ParsedSession): Promise<SessionEntity> {
    const em = this.em.fork();
    const session = await this.load(em, id, user);
    assertVersion(session, input.version);
    this.assertPlan(user, [...new Set([...session.departmentIds, ...input.departmentIds])]);
    if (session.status === 'closed') throw new ConflictException({ code: 'training.closed' });
    await this.requireType(em, input.type);
    em.assign(session, this.fields(input));
    await em.flush();
    return session;
  }

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const em = this.em.fork();
    const session = await this.load(em, id, user);
    this.assertPlan(user, session.departmentIds);
    if (session.status === 'closed') throw new ConflictException({ code: 'training.closed' });
    await em.remove(session).flush();
    await this.attachments.removeAll('training.session', id);
  }

  /**
   * Replaces the attendance list; a session with attendance counts as held. Presence is recorded only once the
   * session has begun (from the opening of the QR check-in), with times inside the session (with a tolerance).
   * QR check-ins made while the list was being edited are kept: unconfirmed check-ins the client did not know.
   * Persons not listed yet must exist in the person directory (members of the departments, invited persons or guests).
   */
  async setAttendance(user: AuthenticatedUser, id: string, input: ParsedAttendance[], now = new Date()): Promise<SessionEntity> {
    const em = this.em.fork();
    const session = await this.load(em, id, user);
    if (!this.can(user, ATTENDANCE, session)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [ATTENDANCE] });
    if (session.status === 'closed') throw new ConflictException({ code: 'training.closed' });
    const ids = input.map((a) => a.personId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException({ code: 'training.personTwice' });
    const listed = new Set(session.attendance.getItems().map((a) => a.personId));
    const added = ids.filter((personId) => !listed.has(personId));
    if (added.length) {
      // Persons whose processing is restricted (Art. 18) cannot be added.
      const restricted = await this.directory.restrictedIds(added);
      const known = new Set((await this.directory.snapshots(added)).map((p) => p.id).filter((personId) => !restricted.has(personId)));
      const unknown = added.find((personId) => !known.has(personId));
      if (unknown) throw new BadRequestException({ code: 'training.unknownPerson', personId: unknown });
    }
    if (input.some((a) => a.status !== 'excused') && now < (await this.checkInWindow(session)).from) throw new BadRequestException({ code: 'training.notStarted' });
    for (const a of input.filter((x) => x.status === 'present')) this.assertTimes(session, a);
    const existing = new Map(session.attendance.getItems().map((a) => [a.personId, a]));
    const unseen = (row: AttendanceEntity | undefined, a?: ParsedAttendance) =>
      Boolean(row && !row.confirmed && row.checkedInAt && (!a || !a.checkedInAt || new Date(a.checkedInAt).getTime() !== row.checkedInAt.getTime()));
    const list = input.filter((a) => !unseen(existing.get(a.personId), a));
    // Update rows in place (keeps their history), remove those no longer listed, add new ones.
    for (const [personId, row] of existing) if (!ids.includes(personId) && !unseen(row)) session.attendance.remove(row);
    for (const a of list) {
      const values = {
        status: a.status,
        from: a.from ? new Date(a.from) : null,
        to: a.to ? new Date(a.to) : null,
        role: a.role,
        breathingApparatus: a.breathingApparatus,
        kilojoules: a.kilojoules,
        passed: a.passed,
        injured: a.injured,
        // Saving the list confirms QR check-ins.
        confirmed: true,
      };
      const row = existing.get(a.personId);
      if (row) Object.assign(row, values);
      else session.attendance.add(em.create(AttendanceEntity, { session, personId: a.personId, checkedInAt: null, ...values }));
    }
    session.status = session.attendance.getItems().some((a) => a.status === 'present') ? 'held' : 'planned';
    await em.flush();
    return session;
  }

  /**
   * Discards an unconfirmed QR check-in (e.g. a wrong person or a joke): the row goes, or returns to the excuse the
   * person had sent before.
   */
  async discardCheckIn(user: AuthenticatedUser, id: string, personId: string): Promise<SessionEntity> {
    const em = this.em.fork();
    const session = await this.load(em, id, user);
    if (!this.can(user, ATTENDANCE, session)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [ATTENDANCE] });
    if (session.status === 'closed') throw new ConflictException({ code: 'training.closed' });
    const row = session.attendance.getItems().find((a) => a.personId === personId);
    if (!row?.checkedInAt || row.confirmed) throw new ConflictException({ code: 'training.noUnconfirmedCheckIn' });
    if (row.excuseReason || row.note) Object.assign(row, { status: 'excused', checkedInAt: null, checkedInVia: null, confirmed: true });
    else session.attendance.remove(row);
    session.status = session.attendance.getItems().some((a) => a.status === 'present') ? 'held' : 'planned';
    await em.flush();
    return session;
  }

  /** Own times of a person present: end after start, inside the session give or take the tolerance. */
  private assertTimes(session: SessionEntity, a: ParsedAttendance): void {
    const from = a.from ? new Date(a.from) : session.startsAt;
    const to = a.to ? new Date(a.to) : session.endsAt;
    if (to <= from) throw new BadRequestException({ code: 'training.attendanceEndBeforeStart', personId: a.personId });
    const tolerance = ATTENDANCE_TOLERANCE_MINUTES * 60_000;
    if (from.getTime() < session.startsAt.getTime() - tolerance || to.getTime() > session.endsAt.getTime() + tolerance) {
      throw new BadRequestException({ code: 'training.attendanceOutsideSession', personId: a.personId });
    }
  }

  /** Closing creates the records and compensation entries in other modules (event `training.session.closed`). */
  async close(user: AuthenticatedUser, id: string): Promise<SessionEntity> {
    const em = this.em.fork();
    const session = await this.load(em, id, user);
    if (!this.can(user, CLOSE, session)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [CLOSE] });
    if (session.status !== 'held') throw new ConflictException({ code: 'training.notHeld', status: session.status });
    if (new Date() < session.startsAt) throw new ConflictException({ code: 'training.notStarted' });
    const unconfirmed = session.attendance.getItems().filter((a) => !a.confirmed).length;
    if (unconfirmed) throw new ConflictException({ code: 'training.unconfirmedCheckIns', count: unconfirmed });
    const type = await this.requireType(em, session.type);
    session.status = 'closed';
    session.closedAt = new Date();
    session.closedBy = user.displayName;
    await em.flush();
    await this.audit.log('training.session-closed', { sessionId: session.id, title: session.title, startsAt: session.startsAt.toISOString(), present: session.attendance.getItems().filter((a) => a.status === 'present').length });
    await this.publishClosed(session, type);
    return session;
  }

  async injured(year: number): Promise<{ personId: string; sessionId: string; departmentIds: string[] }[]> {
    const sessions = await this.em.fork().find(
      SessionEntity,
      { status: 'closed', startsAt: { $gte: berlinDayStart(`${year}-01-01`), $lt: berlinDayStart(`${year + 1}-01-01`) }, attendance: { injured: true } },
      { populate: ['attendance'] },
    );
    return sessions.flatMap((s) => s.attendance.getItems().filter((a) => a.injured && a.status === 'present').map((a) => ({ personId: a.personId, sessionId: s.id, departmentIds: s.departmentIds })));
  }

  /** Publishes the closing of all closed sessions of a period again (for modules installed later). */
  async republish(from: string, to: string): Promise<number> {
    const em = this.em.fork();
    const sessions = await em.find(
      SessionEntity,
      { status: 'closed', startsAt: { $gte: berlinDayStart(from), $lt: berlinDayAfter(to) } },
      { populate: ['attendance'] },
    );
    for (const session of sessions) await this.publishClosed(session, await this.requireType(em, session.type));
    return sessions.length;
  }

  private async publishClosed(session: SessionEntity, type: SessionTypeEntity): Promise<void> {
    const present = session.attendance.getItems().filter((a) => a.status === 'present');
    const date = berlinDate(session.startsAt);
    await this.events.publish<SessionClosedEvent>(TRAINING_EVENTS.sessionClosed, {
      sessionId: session.id,
      type: session.type,
      title: session.title,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      departmentIds: session.departmentIds,
      category: type.category,
      compensation: type.compensation,
      attendances: present.map((a) => {
        const from = a.from ?? session.startsAt;
        const to = a.to ?? session.endsAt;
        return { personId: a.personId, from: from.toISOString(), to: to.toISOString(), minutes: Math.max(0, Math.round((to.getTime() - from.getTime()) / 60_000)), breathingApparatus: a.breathingApparatus, injured: a.injured };
      }),
      records: type.record
        ? present
            // Runs that did not pass are no evidence.
            .filter((a) => (type.record !== 'stress-exercise' && type.record !== 'training-track') || a.passed !== false)
            .map((a) => ({ personId: a.personId, kind: type.record!, date, kilojoules: a.kilojoules ?? null, passed: a.passed ?? null }))
        : [],
    });
  }

  async reopen(user: AuthenticatedUser, id: string): Promise<SessionEntity> {
    const em = this.em.fork();
    const session = await this.load(em, id, user);
    if (!this.can(user, CLOSE, session)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [CLOSE] });
    if (session.status !== 'closed') throw new ConflictException({ code: 'training.notClosed' });
    session.status = 'held';
    session.closedAt = null;
    session.closedBy = null;
    await em.flush();
    await this.audit.log('training.session-reopened', { sessionId: session.id, title: session.title, startsAt: session.startsAt.toISOString() });
    await this.events.publish<SessionReopenedEvent>(TRAINING_EVENTS.sessionReopened, { sessionId: session.id });
    return session;
  }

  /**
   * Current code for the QR check-in of a session: `<session id>.<signature>`, signed with the session's secret for the
   * current minute. The code shown changes every minute; a scanned code is accepted during the following minute too.
   */
  async checkInCode(user: AuthenticatedUser, id: string, now = new Date()): Promise<CheckIn> {
    const em = this.em.fork();
    const session = await this.load(em, id, user);
    if (!this.can(user, ATTENDANCE, session)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [ATTENDANCE] });
    if (!session.checkInSecret) {
      session.checkInSecret = randomBytes(24).toString('base64url');
      await em.flush();
    }
    const { from, until } = await this.checkInWindow(session);
    const period = checkInPeriod(now);
    return {
      code: `${session.id}.${checkInSignature(session.checkInSecret, session.id, period)}`,
      validFrom: from.toISOString(),
      validUntil: until.toISOString(),
      rotatesAt: new Date((period + 1) * CHECK_IN_ROTATION_SECONDS * 1000).toISOString(),
      checkedIn: session.attendance.getItems().filter((a) => a.checkedInAt).length,
    };
  }

  private async checkInWindow(session: SessionEntity) {
    const settings = (await this.settings.get<TrainingSettings>('training.general')) as TrainingSettings;
    return { from: new Date(session.startsAt.getTime() - settings.checkInBeforeMinutes * 60_000), until: session.endsAt };
  }

  /**
   * The session of a scanned code: `<session id>.<signature>` (the code shown, valid in its minute and the following
   * one) or a ticket `<session id>.<expiry>.<signature>` (see `checkInTicket`).
   */
  private async scanned(em: EntityManager, code: string, now: Date): Promise<SessionEntity> {
    const [sessionId, ...rest] = code.split('.');
    const session = /^[0-9a-f-]{36}$/i.test(sessionId ?? '') ? await em.findOne(SessionEntity, sessionId.toLowerCase(), { populate: ['attendance'] }) : null;
    const signature = rest.at(-1);
    if (!session?.checkInSecret || !signature || rest.length > 2) throw new NotFoundException({ code: 'training.unknownCode' });
    if (rest.length === 2) {
      const expires = Number(rest[0]);
      if (!/^\d+$/.test(rest[0]) || !safeEqual(ticketSignature(session.checkInSecret, session.id, expires), signature)) throw new NotFoundException({ code: 'training.unknownCode' });
      if (now.getTime() > expires * 1000) throw new BadRequestException({ code: 'training.codeExpired' });
      return session;
    }
    const period = checkInPeriod(now);
    if (![period, period - 1].some((p) => safeEqual(checkInSignature(session.checkInSecret!, session.id, p), signature))) {
      throw new BadRequestException({ code: 'training.codeExpired' });
    }
    return session;
  }

  /**
   * Exchanges a fresh code of the QR code for a ticket valid `CHECK_IN_TICKET_MINUTES` minutes, so logging in after
   * scanning does not let the code expire. Needs no login (the QR code leads here first); `null` for a code that is
   * unknown or expired.
   */
  async checkInTicket(code: string, now = new Date()): Promise<string | null> {
    const session = await this.scanned(this.em.fork(), code, now).catch(() => null);
    if (!session?.checkInSecret || code.split('.').length !== 2) return null;
    const expires = Math.floor(now.getTime() / 1000) + CHECK_IN_TICKET_MINUTES * 60;
    return `${session.id}.${expires}.${ticketSignature(session.checkInSecret, session.id, expires)}`;
  }

  /**
   * A member scans the QR code and is marked present (needs a user linked to a person). Only members of the session's
   * departments and persons invited to it (responsible, instructors, already listed) may check in.
   */
  async checkIn(user: AuthenticatedUser, code: string, now = new Date()): Promise<{ sessionId: string; title: string }> {
    if (!user.personId) throw new BadRequestException({ code: 'training.noPerson' });
    const em = this.em.fork();
    const session = await this.scanned(em, code, now);
    if (session.status === 'closed') throw new ConflictException({ code: 'training.closed' });
    const window = await this.checkInWindow(session);
    if (now < window.from || now > window.until) throw new BadRequestException({ code: 'training.checkInClosed' });
    const [person] = await this.directory.snapshots([user.personId]);
    const invited =
      person?.departmentIds.some((d) => session.departmentIds.includes(d)) ||
      session.responsiblePersonId === user.personId ||
      session.instructorIds.includes(user.personId) ||
      session.attendance.getItems().some((a) => a.personId === user.personId);
    if (!invited) throw new ForbiddenException({ code: 'training.notInvited' });
    const existing = session.attendance.getItems().find((a) => a.personId === user.personId);
    if (existing) {
      // Already recorded present by the person responsible: nothing to confirm.
      if (existing.status !== 'present') existing.confirmed = false;
      existing.status = 'present';
      if (!existing.checkedInAt) Object.assign(existing, { checkedInAt: now, checkedInVia: 'qr' });
    } else {
      session.attendance.add(em.create(AttendanceEntity, { session, personId: user.personId, status: 'present', checkedInAt: now, checkedInVia: 'qr', confirmed: false, breathingApparatus: false, injured: false }));
    }
    session.status = session.status === 'planned' ? 'held' : session.status;
    await em.flush();
    return { sessionId: session.id, title: session.title };
  }

  async overlaps(session: SessionEntity): Promise<Session['overlaps']> {
    const others = await this.em.fork().find(SessionEntity, {
      id: { $ne: session.id },
      startsAt: { $lt: session.endsAt },
      endsAt: { $gt: session.startsAt },
      departmentIds: { $overlap: session.departmentIds },
    });
    return others.map((o) => ({ id: o.id, title: o.title, startsAt: o.startsAt.toISOString() }));
  }

  /**
   * The session for a reader: the text of an excuse (it may say more than the reason) only for those who record the
   * attendance in one of its departments, e.g. the group leader.
   */
  toDtoFor(user: AuthenticatedUser, session: SessionEntity, overlaps: Session['overlaps']): Session {
    const dto = this.toDto(session, overlaps);
    return this.can(user, ATTENDANCE, session) ? dto : { ...dto, attendance: dto.attendance.map((a) => ({ ...a, note: '' })) };
  }

  toDto(session: SessionEntity, overlaps: Session['overlaps']): Session {
    return {
      id: session.id,
      type: session.type,
      title: session.title,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt.toISOString(),
      stationId: session.stationId ?? null,
      departmentIds: session.departmentIds,
      responsiblePersonId: session.responsiblePersonId ?? null,
      instructorIds: session.instructorIds,
      topic: session.topic,
      goals: session.goals,
      procedure: session.procedure,
      material: session.material,
      status: session.status,
      closedAt: iso(session.closedAt),
      closedBy: session.closedBy ?? null,
      attendance: session.attendance.getItems().map((a) => ({
        personId: a.personId,
        status: a.status,
        from: iso(a.from),
        to: iso(a.to),
        role: a.role ?? null,
        breathingApparatus: a.breathingApparatus,
        kilojoules: a.kilojoules ?? null,
        passed: a.passed ?? null,
        injured: a.injured,
        checkedInAt: iso(a.checkedInAt),
        checkedInVia: a.checkedInVia ?? null,
        confirmed: a.confirmed,
        excuseReason: a.excuseReason ?? null,
        note: a.note,
      })),
      overlaps,
      version: session.version,
    };
  }

  private fields(input: ParsedSession) {
    return {
      type: input.type,
      title: input.title,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      stationId: input.stationId,
      departmentIds: input.departmentIds,
      responsiblePersonId: input.responsiblePersonId,
      instructorIds: input.instructorIds,
      topic: input.topic,
      goals: input.goals,
      procedure: input.procedure,
      material: input.material,
    };
  }

  /** Names of departments, e.g. for the calendar feed. */
  async departmentNames(): Promise<Map<string, string>> {
    return new Map((await this.organization.departments()).map((d) => [d.id, d.shortName]));
  }
}
