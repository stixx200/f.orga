import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Put } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type AuthenticatedUser, berlinDayStart, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import { PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { ExcuseInput, type MySession, type MyTraining } from '@forga/training-contracts';
import { AttendanceEntity, SessionEntity, SessionTypeEntity } from '../training.entities.js';

const SELF = 'training.self';
const WEEKS_AHEAD = 8;
const PAST_DAYS = 90;

const toMySession = (s: SessionEntity, personId: string): MySession => {
  const own = s.attendance.getItems().find((a) => a.personId === personId);
  return {
    id: s.id,
    type: s.type,
    title: s.title,
    startsAt: s.startsAt.toISOString(),
    endsAt: s.endsAt.toISOString(),
    stationId: s.stationId ?? null,
    departmentIds: s.departmentIds,
    status: s.status,
    own: own ? { status: own.status, excuseReason: own.excuseReason ?? null, note: own.note } : null,
  };
};

/** "My area": sessions of the own departments, own participation and excuses in advance. */
@Controller('training/me')
export class TrainingSelfController {
  constructor(
    private readonly em: EntityManager,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  private async person(user: AuthenticatedUser) {
    const [person] = user.personId ? await this.directory.snapshots([user.personId]) : [];
    if (!person) throw new NotFoundException({ code: 'training.noPerson' });
    return person;
  }

  @Get()
  @RequirePermissions(SELF)
  async get(@CurrentUser() user: AuthenticatedUser): Promise<MyTraining> {
    const person = await this.person(user);
    const now = new Date();
    const em = this.em.fork();
    const own = { departmentIds: { $overlap: person.departmentIds } };
    // The year counts like the participation rate: only sessions whose type counts for it (not special services).
    const counting = (await em.find(SessionTypeEntity, { countsForParticipation: true })).map((t) => t.key);
    const [upcoming, past, year] = await Promise.all([
      em.find(SessionEntity, { ...own, endsAt: { $gte: now }, startsAt: { $lt: new Date(now.getTime() + WEEKS_AHEAD * 7 * 86_400_000) } }, { populate: ['attendance'], orderBy: { startsAt: 'asc' } }),
      em.find(SessionEntity, { ...own, endsAt: { $lt: now, $gte: new Date(now.getTime() - PAST_DAYS * 86_400_000) } }, { populate: ['attendance'], orderBy: { startsAt: 'desc' } }),
      em.find(SessionEntity, { ...own, type: { $in: counting }, status: 'closed', startsAt: { $gte: berlinDayStart(`${now.getFullYear()}-01-01`) } }, { populate: ['attendance'] }),
    ]);
    const mine = (s: SessionEntity) => s.attendance.getItems().find((a) => a.personId === person.id)?.status;
    return {
      upcoming: upcoming.map((s) => toMySession(s, person.id)),
      past: past.map((s) => toMySession(s, person.id)),
      year: { sessions: year.length, present: year.filter((s) => mine(s) === 'present').length, excused: year.filter((s) => mine(s) === 'excused').length },
    };
  }

  /** Excuses the member for an upcoming session of the own departments; an attendance recorded as present stays. */
  @Put('sessions/:id/excuse')
  @RequirePermissions(SELF)
  async excuse(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string, @Body(new ZodPipe(ExcuseInput)) input: ReturnType<typeof ExcuseInput.parse>): Promise<MySession> {
    const person = await this.person(user);
    const em = this.em.fork();
    const session = await this.ownSession(em, id, person.departmentIds);
    const row = session.attendance.getItems().find((a) => a.personId === person.id);
    if (row?.status === 'present') throw new ConflictException({ code: 'training.alreadyPresent' });
    if (row) Object.assign(row, { status: 'excused', excuseReason: input.reason, note: input.note });
    else session.attendance.add(em.create(AttendanceEntity, { session, personId: person.id, status: 'excused', excuseReason: input.reason, note: input.note, checkedInAt: null, breathingApparatus: false, injured: false }));
    await em.flush();
    return toMySession(session, person.id);
  }

  @Delete('sessions/:id/excuse')
  @HttpCode(200)
  @RequirePermissions(SELF)
  async withdraw(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<MySession> {
    const person = await this.person(user);
    const em = this.em.fork();
    const session = await this.ownSession(em, id, person.departmentIds);
    const row = session.attendance.getItems().find((a) => a.personId === person.id);
    if (row?.status === 'excused') session.attendance.remove(row);
    await em.flush();
    return toMySession(session, person.id);
  }

  private async ownSession(em: EntityManager, id: string, departmentIds: string[]): Promise<SessionEntity> {
    const session = await em.findOne(SessionEntity, id, { populate: ['attendance'] });
    if (!session || !session.departmentIds.some((d) => departmentIds.includes(d))) throw new NotFoundException();
    if (session.status === 'closed') throw new ConflictException({ code: 'training.closed' });
    if (session.endsAt < new Date()) throw new BadRequestException({ code: 'training.excusePast' });
    return session;
  }
}
