import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Inject, Injectable, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import {
  type AuthenticatedUser,
  berlinDate,
  berlinDayAfter,
  berlinDayStart,
  berlinTime,
  CurrentUser,
  DomainEvents,
  type ImportContext,
  type ImportProfile,
  type ImportRow,
  type ImportRunResult,
  normalizeHeading,
  RequirePermissions,
  SettingsService,
  ZodPipe,
} from '@forga/core-api';
import type { ImportMessage, ImportRowResult } from '@forga/core-contracts';
import {
  type DutyAssignment,
  DutyAssignmentInput,
  type DutyChangedEvent,
  dutyCompensation,
  DUTY_OFFICER_EVENTS,
  DUTY_OFFICER_READ,
  DUTY_OFFICER_ROSTER,
  DutyOfficerSettings,
  DutyPeriodQuery,
  type DutyPeriod,
  type DutyRoster,
} from '@forga/duty-officer-contracts';
import { PERSON_DIRECTORY, type PersonDirectory, type PersonSnapshot } from '@forga/masterdata-contracts';
import { DutyAssignmentEntity } from '../duty-officer.entities.js';

type ParsedDuty = ReturnType<typeof DutyAssignmentInput.parse>;

/** The settings of the module with defaults. */
@Injectable()
export class DutyOfficerConfig {
  constructor(private readonly settings: SettingsService) {}

  async get(): Promise<DutyOfficerSettings> {
    return DutyOfficerSettings.parse((await this.settings.get('duty-officer.general')) ?? {});
  }
}

export function toDutyDto(duty: DutyAssignmentEntity, settings: DutyOfficerSettings): DutyAssignment {
  const from = duty.from.toISOString();
  const to = duty.to.toISOString();
  return {
    id: duty.id,
    personId: duty.personId,
    kind: duty.kind,
    from,
    to,
    notes: duty.notes,
    externalUid: duty.externalUid ?? null,
    ...dutyCompensation({ from, to, kind: duty.kind }, settings.dutyKinds),
    version: duty.version,
  };
}

/** Publishes `duty-officer.duty.changed`, e.g. for the compensation module (also again for a period: `republish`). */
@Injectable()
export class DutyEvents {
  constructor(
    private readonly em: EntityManager,
    private readonly events: DomainEvents,
    private readonly config: DutyOfficerConfig,
  ) {}

  async changed(duties: DutyAssignmentEntity[], deleted = false): Promise<void> {
    const settings = await this.config.get();
    for (const duty of duties) {
      const dto = toDutyDto(duty, settings);
      const kindName = settings.dutyKinds.find((k) => k.key === duty.kind)?.name.de ?? duty.kind;
      await this.events.publish<DutyChangedEvent>(DUTY_OFFICER_EVENTS.dutyChanged, {
        dutyId: duty.id,
        personId: duty.personId,
        kindName,
        from: dto.from,
        to: dto.to,
        days: dto.days,
        rate: dto.rate,
        amount: dto.amount,
        deleted,
      });
    }
  }

  /** Publishes the duties of a period again (for modules installed later). */
  async republish(from: string, to: string): Promise<number> {
    const duties = await this.em.fork().find(DutyAssignmentEntity, { from: { $lt: berlinDayAfter(to) }, to: { $gt: berlinDayStart(from) } });
    await this.changed(duties);
    return duties.length;
  }
}

/** The roster for other modules (`DUTY_ROSTER`) and for finding the duty officer of an incident. */
@Injectable()
export class DutyRosterService implements DutyRoster {
  constructor(
    private readonly em: EntityManager,
    private readonly config: DutyOfficerConfig,
  ) {}

  async startingIn(from: string, to: string): Promise<DutyPeriod[]> {
    const list = await this.em.fork().find(DutyAssignmentEntity, { from: { $gte: berlinDayStart(from), $lt: berlinDayAfter(to) } }, { orderBy: { from: 'asc' } });
    if (!list.length) return [];
    const settings = await this.config.get();
    return list.map((d) => {
      const dto = toDutyDto(d, settings);
      const kind = settings.dutyKinds.find((k) => k.key === d.kind);
      return { id: d.id, personId: d.personId, kind: d.kind, kindName: kind?.name ?? { de: d.kind, en: d.kind }, from: dto.from, to: dto.to, days: dto.days, rate: dto.rate, amount: dto.amount };
    });
  }

