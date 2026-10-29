import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Inject, NotFoundException, Param, Post, Put, Query, Res } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Response } from 'express';
import { z } from 'zod';
import { type AuthenticatedUser, CurrentUser, Public, RequirePermissions, SettingsService, ZodPipe } from '@forga/core-api';
import {
  AttendanceInput,
  type CheckIn,
  type Participation,
  SESSION_TYPE_TEMPLATE,
  SessionCategory,
  type Session,
  SessionCopy,
  type SessionCopyResult,
  SessionInput,
  SessionSeries,
  type SessionType,
  SessionTypeInput,
  type TrainingFeedLinks,
  type TrainingSettings,
} from '@forga/training-contracts';
import { PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { SessionEntity, SessionTypeEntity } from '../training.entities.js';
import { participation } from './participation.js';
import { ATTENDANCE, PLAN, READ, SessionsService, SETTINGS } from './sessions.service.js';

type Parsed<T extends z.ZodType> = z.infer<T>;

export function toTypeDto(type: SessionTypeEntity): SessionType {
  return {
    id: type.id,
    key: type.key,
    name: type.name,
    category: type.category,
    countsForParticipation: type.countsForParticipation,
    compensation: type.compensation,
    record: type.record ?? null,
    active: type.active,
    sortOrder: type.sortOrder,
    version: type.version,
  };
}

/** Text of an iCalendar field: escapes commas, semicolons and line breaks. */
const icsText = (value: string) => value.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
const toDate = (value: string | null) => (value ? new Date(value) : null);
const icsTime = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Token of the calendar feed of one department, derived from the feed token of the brigade: a member with the address
 * of his department cannot read the sessions of the other departments. A new feed token changes all of them.
 */
export function departmentFeedToken(feedToken: string, departmentId: string): string {
  return createHmac('sha256', feedToken).update(`department:${departmentId}`).digest('base64url').slice(0, 32);
}

/** Compares in constant time (both sides hashed to the same length). */
function sameToken(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest());
}

@Controller('training')
export class SessionsController {
  constructor(
    private readonly em: EntityManager,
    private readonly sessions: SessionsService,
    private readonly settings: SettingsService,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  // ----- Session types -----

  @Get('types')
  async types(): Promise<SessionType[]> {
    return (await this.em.fork().find(SessionTypeEntity, {}, { orderBy: { sortOrder: 'asc', key: 'asc' } })).map(toTypeDto);
  }

  @Post('types')
  @RequirePermissions(SETTINGS)
  async createType(@Body(new ZodPipe(SessionTypeInput)) input: Parsed<typeof SessionTypeInput>): Promise<SessionType> {
    const em = this.em.fork();
    const type = em.create(SessionTypeEntity, input);
    await em.flush();
    return toTypeDto(type);
  }

  @Put('types/:id')
  @RequirePermissions(SETTINGS)
  async updateType(@Param('id') id: string, @Body(new ZodPipe(SessionTypeInput)) input: Parsed<typeof SessionTypeInput>): Promise<SessionType> {
    const em = this.em.fork();
    const type = await em.findOne(SessionTypeEntity, id);
    if (!type) throw new NotFoundException();
    const { key: _key, ...rest } = input;
    em.assign(type, rest);
    await em.flush();
    return toTypeDto(type);
  }

  @Post('types/templates/bw')
  @RequirePermissions(SETTINGS)
  async applyTemplate(): Promise<{ added: number }> {
    const em = this.em.fork();
    const existing = new Set((await em.find(SessionTypeEntity, {})).map((t) => t.key));
    const missing = SESSION_TYPE_TEMPLATE.map((t) => SessionTypeInput.parse(t)).filter((t) => !existing.has(t.key));
    for (const type of missing) em.create(SessionTypeEntity, type);
    await em.flush();
    return { added: missing.length };
  }

  // ----- Sessions -----

  @Get('sessions')
  @RequirePermissions(READ)
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('departmentId') departmentId?: string,
    @Query('type') type?: string,
    @Query('category', new ZodPipe(SessionCategory.optional())) category?: SessionCategory,
  ): Promise<Session[]> {
    return this.sessions.list(user, { from, to, departmentId, type, category });
  }

  @Post('sessions')
  @RequirePermissions(PLAN)
  async create(@Body(new ZodPipe(SessionInput)) input: Parsed<typeof SessionInput>, @CurrentUser() user: AuthenticatedUser): Promise<Session> {
    const session = await this.sessions.create(user, input);
    return this.sessions.toDtoFor(user, session, await this.sessions.overlaps(session));
  }

