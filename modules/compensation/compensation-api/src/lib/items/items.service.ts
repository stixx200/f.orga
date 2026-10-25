import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { type AuthenticatedUser, berlinDate, DomainEvents, SettingsService } from '@forga/core-api';
import { billableHours, CompensationSettings, incidentPayout, type CompensationStatute, type IncidentRate, type Item, ItemAmountInput, type ItemKind, type ItemSource, ManualItemInput, round2, type Rounding, trainingRateOn } from '@forga/compensation-contracts';
import { type DutyChangedEvent, INCIDENTS_EVENTS, type ReportReleasedEvent } from '@forga/incidents-contracts';
import { type CoursePassedEvent, type CourseRevokedEvent, MASTERDATA_EVENTS, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { type SessionClosedEvent, type SessionReopenedEvent, TRAINING_EVENTS } from '@forga/training-contracts';
import { ItemEntity } from '../compensation.entities.js';

export const READ = 'compensation.read';
export const RUNS = 'compensation.runs';
export const MANUAL = 'compensation.items.manual';

type ParsedManual = ReturnType<typeof ManualItemInput.parse>;
type ParsedAmount = ReturnType<typeof ItemAmountInput.parse>;

/** An item as a source wants it to be; amounts already paid out are corrected by the difference. */
export interface DesiredItem {
  personId: string;
  departmentId: string | null;
  kind: ItemKind;
  label: string;
  date: string;
  from: Date | null;
  to: Date | null;
  hours: number | null;
  rate: number | null;
  amount: number | null;
  workingHours: boolean;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const key = (i: { personId: string; kind: ItemKind }) => `${i.personId}|${i.kind}`;
const capped = (amount: number, max: number | null) => (max === null ? amount : Math.min(amount, max));
export const durationHours = (from: string | Date, to: string | Date) => (new Date(to).getTime() - new Date(from).getTime()) / 3_600_000;

export const toItemDto = (i: ItemEntity): Item => ({
  id: i.id,
  personId: i.personId,
  departmentId: i.departmentId ?? null,
  source: i.source,
  sourceId: i.sourceId ?? null,
  label: i.label,
  kind: i.kind,
  date: i.date,
  from: iso(i.from),
  to: iso(i.to),
  hours: i.hours === null || i.hours === undefined ? null : Number(i.hours),
  rate: i.rate === null || i.rate === undefined ? null : Number(i.rate),
  amount: i.amount === null || i.amount === undefined ? null : Number(i.amount),
  workingHours: i.workingHours,
  correction: i.correction,
  reason: i.reason,
  runId: i.run?.id ?? null,
  version: i.version,
});

/** An item is open until it is part of a closed run. */
export const isLocked = (i: ItemEntity) => Boolean(i.run && i.run.status !== 'draft');

@Injectable()
export class ItemsService implements OnModuleInit, CompensationStatute {
  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
    private readonly events: DomainEvents,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  onModuleInit(): void {
    this.events.subscribe<ReportReleasedEvent>(INCIDENTS_EVENTS.reportReleased, (e) => this.fromIncident(e));
    this.events.subscribe<SessionClosedEvent>(TRAINING_EVENTS.sessionClosed, (e) => this.fromTraining(e));
    // Reopened: open items disappear, amounts already paid out are reversed until it is closed again.
    this.events.subscribe<SessionReopenedEvent>(TRAINING_EVENTS.sessionReopened, (e) => this.apply('training', e.sessionId, []));
    this.events.subscribe<DutyChangedEvent>(INCIDENTS_EVENTS.dutyChanged, (e) => this.fromDuty(e));
    this.events.subscribe<CoursePassedEvent>(MASTERDATA_EVENTS.coursePassed, (e) => this.fromCourse(e));
    // A deleted course attendance: an open allowance disappears, one already paid out is reversed by a correction item.
    this.events.subscribe<CourseRevokedEvent>(MASTERDATA_EVENTS.courseRevoked, (e) => this.apply('course', e.attendanceId, []));
  }

  async config(): Promise<CompensationSettings> {
    return CompensationSettings.parse((await this.settings.get('compensation.general')) ?? {});
  }

  /** Statute parameters for incident reports (`COMPENSATION_STATUTE`). */
  async incidentRates(): Promise<{ rates: IncidentRate[]; rounding: Rounding; minimumHours: number | null }> {
    const config = await this.config();
    return { rates: config.incidentRates, rounding: config.incidentRounding, minimumHours: config.incidentMinimumHours };
  }

  /** Items of persons in departments where the user has the permission; brigade-wide all. */
  async visibleFilter(user: AuthenticatedUser, permission = READ): Promise<FilterQuery<ItemEntity> | null> {
    const grant = user.grant(permission);
    if (!grant) return null;
    if (grant === 'brigade') return {};
    const members = await this.directory.membersOn(berlinDate());
    return { personId: { $in: members.filter((m) => m.departmentIds.some((d) => grant.includes(d))).map((m) => m.id) } };
  }

  async canReadPerson(user: AuthenticatedUser, personId: string): Promise<boolean> {
    if (user.grant(READ) === 'brigade' || user.grant(RUNS) === 'brigade') return true;
    const [person] = await this.directory.snapshots([personId]);
    return Boolean(person) && person!.departmentIds.some((d) => user.can(READ, d));
  }

  /**
   * Brings the items of a source (a report, a session, an allowance) to the desired state.
   * Open items are replaced. For amounts already in a closed run, a correction item with the difference is added,
   * so closed runs stay unchanged. Entered loss-of-earnings amounts survive a replacement.
   */
  async apply(source: ItemSource, sourceId: string, desired: DesiredItem[]): Promise<void> {
    const em = this.em.fork();
    const existing = await em.find(ItemEntity, { source, sourceId }, { populate: ['run'] });
    const locked = new Map<string, number>();
    const entered = new Map<string, number>();
    for (const item of existing) {
      if (isLocked(item)) {
        locked.set(key(item), round2((locked.get(key(item)) ?? 0) + Number(item.amount ?? 0)));
      } else {
        if (item.kind === 'loss-of-earnings' && item.amount !== null && item.amount !== undefined) entered.set(key(item), Number(item.amount));
        em.remove(item);
      }
    }
    const wanted = new Set<string>();
    for (const row of desired) {
      const k = key(row);
      wanted.add(k);
      const amount = row.kind === 'loss-of-earnings' && row.amount === null ? (entered.get(k) ?? null) : row.amount;
      const paid = locked.get(k);
      if (paid === undefined) {
        em.create(ItemEntity, { ...row, amount, source, sourceId, correction: false, reason: '', run: null });
      } else if (amount !== null && round2(amount - paid) !== 0) {
        em.create(ItemEntity, { ...row, hours: null, rate: null, amount: round2(amount - paid), source, sourceId, correction: true, reason: '', run: null });
      }
    }
    // A person removed from the source after payout: reverse the amount.
    for (const [k, paid] of locked) {
      if (wanted.has(k) || paid === 0) continue;
      const sample = existing.find((i) => key(i) === k)!;
      em.create(ItemEntity, {
        personId: sample.personId, departmentId: sample.departmentId, kind: sample.kind, label: sample.label, date: sample.date, from: sample.from, to: sample.to,
        hours: null, rate: null, amount: -paid, workingHours: false, source, sourceId, correction: true, reason: '', run: null,
      });
    }
    await em.flush();
  }

  /**
   * Released incident report: one item per person (at most `maxPerService`), plus an open loss-of-earnings item where
   * claimed and the refreshment allowance for long incidents when the statute names an amount.
   */
  async fromIncident(e: ReportReleasedEvent): Promise<void> {
    const config = await this.config();
    const label = `${e.dispatchNumber} · ${e.alarmKeyword}`;
    const rows = e.personnel.flatMap((p): DesiredItem[] => {
      const base = { personId: p.personId, departmentId: e.departmentId, label, date: berlinDate(new Date(p.from)), from: new Date(p.from), to: new Date(p.to), workingHours: p.duringWorkingHours };
      const payout = incidentPayout(p, config);
      // Unpaid during working hours (unless the incidents settings compensate them).
      const unpaid = p.duringWorkingHours && p.amount === 0;
      const items: DesiredItem[] = [{ ...base, kind: 'compensation', hours: unpaid ? 0 : p.hours, rate: unpaid ? null : p.rate, amount: payout.amount }];
      if (p.lossOfEarnings) items.push({ ...base, kind: 'loss-of-earnings', hours: null, rate: null, amount: null, workingHours: false });
      if (payout.refreshment !== null) items.push({ ...base, kind: 'flat-rate', label: `${label} · Erfrischungszuschuss`, hours: null, rate: null, amount: payout.refreshment, workingHours: false });
      return items;
    });
    await this.apply('incident', e.reportId, rows);
  }

  /** Passed course with an allowance in the statute: one flat-rate item, valid amount on the day the course was passed. */
  async fromCourse(e: CoursePassedEvent): Promise<void> {
    const config = await this.config();
    const amount = config.courseAllowances
      .filter((a) => a.course === e.course && a.validFrom <= e.passedOn)
      .toSorted((a, b) => b.validFrom.localeCompare(a.validFrom))[0]?.amount;
    if (amount === undefined) return;
    const [person] = await this.directory.snapshots([e.personId], e.passedOn);
    await this.apply('course', e.attendanceId, [
      { personId: e.personId, departmentId: person?.primaryDepartmentId ?? null, kind: 'flat-rate', label: `Lehrgangspauschale ${e.courseName}`, date: e.passedOn, from: null, to: null, hours: null, rate: null, amount, workingHours: false },
    ]);
  }

  /**
   * Special service of the duty roster: one flat-rate item with the amount per full day computed by the incidents module;
   * a deleted duty removes it (or reverses it when already paid out).
   */
  async fromDuty(e: DutyChangedEvent): Promise<void> {
    if (e.deleted || e.days === 0) return this.apply('duty', e.dutyId, []);
    const [person] = await this.directory.snapshots([e.personId], berlinDate(new Date(e.from)));
    const label = `${e.kindName} (${e.days} ${e.days === 1 ? 'Tag' : 'Tage'})`;
    await this.apply('duty', e.dutyId, [
      { personId: e.personId, departmentId: person?.primaryDepartmentId ?? null, kind: 'flat-rate', label, date: berlinDate(new Date(e.from)), from: new Date(e.from), to: new Date(e.to), hours: null, rate: e.rate, amount: e.rate === null ? null : e.amount, workingHours: false },
    ]);
  }

  /** Closed training session: hours × training or fire-watch rate of the statute, at most `maxPerService`. */
  async fromTraining(e: SessionClosedEvent): Promise<void> {
    const config = await this.config();
    const rows: DesiredItem[] =
      e.compensation === 'none'
        ? []
        : e.attendances.map((a) => {
            const date = berlinDate(new Date(a.from));
            const hours = billableHours(a.from, a.to, config.trainingRounding);
            const rate = trainingRateOn(config.trainingRates, e.compensation === 'fire-watch' ? 'fire-watch' : 'training', date);
            // Without a rate for the date the amount stays open: the run cannot be closed until it is entered.
            return { personId: a.personId, departmentId: e.departmentIds[0] ?? null, kind: 'compensation', label: e.title, date, from: new Date(a.from), to: new Date(a.to), hours, rate, amount: rate === null ? null : capped(round2(hours * rate), config.maxPerService), workingHours: false };
          });
    await this.apply('training', e.sessionId, rows);
  }

  async list(user: AuthenticatedUser, filter: { open?: boolean; personId?: string; year?: number; runId?: string }): Promise<Item[]> {
    const visible = await this.visibleFilter(user);
    if (!visible) return [];
    const where: FilterQuery<ItemEntity>[] = [visible];
    if (filter.personId) where.push({ personId: filter.personId });
    if (filter.year) where.push({ date: { $gte: `${filter.year}-01-01`, $lte: `${filter.year}-12-31` } });
    if (filter.open) where.push({ $or: [{ run: null }, { run: { status: 'draft' } }] });
    if (filter.runId) where.push({ run: filter.runId });
    const items = await this.em.fork().find(ItemEntity, { $and: where }, { populate: ['run'], orderBy: { date: 'desc', createdAt: 'desc' } });
    return items.map(toItemDto);
  }

  async createManual(user: AuthenticatedUser, input: ParsedManual): Promise<Item> {
    const [person] = await this.directory.snapshots([input.personId]);
    if (!person) throw new BadRequestException({ code: 'compensation.unknownPerson' });
    const em = this.em.fork();
    const item = em.create(ItemEntity, {
      personId: input.personId, departmentId: person.primaryDepartmentId, source: 'manual', sourceId: null, label: input.label, kind: input.kind, date: input.date,
      from: null, to: null, hours: null, rate: null, amount: input.amount, workingHours: false, correction: false, reason: `${input.reason} (${user.displayName})`, run: null,
    });
    await em.flush();
    return toItemDto(item);
  }

  private async loadOpen(em: EntityManager, id: string): Promise<ItemEntity> {
    const item = await em.findOne(ItemEntity, id, { populate: ['run'] });
    if (!item) throw new NotFoundException();
    if (isLocked(item)) throw new ConflictException({ code: 'compensation.itemLocked' });
    return item;
  }

  /** The proven loss of earnings, the amount of an item without rate, or a corrected amount of a manual item. */
  async setAmount(user: AuthenticatedUser, id: string, input: ParsedAmount): Promise<Item> {
    const em = this.em.fork();
    const item = await this.loadOpen(em, id);
    const rateMissing = item.kind === 'compensation' && (item.rate === null || item.rate === undefined) && !item.correction;
    if (item.kind !== 'loss-of-earnings' && item.source !== 'manual' && !rateMissing) throw new BadRequestException({ code: 'compensation.amountFixed' });
    item.amount = input.amount;
    if (input.reason) item.reason = `${input.reason} (${user.displayName})`;
    await em.flush();
    return toItemDto(item);
  }

  async removeManual(user: AuthenticatedUser, id: string): Promise<void> {
    if (!user.can(MANUAL)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [MANUAL] });
    const em = this.em.fork();
    const item = await this.loadOpen(em, id);
    if (item.source !== 'manual') throw new BadRequestException({ code: 'compensation.notManual' });
    await em.remove(item).flush();
  }
}