  /** Persons on duty at the time, the first duty kind of the settings (the duty officer) first. */
  async onDutyAt(at: Date): Promise<string[]> {
    const settings = await this.config.get();
    const order = (kind: string) => {
      const index = settings.dutyKinds.findIndex((k) => k.key === kind);
      return index < 0 ? Number.MAX_SAFE_INTEGER : index;
    };
    const duties = await this.em.fork().find(DutyAssignmentEntity, { from: { $lte: at }, to: { $gt: at } }, { orderBy: { from: 'asc' } });
    return [...new Set(duties.toSorted((a, b) => order(a.kind) - order(b.kind)).map((d) => d.personId))];
  }
}

/** Calendar values: all-day `YYYY-MM-DD` means midnight in Europe/Berlin; local times without zone as well. */
export function calendarTime(value: string): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return berlinTime(`${value}T00:00:00`);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) return berlinTime(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Finds the person whose name appears in a calendar title like "EvD Max Test" or "Test, Max". */
export function matchPerson(title: string, persons: readonly PersonSnapshot[]): PersonSnapshot[] {
  const text = ` ${normalizeHeading(title.replaceAll(',', ' ').replace(/\s+/g, ' '))} `;
  const compact = normalizeHeading(title);
  return persons.filter((p) => {
    const first = normalizeHeading(p.firstName);
    const last = normalizeHeading(p.lastName);
    return compact.includes(`${first}${last}`) || compact.includes(`${last}${first}`) || text.includes(` ${first}${last} `);
  });
}

@Injectable()
export class DutyRosterImport {
  constructor(
    private readonly em: EntityManager,
    private readonly config: DutyOfficerConfig,
    private readonly dutyEvents: DutyEvents,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  profile(): ImportProfile {
    return {
      id: 'duty-officer.roster',
      name: { de: 'EvD-Dienst (iCal)', en: 'Duty officer roster (iCal)' },
      description: {
        de: 'EvD-Dienste wie den Einsatzleiter vom Dienst aus einem Kalender (.ics) übernehmen. Die Person wird am Namen im Termintitel erkannt; ein erneuter Import aktualisiert die Termine.',
        en: 'Take over duty officer services such as the duty officer from a calendar (.ics). The person is recognised by the name in the event title; importing again updates the events.',
      },
      permission: DUTY_OFFICER_ROSTER,
      fields: [
        { key: 'uid', label: { de: 'Termin-ID', en: 'Event ID' }, required: true, aliases: ['UID'] },
        { key: 'title', label: { de: 'Titel mit Name', en: 'Title with name' }, required: true, aliases: ['SUMMARY'] },
        { key: 'from', label: { de: 'Beginn', en: 'Begin' }, required: true, aliases: ['DTSTART'] },
        { key: 'to', label: { de: 'Ende', en: 'End' }, required: true, aliases: ['DTEND'] },
        { key: 'notes', label: { de: 'Bemerkung', en: 'Notes' }, required: false, aliases: ['DESCRIPTION'] },
      ],
      run: (rows, context) => this.run(rows, context),
    };
  }

  private async run(rows: ImportRow[], { dryRun }: ImportContext): Promise<ImportRunResult> {
    const touched: DutyAssignmentEntity[] = [];
    const em = this.em.fork();
    const settings = await this.config.get();
    const kind = settings.dutyKinds[0]?.key;
    const members = new Map<string, PersonSnapshot[]>();
    const results: ImportRowResult[] = [];

    for (const { row, values } of rows) {
      const label = values['title'] ?? '';
      const fail = (code: string, params?: ImportMessage['params']) => results.push({ row, action: 'error', label, messages: [{ code, params }] });
      const from = calendarTime(values['from'] ?? '');
      const to = calendarTime(values['to'] ?? '');
      if (!kind) {
        fail('duty-officer.noKind');
        continue;
      }
      if (!values['uid'] || !from || !to || to <= from) {
        fail('imports.invalidDate');
        continue;
      }
      const date = berlinDate(from);
      if (!members.has(date)) members.set(date, await this.directory.membersOn(date));
      const matches = matchPerson(label, members.get(date) ?? []);
      if (matches.length !== 1) {
        fail(matches.length ? 'duty-officer.ambiguousPerson' : 'duty-officer.unknownPerson', { title: label });
        continue;
      }
      const existing = await em.findOne(DutyAssignmentEntity, { externalUid: values['uid'] });
      const fields = { personId: matches[0].id, kind: existing?.kind ?? kind, from, to, notes: values['notes'] ?? '' };
      if (!existing) {
        touched.push(em.create(DutyAssignmentEntity, { ...fields, externalUid: values['uid'] }));
        results.push({ row, action: 'create', label, messages: [] });
        continue;
      }
      const changed =
        existing.personId !== fields.personId ||
        existing.from.getTime() !== from.getTime() ||
        existing.to.getTime() !== to.getTime() ||
        existing.notes !== fields.notes;
      if (changed) {
        em.assign(existing, fields);
        touched.push(existing);
      }
      results.push({ row, action: changed ? 'update' : 'unchanged', label, messages: [] });
    }
    if (!dryRun) {
      await em.flush();
      await this.dutyEvents.changed(touched);
    }
    const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
    for (const r of results) counts[r.action]++;
    return { dryRun, counts, rows: results };
  }
}

/** Duty roster: duty officer services, compensated per day. */
@Controller('duty-officer/roster')
export class RosterController {
  constructor(
    private readonly em: EntityManager,
    private readonly config: DutyOfficerConfig,
    private readonly dutyEvents: DutyEvents,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  /** Readers of the module (e.g. the duty officers) and those maintaining the roster. */
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('from') from?: string, @Query('to') to?: string): Promise<DutyAssignment[]> {
    if (!user.can(DUTY_OFFICER_READ) && !user.can(DUTY_OFFICER_ROSTER)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [DUTY_OFFICER_READ] });
    const where = {
      ...(from ? { to: { $gt: berlinDayStart(from) } } : {}),
      ...(to ? { from: { $lt: berlinDayAfter(to) } } : {}),
    };
    const settings = await this.config.get();
    const list = await this.em.fork().find(DutyAssignmentEntity, where, { orderBy: { from: 'asc' } });
    return list.map((d) => toDutyDto(d, settings));
  }

  @Post()
  @RequirePermissions(DUTY_OFFICER_ROSTER)
  async create(@Body(new ZodPipe(DutyAssignmentInput)) input: ParsedDuty): Promise<DutyAssignment> {
    const em = this.em.fork();
    const settings = await this.validate(input);
    const duty = em.create(DutyAssignmentEntity, { ...input, from: new Date(input.from), to: new Date(input.to) });
    await em.flush();
    await this.dutyEvents.changed([duty]);
    return toDutyDto(duty, settings);
  }

  /** Publishes the duty officer services of a period again (e.g. after activating the compensation module). */
  @Post('republish')
  @HttpCode(200)
  @RequirePermissions(DUTY_OFFICER_ROSTER)
  async republish(@Body(new ZodPipe(DutyPeriodQuery)) input: DutyPeriodQuery): Promise<{ duties: number }> {
    return { duties: await this.dutyEvents.republish(input.from, input.to) };
  }

  @Put(':id')
  @RequirePermissions(DUTY_OFFICER_ROSTER)
  async update(@Param('id') id: string, @Body(new ZodPipe(DutyAssignmentInput)) input: ParsedDuty): Promise<DutyAssignment> {
    const em = this.em.fork();
    const duty = await em.findOne(DutyAssignmentEntity, id);
    if (!duty) throw new NotFoundException();
    const settings = await this.validate(input);
    em.assign(duty, { ...input, from: new Date(input.from), to: new Date(input.to) });
    await em.flush();
    await this.dutyEvents.changed([duty]);
    return toDutyDto(duty, settings);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(DUTY_OFFICER_ROSTER)
  async remove(@Param('id') id: string): Promise<void> {
    const em = this.em.fork();
    const duty = await em.findOne(DutyAssignmentEntity, id);
    if (!duty) throw new NotFoundException();
    await em.remove(duty).flush();
    await this.dutyEvents.changed([duty], true);
  }

  private async validate(input: ParsedDuty): Promise<DutyOfficerSettings> {
    const settings = await this.config.get();
    if (!settings.dutyKinds.some((k) => k.key === input.kind)) throw new BadRequestException({ code: 'duty-officer.unknownKind', kind: input.kind });
    if (!(await this.directory.snapshots([input.personId])).length) throw new BadRequestException({ code: 'duty-officer.unknownPerson' });
    return settings;
  }
}