  @Post('sessions/series')
  @RequirePermissions(PLAN)
  async series(@Body(new ZodPipe(SessionSeries)) input: Parsed<typeof SessionSeries>, @CurrentUser() user: AuthenticatedUser): Promise<Session[]> {
    const created = await this.sessions.createSeries(user, input.session, input.intervalWeeks, input.until);
    return created.map((s) => this.sessions.toDtoFor(user, s, []));
  }

  @Post('sessions/copy')
  @HttpCode(200)
  @RequirePermissions(PLAN)
  copy(@Body(new ZodPipe(SessionCopy)) input: Parsed<typeof SessionCopy>, @CurrentUser() user: AuthenticatedUser): Promise<SessionCopyResult> {
    return this.sessions.copy(user, input);
  }

  @Get('sessions/:id')
  @RequirePermissions(READ)
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Session> {
    const session = await this.sessions.load(this.em.fork(), id, user);
    return this.sessions.toDtoFor(user, session, await this.sessions.overlaps(session));
  }

  @Put('sessions/:id')
  @RequirePermissions(PLAN)
  async update(@Param('id') id: string, @Body(new ZodPipe(SessionInput)) input: Parsed<typeof SessionInput>, @CurrentUser() user: AuthenticatedUser): Promise<Session> {
    const session = await this.sessions.update(user, id, input);
    return this.sessions.toDtoFor(user, session, await this.sessions.overlaps(session));
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @RequirePermissions(PLAN)
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.sessions.remove(user, id);
  }

