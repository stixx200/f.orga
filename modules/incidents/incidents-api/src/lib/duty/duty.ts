import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Injectable, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { berlinDayAfter, berlinDayStart, berlinTime, DomainEvents, type ImportContext, type ImportProfile, type ImportRow, normalizeHeading, RequirePermissions, ZodPipe } from '@forga/core-api';
import type { ImportMessage, ImportResult, ImportRowResult } from '@forga/core-contracts';
import { type DutyAssignment, DutyAssignmentInput, type DutyChangedEvent, INCIDENTS_EVENTS, type IncidentSettings } from '@forga/incidents-contracts';
import { PERSON_DIRECTORY, type PersonDirectory, type PersonSnapshot } from '@forga/masterdata-contracts';
import { dutyCompensation, localDate } from '../domain/compensation.js';
import { DutyAssignmentEntity } from '../incidents.entities.js';
import { ReportContextLoader } from '../reports/report-context.js';

export const DUTY = 'incidents.duty.manage';
type ParsedDuty = ReturnType<typeof DutyAssignmentInput.parse>;

export function toDutyDto(duty: DutyAssignmentEntity, settings: IncidentSettings): DutyAssignment {
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

/** Publishes `incidents.duty.changed`, e.g. for the compensation module (also again for a period: `republish`). */
@Injectable()
export class DutyEvents {
  constructor(
    private readonly em: EntityManager,
    private readonly events: DomainEvents,
    private readonly contexts: ReportContextLoader,
  ) {}

  async changed(duties: DutyAssignmentEntity[], deleted = false): Promise<void> {
    const settings = await this.contexts.settingsOnly();
    for (const duty of duties) {
      const dto = toDutyDto(duty, settings);
      const kindName = settings.dutyKinds.find((k) => k.key === duty.kind)?.name.de ?? duty.kind;
      await this.events.publish<DutyChangedEvent>(INCIDENTS_EVENTS.dutyChanged, { dutyId: duty.id, personId: duty.personId, kindName, from: dto.from, to: dto.to, days: dto.days, rate: dto.rate, amount: dto.amount, deleted });
    }
  }

  /** Publishes the duties of a period again (for modules installed later). */
  async republish(from: string, to: string): Promise<number> {
    const duties = await this.em.fork().find(DutyAssignmentEntity, { from: { $lt: berlinDayAfter(to) }, to: { $gt: berlinDayStart(from) } });
    await this.changed(duties);
    return duties.length;
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
    private readonly contexts: ReportContextLoader,
    private readonly dutyEvents: DutyEvents,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  profile(): ImportProfile {
    return {
      id: 'incidents.duty-roster',
      name: { de: 'EvD-Dienst (iCal)', en: 'Duty officer roster (iCal)' },
      description: {
        de: 'Sonderdienste wie den Einsatzleiter vom Dienst aus einem Kalender (.ics) übernehmen. Die Person wird am Namen im Termintitel erkannt; ein erneuter Import aktualisiert die Termine.',
        en: 'Take over special services such as the duty officer from a calendar (.ics). The person is recognised by the name in the event title; importing again updates the events.',
      },
      permission: DUTY,
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

  private async run(rows: ImportRow[], { dryRun }: ImportContext): Promise<ImportResult> {
    const touched: DutyAssignmentEntity[] = [];
    const em = this.em.fork();
    const settings = await this.contexts.settingsOnly();
    const kind = settings.dutyKinds[0]?.key;
    const members = new Map<string, PersonSnapshot[]>();
    const results: ImportRowResult[] = [];

    for (const { row, values } of rows) {
      const label = values['title'] ?? '';
      const fail = (code: string, params?: ImportMessage['params']) => results.push({ row, action: 'error', label, messages: [{ code, params }] });
      const from = calendarTime(values['from'] ?? '');
      const to = calendarTime(values['to'] ?? '');
      if (!kind) {
        fail('incidents.duty.noKind');
        continue;
      }
      if (!values['uid'] || !from || !to || to <= from) {
        fail('imports.invalidDate');
        continue;
      }
      const date = localDate(from.toISOString());
      if (!members.has(date)) members.set(date, await this.directory.membersOn(date));
      const matches = matchPerson(label, members.get(date) ?? []);
      if (matches.length !== 1) {
        fail(matches.length ? 'incidents.duty.ambiguousPerson' : 'incidents.duty.unknownPerson', { title: label });
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

/** Duty roster: special services such as duty officer, compensated per full day. */
@Controller('incidents/duty')
@RequirePermissions(DUTY)
export class DutyController {
  constructor(
    private readonly em: EntityManager,
    private readonly contexts: ReportContextLoader,
    private readonly dutyEvents: DutyEvents,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  @Get()
  async list(@Query('from') from?: string, @Query('to') to?: string): Promise<DutyAssignment[]> {
    const where = {
      ...(from ? { to: { $gt: berlinDayStart(from) } } : {}),
      ...(to ? { from: { $lt: berlinDayAfter(to) } } : {}),
    };
    const settings = await this.contexts.settingsOnly();
    const list = await this.em.fork().find(DutyAssignmentEntity, where, { orderBy: { from: 'asc' } });
    return list.map((d) => toDutyDto(d, settings));
  }

  @Post()
  async create(@Body(new ZodPipe(DutyAssignmentInput)) input: ParsedDuty): Promise<DutyAssignment> {
    const em = this.em.fork();
    const settings = await this.validate(input);
    const duty = em.create(DutyAssignmentEntity, { ...input, from: new Date(input.from), to: new Date(input.to) });
    await em.flush();
    await this.dutyEvents.changed([duty]);
    return toDutyDto(duty, settings);
  }

  @Put(':id')
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
  async remove(@Param('id') id: string): Promise<void> {
    const em = this.em.fork();
    const duty = await em.findOne(DutyAssignmentEntity, id);
    if (!duty) throw new NotFoundException();
    await em.remove(duty).flush();
    await this.dutyEvents.changed([duty], true);
  }

  private async validate(input: ParsedDuty): Promise<IncidentSettings> {
    const settings = await this.contexts.settingsOnly();
    if (!settings.dutyKinds.some((k) => k.key === input.kind)) throw new BadRequestException({ code: 'incidents.duty.unknownKind', kind: input.kind });
    if (!(await this.directory.snapshots([input.personId])).length) throw new BadRequestException({ code: 'incidents.unknownPerson' });
    return settings;
  }
}
