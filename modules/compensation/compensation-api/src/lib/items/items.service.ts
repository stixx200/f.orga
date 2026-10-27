import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { type AuthenticatedUser, berlinDate, DomainEvents, SettingsService } from '@forga/core-api';
import { billableHours, CompensationSettings, incidentPayout, type CompensationStatute, type IncidentRate, type Item, ItemAmountInput, type ItemKind, type ItemSource, ManualItemInput, type MyCompensation, type MyItemState, round2, type Rounding, trainingRateOn } from '@forga/compensation-contracts';
import { DUTY_OFFICER_EVENTS, DUTY_OFFICER_UNIT, type DutyChangedEvent } from '@forga/duty-officer-contracts';
import { INCIDENTS_EVENTS, IncidentSettings, type ReportReleasedEvent, type ReportUnlockedEvent } from '@forga/incidents-contracts';
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
  deferredFrom: i.deferredFrom ?? null,
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
    // Unlocked for correction: its open items are withdrawn, amounts already paid out reversed, until it is released
    // again. A report is only deleted as draft (after unlocking), so nothing is left to withdraw then.
    this.events.subscribe<ReportUnlockedEvent>(INCIDENTS_EVENTS.reportUnlocked, (e) => this.apply('incident', e.reportId, []));
    this.events.subscribe<SessionClosedEvent>(TRAINING_EVENTS.sessionClosed, (e) => this.fromTraining(e));
    // Reopened: open items disappear, amounts already paid out are reversed until it is closed again.
    this.events.subscribe<SessionReopenedEvent>(TRAINING_EVENTS.sessionReopened, (e) => this.apply('training', e.sessionId, []));
    this.events.subscribe<DutyChangedEvent>(DUTY_OFFICER_EVENTS.dutyChanged, (e) => this.fromDuty(e));
    this.events.subscribe<CoursePassedEvent>(MASTERDATA_EVENTS.coursePassed, (e) => this.fromCourse(e));
    // A deleted course attendance: an open allowance disappears, one already paid out is reversed by a correction item.
    this.events.subscribe<CourseRevokedEvent>(MASTERDATA_EVENTS.courseRevoked, (e) => this.apply('course', e.attendanceId, []));
  }

  async config(): Promise<CompensationSettings> {
    return CompensationSettings.parse((await this.settings.get('compensation.general')) ?? {});
  }

  /**
   * Statute parameters for incident reports (`COMPENSATION_STATUTE`). While no incident rates are maintained here,
   * the incident reports keep computing with their own settings, as without this module.
   */
  async incidentRates(): Promise<{ rates: IncidentRate[]; rounding: Rounding; minimumHours: number | null }> {
    const config = await this.config();
    if (!config.incidentRates.length) {
      const own = IncidentSettings.parse((await this.settings.get('incidents.general')) ?? {});
      return { rates: own.rates, rounding: own.rounding, minimumHours: own.minimumHours };
    }
    return { rates: config.incidentRates, rounding: config.incidentRounding, minimumHours: config.incidentMinimumHours };
  }

  /**
   * "Meine Entschädigung": the items of the person linked to the user in a year. "abgerechnet" while the run is closed
   * or handed over, "ausgezahlt" only when the run is paid and the amount was transferred (not a payee without IBAN
   * whose other payout is still open).
   */
  async mine(user: AuthenticatedUser, year: number): Promise<MyCompensation> {
    if (!user.personId) throw new NotFoundException({ code: 'compensation.noPerson' });
    const personId = user.personId;
    const items = await this.em.fork().find(ItemEntity, { personId, date: { $gte: `${year}-01-01`, $lte: `${year}-12-31` } }, { populate: ['run'], orderBy: { date: 'desc', createdAt: 'desc' } });
    const state = (i: ItemEntity): MyItemState => {
      if (!isLocked(i)) return 'open';
      // Paid another way (no IBAN): paid out once that payout is marked as paid.
      const other = (i.run!.manualPayouts ?? []).filter((p) => p.personIds.includes(personId));
      if (other.length) return other.every((p) => p.paidAt) ? 'paid-out' : 'settled';
      return i.run!.status === 'paid' ? 'paid-out' : 'settled';
    };
    const rows = items.map((i) => ({ ...toItemDto(i), state: state(i) }));
    const total = (s: MyItemState) => round2(rows.filter((r) => r.state === s).reduce((t, r) => t + (r.amount ?? 0), 0));
    return { year, items: rows, open: total('open'), settled: total('settled'), paid: total('paid-out') };
  }

  /** Several amounts at once, e.g. the loss of earnings of a run in a list; all or none. */
  async setAmounts(user: AuthenticatedUser, input: { id: string; amount: number; reason: string }[]): Promise<Item[]> {
    const em = this.em.fork();
    const items: ItemEntity[] = [];
    for (const row of input) {
      const item = await this.loadOpen(em, row.id);
      this.assignAmount(user, item, row);
      items.push(item);
    }
    await em.flush();
    return items.map(toItemDto);
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
   * Open items are updated in place, so they keep their draft run, "deferred" mark and amounts entered by hand (loss
   * of earnings, amounts of items without rate, with their reason); open items no longer wanted are removed. For
   * amounts already in a closed run, a correction item with the difference is added, so closed runs stay unchanged.
   */
  async apply(source: ItemSource, sourceId: string, desired: DesiredItem[]): Promise<void> {
    const em = this.em.fork();
    const existing = await em.find(ItemEntity, { source, sourceId }, { populate: ['run'] });
    const locked = new Map<string, number>();
    const open = new Map<string, ItemEntity[]>();
    for (const item of existing) {
      if (isLocked(item)) locked.set(key(item), round2((locked.get(key(item)) ?? 0) + Number(item.amount ?? 0)));
      else open.set(key(item), [...(open.get(key(item)) ?? []), item]);
    }
    // One open item per key with these values: the existing one (preferably the one in a run or deferred), else a new one.
    const keep = (k: string, values: Omit<DesiredItem, 'amount'> & { amount: number | null; correction: boolean; reason: string }) => {
      const list = (open.get(k) ?? []).toSorted((a, b) => Number(Boolean(b.run || b.deferredFrom)) - Number(Boolean(a.run || a.deferredFrom)));
      open.delete(k);
      for (const extra of list.slice(1)) em.remove(extra);
      if (list[0]) Object.assign(list[0], values);
      else em.create(ItemEntity, { ...values, source, sourceId, run: null, deferredFrom: null });
    };
    const wanted = new Set<string>();
    for (const row of desired) {
      const k = key(row);
      wanted.add(k);
      // An amount entered by hand stays while the source still has none (loss of earnings, no rate).
      const current = (open.get(k) ?? []).find((i) => !i.correction);
      const entered = row.amount === null && current && current.amount !== null && current.amount !== undefined ? Number(current.amount) : null;
      const amount = row.amount ?? entered;
      const paid = locked.get(k);
      if (paid === undefined) {
        keep(k, { ...row, amount, correction: false, reason: entered !== null ? current!.reason : '' });
      } else if (amount !== null && round2(amount - paid) !== 0) {
        keep(k, { ...row, hours: null, rate: null, amount: round2(amount - paid), correction: true, reason: '' });
      } else {
        for (const item of open.get(k) ?? []) em.remove(item);
        open.delete(k);
      }
    }
    // A person removed from the source after payout: reverse the amount.
    for (const [k, paid] of locked) {
      if (wanted.has(k) || paid === 0) continue;
      const sample = existing.find((i) => key(i) === k)!;
      keep(k, {
        personId: sample.personId, departmentId: sample.departmentId ?? null, kind: sample.kind, label: sample.label, date: sample.date, from: sample.from ?? null, to: sample.to ?? null,
        hours: null, rate: null, amount: -paid, workingHours: false, correction: true, reason: '',
      });
    }
    for (const list of open.values()) for (const item of list) em.remove(item);
    await em.flush();
  }

  /**
   * Released incident report: one item per person (at most `maxPerService`), plus an open loss-of-earnings item where
   * claimed and the refreshment allowance for long incidents when the statute names an amount. The items of a report
   * of a brigade-wide unit (e.g. the EvD report) belong to the person's primary department; the hours of EvD reports
   * are not paid if the statute covers them with the duty flat rate (`dutyOfficerReportPaid`).
   */
  async fromIncident(e: ReportReleasedEvent): Promise<void> {
    const config = await this.config();
    const label = `${e.dispatchNumber} · ${e.alarmKeyword}`;
    const hoursPaid = e.unit !== DUTY_OFFICER_UNIT || config.dutyOfficerReportPaid;
    const primary = e.departmentId
      ? new Map<string, string | null>()
      : new Map((await this.directory.snapshots([...new Set(e.personnel.map((p) => p.personId))], berlinDate(new Date(e.alarmedAt)))).map((p) => [p.id, p.primaryDepartmentId]));
    const rows = e.personnel.flatMap((p): DesiredItem[] => {
      const departmentId = e.departmentId ?? primary.get(p.personId) ?? null;
      const base = { personId: p.personId, departmentId, label, date: berlinDate(new Date(p.from)), from: new Date(p.from), to: new Date(p.to), workingHours: p.duringWorkingHours };
      const payout = incidentPayout(p, config);
      // Unpaid during working hours (unless the incidents settings compensate them).
      const unpaid = p.duringWorkingHours && p.amount === 0;
      const items: DesiredItem[] = hoursPaid ? [{ ...base, kind: 'compensation', hours: unpaid ? 0 : p.hours, rate: unpaid ? null : p.rate, amount: payout.amount }] : [];
      if (p.lossOfEarnings) items.push({ ...base, kind: 'loss-of-earnings', label: `${label} · Verdienstausfall`, hours: null, rate: null, amount: null, workingHours: false });
      if (hoursPaid && payout.refreshment !== null) items.push({ ...base, kind: 'flat-rate', label: `${label} · Erfrischungszuschuss`, hours: null, rate: null, amount: payout.refreshment, workingHours: false });
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

  /**
   * Closed training session: hours × training or fire-watch rate of the statute, at most `maxPerService`, for persons
   * with a status the statute pays (`paidStatuses`, e.g. not the youth fire brigade). The item belongs to the session's
   * department of the person, for a guest from another department to the person's primary department.
   */
  async fromTraining(e: SessionClosedEvent): Promise<void> {
    const config = await this.config();
    const day = berlinDate(new Date(e.startsAt));
    const persons = new Map((await this.directory.snapshots([...new Set(e.attendances.map((a) => a.personId))], day)).map((p) => [p.id, p]));
    const rows: DesiredItem[] =
      e.compensation === 'none'
        ? []
        : e.attendances.flatMap((a): DesiredItem[] => {
            const person = persons.get(a.personId);
            if (person && !(config.paidStatuses as string[]).includes(person.status)) return [];
            const date = berlinDate(new Date(a.from));
            const hours = billableHours(a.from, a.to, config.trainingRounding);
            const rate = trainingRateOn(config.trainingRates, e.compensation === 'fire-watch' ? 'fire-watch' : 'training', date);
            const own = person ? [person.primaryDepartmentId, ...person.departmentIds].find((d) => d && e.departmentIds.includes(d)) : undefined;
            const departmentId = own ?? person?.primaryDepartmentId ?? e.departmentIds[0] ?? null;
            // Without a rate for the date the amount stays open: the run cannot be closed until it is entered.
            return [{ personId: a.personId, departmentId, kind: 'compensation', label: e.title, date, from: new Date(a.from), to: new Date(a.to), hours, rate, amount: rate === null ? null : capped(round2(hours * rate), config.maxPerService), workingHours: false }];
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
    this.assignAmount(user, item, input);
    await em.flush();
    return toItemDto(item);
  }

  private assignAmount(user: AuthenticatedUser, item: ItemEntity, input: { amount: number; reason: string }): void {
    const rateMissing = item.kind === 'compensation' && (item.rate === null || item.rate === undefined) && !item.correction;
    if (item.kind !== 'loss-of-earnings' && item.source !== 'manual' && !rateMissing) throw new BadRequestException({ code: 'compensation.amountFixed' });
    item.amount = input.amount;
    if (input.reason) item.reason = `${input.reason} (${user.displayName})`;
  }

  async removeManual(user: AuthenticatedUser, id: string): Promise<void> {
    if (!user.can(MANUAL)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [MANUAL] });
    const em = this.em.fork();
    const item = await this.loadOpen(em, id);
    if (item.source !== 'manual') throw new BadRequestException({ code: 'compensation.notManual' });
    await em.remove(item).flush();
  }
}