  @Put('sessions/:id/attendance')
  @RequirePermissions(ATTENDANCE)
  async attendance(
    @Param('id') id: string,
    @Body(new ZodPipe(z.array(AttendanceInput))) input: Parsed<typeof AttendanceInput>[],
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Session> {
    const session = await this.sessions.setAttendance(user, id, input);
    return this.sessions.toDtoFor(user, session, await this.sessions.overlaps(session));
  }

  /** "Discard check-in": removes an unconfirmed QR check-in, e.g. of a wrong person. */
  @Post('sessions/:id/check-ins/:personId/discard')
  @HttpCode(200)
  @RequirePermissions(ATTENDANCE)
  async discardCheckIn(@Param('id') id: string, @Param('personId') personId: string, @CurrentUser() user: AuthenticatedUser): Promise<Session> {
    const session = await this.sessions.discardCheckIn(user, id, personId);
    return this.sessions.toDtoFor(user, session, await this.sessions.overlaps(session));
  }

  @Post('sessions/:id/close')
  @HttpCode(200)
  @RequirePermissions('training.close')
  async close(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Session> {
    return this.sessions.toDtoFor(user, await this.sessions.close(user, id), []);
  }

  @Post('sessions/:id/reopen')
  @HttpCode(200)
  @RequirePermissions('training.close')
  async reopen(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Session> {
    return this.sessions.toDtoFor(user, await this.sessions.reopen(user, id), []);
  }

  @Get('sessions/:id/check-in')
  @RequirePermissions(ATTENDANCE)
  checkInCode(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<CheckIn> {
    return this.sessions.checkInCode(user, id);
  }

  /**
   * Target of the QR code (no login): exchanges the code for a ticket valid some minutes and opens the check-in page
   * with it, so the code does not expire while the member logs in. An unknown or expired code is passed on as it is
   * (the page then names the error).
   */
  @Public()
  @Get('check-in/start')
  async startCheckIn(@Query('code') code: string | undefined, @Res() res: Response): Promise<void> {
    const value = typeof code === 'string' ? code.slice(0, 200) : '';
    const ticket = value ? await this.sessions.checkInTicket(value) : null;
    res.redirect(302, `/training/check-in?code=${encodeURIComponent(ticket ?? value)}`);
  }

  /** Every logged-in member linked to a person can check in with the code of the QR code (or a ticket for it). */
  @Post('check-in')
  @HttpCode(200)
  checkIn(@Body(new ZodPipe(z.object({ code: z.string().min(8) }))) input: { code: string }, @CurrentUser() user: AuthenticatedUser) {
    return this.sessions.checkIn(user, input.code);
  }

  /** Publishes the closing of all closed sessions of a period again (for modules installed later). */
  @Post('sessions/republish')
  @HttpCode(200)
  @RequirePermissions('training.close')
  async republish(@Body(new ZodPipe(z.object({ from: z.iso.date(), to: z.iso.date() }))) input: { from: string; to: string }, @CurrentUser() user: AuthenticatedUser): Promise<{ sessions: number }> {
    if (user.grant('training.close') !== 'brigade') throw new ForbiddenException({ code: 'auth.forbidden', permissions: ['training.close'] });
    return { sessions: await this.sessions.republish(input.from, input.to) };
  }

  /** Participation per person in a period: sessions of the departments that count, present, excused, rate, hours. */
  @Get('participation')
  @RequirePermissions(READ)
  async participation(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('departmentId') departmentId?: string,
  ): Promise<Participation[]> {
    const year = new Date().getFullYear();
    const period = { from: from ?? `${year}-01-01`, to: to ?? `${year}-12-31` };
    const sessions = await this.sessions.list(user, { ...period, departmentId });
    const types = new Map((await this.em.fork().find(SessionTypeEntity, {})).map((t) => [t.key, t]));
    const counted = sessions.filter((s) => s.status !== 'planned' && types.get(s.type)?.countsForParticipation !== false);
    return participation(
      counted.map((s) => ({ startsAt: new Date(s.startsAt), endsAt: new Date(s.endsAt), departmentIds: s.departmentIds, attendance: s.attendance.map((a) => ({ personId: a.personId, status: a.status, from: toDate(a.from), to: toDate(a.to) })) })),
      await this.directory.memberPeriods(),
      { to: period.to, departmentId },
    );
  }

  /**
   * Addresses of the calendar feed for the settings page: one for all departments, one per department (with a token of
   * its own). Only for the managers of the settings, who see the feed token anyway.
   */
  @Get('feed-links')
  async feedLinks(@CurrentUser() user: AuthenticatedUser): Promise<TrainingFeedLinks> {
    if (!this.settings.isManager(user, 'training.general')) throw user.denied(this.settings.managerPermissions('training.general'));
    const settings = (await this.settings.get<TrainingSettings>('training.general')) as TrainingSettings;
    if (!settings.feedToken) return { all: null, departments: [] };
    const names = await this.sessions.departmentNames();
    return {
      all: `/api/training/feed/${settings.feedToken}.ics`,
      departments: [...names].map(([departmentId, name]) => ({ departmentId, name, path: `/api/training/feed/${departmentFeedToken(settings.feedToken, departmentId)}.ics?departmentId=${departmentId}` })),
    };
  }

  /**
   * Calendar feed for calendar apps (no login): `/api/training/feed/<token>.ics` for all departments, or with the token
   * of a department `…/<department token>.ics?departmentId=…` for that department only.
   */
  @Public()
  @Get('feed/:token')
  async feed(@Param('token') token: string, @Query('departmentId') departmentId: string | undefined, @Res() res: Response): Promise<void> {
    const settings = (await this.settings.get<TrainingSettings>('training.general')) as TrainingSettings;
    const given = token.endsWith('.ics') ? token.slice(0, -4) : '';
    const brigade = Boolean(settings.feedToken) && sameToken(given, settings.feedToken);
    const department = Boolean(settings.feedToken && departmentId) && sameToken(given, departmentFeedToken(settings.feedToken, departmentId ?? ''));
    if (!brigade && !department) throw new NotFoundException();
    const since = new Date(Date.now() - 90 * 86_400_000);
    const sessions = await this.em.fork().find(
      SessionEntity,
      { startsAt: { $gte: since }, ...(departmentId ? { departmentIds: { $overlap: [departmentId] } } : {}) },
      { orderBy: { startsAt: 'asc' }, limit: 2000 },
    );
    const names = await this.sessions.departmentNames();
    const events = sessions.map((s) =>
      [
        'BEGIN:VEVENT',
        `UID:${s.id}@forga`,
        `DTSTAMP:${icsTime(new Date())}`,
        `DTSTART:${icsTime(s.startsAt)}`,
        `DTEND:${icsTime(s.endsAt)}`,
        `SUMMARY:${icsText(s.title)}`,
        `DESCRIPTION:${icsText([s.topic, s.departmentIds.map((d) => names.get(d) ?? '').join(', ')].filter(Boolean).join('\n'))}`,
        'END:VEVENT',
      ].join('\r\n'),
    );
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//f.orga//training//DE', 'X-WR-CALNAME:f.orga Dienstplan', ...events, 'END:VCALENDAR', ''].join('\r\n'));
  }
}
