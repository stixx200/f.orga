import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post, Put, Query, Res } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Response } from 'express';
import { z } from 'zod';
import { type AuthenticatedUser, CurrentUser, Public, RequirePermissions, SettingsService, ZodPipe } from '@forga/core-api';
import {
  AttendanceInput,
  type CheckIn,
  type Participation,
  SESSION_TYPE_TEMPLATE,
  type Session,
  SessionCopy,
  type SessionCopyResult,
  SessionInput,
  SessionSeries,
  type SessionType,
  SessionTypeInput,
  type TrainingSettings,
} from '@forga/training-contracts';
import { SessionEntity, SessionTypeEntity } from '../training.entities.js';
import { ATTENDANCE, PLAN, READ, SessionsService, SETTINGS } from './sessions.service.js';

type Parsed<T extends z.ZodType> = z.infer<T>;

export function toTypeDto(type: SessionTypeEntity): SessionType {
  return {
    id: type.id,
    key: type.key,
    name: type.name,
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
const icsTime = (date: Date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

@Controller('training')
export class SessionsController {
  constructor(
    private readonly em: EntityManager,
    private readonly sessions: SessionsService,
    private readonly settings: SettingsService,
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
  ): Promise<Session[]> {
    return this.sessions.list(user, { from, to, departmentId, type });
  }

  @Post('sessions')
  @RequirePermissions(PLAN)
  async create(@Body(new ZodPipe(SessionInput)) input: Parsed<typeof SessionInput>, @CurrentUser() user: AuthenticatedUser): Promise<Session> {
    const session = await this.sessions.create(user, input);
    return this.sessions.toDto(session, await this.sessions.overlaps(session));
  }

  @Post('sessions/series')
  @RequirePermissions(PLAN)
  async series(@Body(new ZodPipe(SessionSeries)) input: Parsed<typeof SessionSeries>, @CurrentUser() user: AuthenticatedUser): Promise<Session[]> {
    const created = await this.sessions.createSeries(user, input.session, input.intervalWeeks, input.until);
    return created.map((s) => this.sessions.toDto(s, []));
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
    return this.sessions.toDto(session, await this.sessions.overlaps(session));
  }

  @Put('sessions/:id')
  @RequirePermissions(PLAN)
  async update(@Param('id') id: string, @Body(new ZodPipe(SessionInput)) input: Parsed<typeof SessionInput>, @CurrentUser() user: AuthenticatedUser): Promise<Session> {
    const session = await this.sessions.update(user, id, input);
    return this.sessions.toDto(session, await this.sessions.overlaps(session));
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
    return this.sessions.toDto(session, await this.sessions.overlaps(session));
  }

  @Post('sessions/:id/close')
  @HttpCode(200)
  @RequirePermissions('training.close')
  async close(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Session> {
    return this.sessions.toDto(await this.sessions.close(user, id), []);
  }

  @Post('sessions/:id/reopen')
  @HttpCode(200)
  @RequirePermissions('training.close')
  async reopen(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Session> {
    return this.sessions.toDto(await this.sessions.reopen(user, id), []);
  }

  @Get('sessions/:id/check-in')
  @RequirePermissions(ATTENDANCE)
  checkInCode(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<CheckIn> {
    return this.sessions.checkInCode(user, id);
  }

  /** Every logged-in member linked to a person can check in with the code of the QR code. */
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
    const sessions = await this.sessions.list(user, { from: from ?? `${year}-01-01`, to: to ?? `${year}-12-31`, departmentId });
    const types = new Map((await this.em.fork().find(SessionTypeEntity, {})).map((t) => [t.key, t]));
    const counted = sessions.filter((s) => s.status !== 'planned' && types.get(s.type)?.countsForParticipation !== false);
    const byPerson = new Map<string, Participation>();
    for (const session of counted) {
      for (const a of session.attendance) {
        const entry = byPerson.get(a.personId) ?? { personId: a.personId, sessions: 0, present: 0, excused: 0, rate: 0, hours: 0 };
        if (a.status === 'present') {
          entry.present++;
          const start = new Date(a.from ?? session.startsAt).getTime();
          const end = new Date(a.to ?? session.endsAt).getTime();
          entry.hours += Math.round(((end - start) / 3_600_000) * 10) / 10;
        }
        if (a.status === 'excused') entry.excused++;
        byPerson.set(a.personId, entry);
      }
    }
    return [...byPerson.values()].map((e) => ({ ...e, sessions: counted.length, rate: counted.length ? Math.round((e.present / counted.length) * 100) : 0 }));
  }

  /** Calendar feed for calendar apps (no login): `/api/training/feed/<token>.ics?departmentId=…`. */
  @Public()
  @Get('feed/:token')
  async feed(@Param('token') token: string, @Query('departmentId') departmentId: string | undefined, @Res() res: Response): Promise<void> {
    const settings = (await this.settings.get<TrainingSettings>('training.general')) as TrainingSettings;
    if (!settings.feedToken || `${settings.feedToken}.ics` !== token) throw new NotFoundException();
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
