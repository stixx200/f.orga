import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import ExcelJS from 'exceljs';
import { addStyledSheet, Audit, type AuthenticatedUser, berlinDate, brigadeLogoDataUrl, DomainEvents, formatCell, pdfHeaderCell, PDF_TABLE_LAYOUT, renderLetterPdf, SettingsService } from '@forga/core-api';
import type { BrigadeSettings, Language } from '@forga/core-contracts';
import { calendarDays, CompensationSettings, COMPENSATION_EVENTS, type ManualPayout, overlapping, sepaCreditTransfer, validIban, type PersonTotal, type Problem, round2, type Run, type RunClosedEvent, type RunDetail, RunInput } from '@forga/compensation-contracts';
import { INCIDENTS_LOOKUP, type IncidentSettings, type IncidentsLookup } from '@forga/incidents-contracts';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PaymentDetails, type PersonDirectory } from '@forga/masterdata-contracts';
import { ItemEntity, RunEntity } from '../compensation.entities.js';
import { durationHours, toItemDto } from '../items/items.service.js';

/** A transfer of a run: a person, or an employer receiving the assigned loss of earnings of `personIds`. */
type Payee = { key: string; name: string; iban: string; amount: number; purpose: string; personIds: string[] };
type ParsedRun =ReturnType<typeof RunInput.parse>;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const name = (p: Pick<PaymentDetails, 'firstName' | 'lastName'> | undefined) => (p ? `${p.lastName}, ${p.firstName}` : '–');
const amountOf = (i: ItemEntity) => Number(i.amount ?? 0);
const escape = (v: string) => {
  const text = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};
const germanDate = (value: string) => value.split('-').toReversed().join('.');

const PROBLEM_TEXT: Record<Problem['code'], { de: string; en: string }> = {
  'amount-missing': { de: 'Betrag fehlt (Verdienstausfall oder kein Satz)', en: 'Amount missing (loss of earnings or no rate)' },
  'time-missing': { de: 'Zeit fehlt', en: 'Time missing' },
  'working-hours-conflict': { de: 'Arbeitszeit und Betrag oder Verdienstausfall', en: 'Working hours with amount or loss of earnings' },
  duplicate: { de: 'Doppelt (gleicher Beginn)', en: 'Duplicate (same start)' },
  overlap: { de: 'Überschneidung', en: 'Overlap' },
  'no-iban': { de: 'Keine Bankverbindung', en: 'No bank account' },
  'max-holders': { de: 'Höchstzahl der Inhaber überschritten', en: 'Maximum number of holders exceeded' },
  'negative-total': { de: 'Summe negativ: wird mit dem nächsten Lauf verrechnet', en: 'Negative total: offset against the next run' },
  'report-not-released': { de: 'Einsatzbericht des Zeitraums nicht freigegeben', en: 'Incident report of the period not released' },
  refreshment: { de: 'Erfrischungszuschuss (ohne Betrag in der Satzung)', en: 'Refreshment allowance (no amount in the statute)' },
  'multi-day': { de: 'Mehrtägiger Einsatz: Einzelabrechnung in tatsächlicher Höhe', en: 'Multi-day incident: settle actual amounts individually' },
  'above-day-maximum': { de: 'Höchstbetrag je Tag überschritten', en: 'Maximum per day exceeded' },
  'other-payment': { de: 'Andere Zahlungsart (beim Abschluss bestätigt, keine Bankverbindung)', en: 'Other payment method (confirmed when closing, no bank account)' },
};

const SOURCE_TEXT: Record<string, { de: string; en: string }> = {
  incident: { de: 'Einsatz', en: 'Incident' },
  training: { de: 'Dienst', en: 'Session' },
  function: { de: 'Funktionspauschale', en: 'Function allowance' },
  manual: { de: 'von Hand', en: 'Manual' },
  duty: { de: 'EvD-Dienst', en: 'Duty officer service' },
  course: { de: 'Lehrgang', en: 'Course' },
};

const euro = (value: number) => value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });

@Injectable()
export class RunsService {
  constructor(
    private readonly em: EntityManager,
    private readonly events: DomainEvents,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Optional() @Inject(INCIDENTS_LOOKUP) private readonly incidents?: IncidentsLookup,
  ) {}

  toDto(run: RunEntity, items: ItemEntity[]): Run {
    return {
      id: run.id,
      number: run.number,
      from: run.from,
      to: run.to,
      status: run.status,
      total: round2(items.reduce((s, i) => s + amountOf(i), 0)),
      itemCount: items.length,
      closedAt: iso(run.closedAt),
      closedBy: run.closedBy ?? null,
      withoutIban: run.withoutIban ?? [],
      manualPayouts: run.manualPayouts ?? [],
      approvedAt: iso(run.approvedAt),
      approvedBy: run.approvedBy ?? null,
      handedOverAt: iso(run.handedOverAt),
      paidAt: iso(run.paidAt),
      version: run.version,
    };
  }

  async list(): Promise<Run[]> {
    const runs = await this.em.fork().find(RunEntity, {}, { populate: ['items'], orderBy: { to: 'desc', number: 'desc' } });
    return runs.map((r) => this.toDto(r, r.items.getItems()));
  }

  private async load(em: EntityManager, id: string): Promise<RunEntity> {
    const run = await em.findOne(RunEntity, id, { populate: ['items'] });
    if (!run) throw new NotFoundException();
    return run;
  }

  /** Open items up to the end of the period that are in no run yet (also older ones), except those deferred from this run. */
  private async collect(em: EntityManager, run: RunEntity): Promise<void> {
    const open = await em.find(ItemEntity, { run: null, date: { $lte: run.to }, $or: [{ deferredFrom: null }, { deferredFrom: { $ne: run.id } }] });
    for (const item of open) Object.assign(item, { run, deferredFrom: null });
  }

  /** "In nächsten Lauf verschieben": items leave the draft and are not taken over again by it; the next run takes them. */
  async defer(id: string, itemIds: string[]): Promise<RunDetail> {
    const em = this.em.fork();
    const run = await this.load(em, id);
    if (run.status !== 'draft') throw new ConflictException({ code: 'compensation.runClosed' });
    const items = await em.find(ItemEntity, { id: { $in: itemIds }, run: run.id });
    if (items.length !== itemIds.length) throw new BadRequestException({ code: 'compensation.notInRun' });
    for (const item of items) Object.assign(item, { run: null, deferredFrom: run.id });
    await em.flush();
    return this.detail(id);
  }

  /** Takes deferred items back into the draft. */
  async undefer(id: string, itemIds: string[]): Promise<RunDetail> {
    const em = this.em.fork();
    const run = await this.load(em, id);
    if (run.status !== 'draft') throw new ConflictException({ code: 'compensation.runClosed' });
    for (const item of await em.find(ItemEntity, { id: { $in: itemIds }, run: null, deferredFrom: run.id })) Object.assign(item, { run, deferredFrom: null });
    await em.flush();
    return this.detail(id);
  }

  async create(input: ParsedRun): Promise<RunDetail> {
    const em = this.em.fork();
    if (await em.count(RunEntity, { status: 'draft' })) throw new ConflictException({ code: 'compensation.draftExists' });
    const year = input.to.slice(0, 4);
    const count = await em.count(RunEntity, { number: { $like: `${year}-%` } });
    const run = em.create(RunEntity, { number: `${year}-${String(count + 1).padStart(2, '0')}`, from: input.from, to: input.to, status: 'draft' });
    await em.flush();
    await this.collect(em, run);
    await em.flush();
    return this.detail(run.id);
  }

  /** A draft takes over items that arose since it was created. */
  async refresh(id: string): Promise<RunDetail> {
    const em = this.em.fork();
    const run = await this.load(em, id);
    if (run.status !== 'draft') throw new ConflictException({ code: 'compensation.runClosed' });
    await this.collect(em, run);
    await em.flush();
    return this.detail(id);
  }

  async remove(id: string): Promise<void> {
    const em = this.em.fork();
    const run = await this.load(em, id);
    if (run.status !== 'draft') throw new ConflictException({ code: 'compensation.runClosed' });
    for (const item of run.items.getItems()) item.run = null;
    em.remove(run);
    await em.flush();
  }

  async detail(id: string): Promise<RunDetail> {
    const em = this.em.fork();
    const run = await this.load(em, id);
    const items = run.items.getItems().toSorted((a, b) => a.date.localeCompare(b.date));
    const people = new Map((await this.directory.paymentDetails([...new Set(items.map((i) => i.personId))])).map((p) => [p.id, p]));
    const snapshots = new Map((await this.directory.snapshots([...people.keys()])).map((s) => [s.id, s]));
    const persons = new Map<string, PersonTotal & { reports: Set<string>; trainings: Set<string> }>();
    for (const item of items) {
      const total = persons.get(item.personId) ?? {
        personId: item.personId, name: name(people.get(item.personId)), departmentId: snapshots.get(item.personId)?.primaryDepartmentId ?? null,
        incidents: 0, sessions: 0, amount: 0, reports: new Set<string>(), trainings: new Set<string>(),
      };
      if (item.source === 'incident' && item.sourceId) total.reports.add(item.sourceId);
      if (item.source === 'training' && item.sourceId) total.trainings.add(item.sourceId);
      total.amount = round2(total.amount + amountOf(item));
      persons.set(item.personId, total);
    }
    const departments = new Map<string | null, { departmentId: string | null; persons: Set<string>; incidents: Set<string>; amount: number }>();
    for (const item of items) {
      const d = departments.get(item.departmentId ?? null) ?? { departmentId: item.departmentId ?? null, persons: new Set<string>(), incidents: new Set<string>(), amount: 0 };
      d.persons.add(item.personId);
      if (item.source === 'incident' && item.sourceId) d.incidents.add(item.sourceId);
      d.amount = round2(d.amount + amountOf(item));
      departments.set(d.departmentId, d);
    }
    const deferred = run.status === 'draft' ? await em.find(ItemEntity, { run: null, deferredFrom: run.id }, { orderBy: { date: 'asc' } }) : [];
    return {
      ...this.toDto(run, items),
      items: items.map(toItemDto),
      deferred: deferred.map(toItemDto),
      persons: [...persons.values()]
        .map(({ reports, trainings, ...p }) => ({ ...p, incidents: reports.size, sessions: trainings.size }))
        .toSorted((a, b) => a.name.localeCompare(b.name)),
      departments: [...departments.values()].map((d) => ({ departmentId: d.departmentId, persons: d.persons.size, incidents: d.incidents.size, amount: d.amount })),
      problems: [
        ...this.problems(items, people, await this.config(), await this.paidDuringWorkingHours(), new Set((run.manualPayouts ?? []).flatMap((p) => p.personIds))),
        ...(run.status === 'draft' ? await this.unreleasedReports(run.from, run.to) : []),
      ],
    };
  }

  /** Reports of the period that are not released yet: their compensation is missing from the run (warning only). */
  private async unreleasedReports(from: string, to: string): Promise<Problem[]> {
    if (!this.incidents) return [];
    const departments = new Map((await this.organization.departments()).map((d) => [d.id, d.shortName || d.name]));
    return (await this.incidents.unreleased(from, to)).map((r) => ({
      code: 'report-not-released',
      blocking: false,
      personId: null,
      name: `${berlinDate(new Date(r.alarmedAt))} ${r.alarmKeyword} ${r.dispatchNumber}`,
      itemIds: [],
      // Reports of brigade-wide units (e.g. `EvD-2026-001`) are recognised by their number.
      detail: r.departmentId ? `${r.reportNumber} (${departments.get(r.departmentId) ?? ''})` : r.reportNumber,
    }));
  }

  /** Setting of the incidents module whether assignments during working hours are compensated. */
  private async paidDuringWorkingHours(): Promise<boolean> {
    return (await this.settings.get<Partial<IncidentSettings>>('incidents.general'))?.compensateDuringWorkingHours ?? false;
  }

  private async config(): Promise<CompensationSettings> {
    return CompensationSettings.parse((await this.settings.get('compensation.general')) ?? {});
  }

  /**
   * Checks before closing; only missing amounts block. Statute hints (refreshment, multi-day, day maximum) only warn.
   * Persons confirmed without IBAN when closing (`otherPayment`) show as "andere Zahlungsart" instead of "keine Bankverbindung".
   */
  problems(items: ItemEntity[], people: Map<string, PaymentDetails>, config: CompensationSettings, paidDuringWorkingHours = false, otherPayment = new Set<string>()): Problem[] {
    const problems: Problem[] = [];
    const add = (code: Problem['code'], list: ItemEntity[], detail = '') =>
      problems.push({ code, blocking: code === 'amount-missing', personId: list[0]?.personId ?? null, name: name(people.get(list[0]?.personId ?? '')), itemIds: list.map((i) => i.id), detail });
    const byPerson = new Map<string, ItemEntity[]>();
    for (const item of items) byPerson.set(item.personId, [...(byPerson.get(item.personId) ?? []), item]);
    for (const [personId, list] of byPerson) {
      for (const item of list) {
        if (item.amount === null || item.amount === undefined) add('amount-missing', [item], item.label);
        if ((item.source === 'incident' || item.source === 'training') && !item.correction && (!item.from || !item.to)) add('time-missing', [item], item.label);
        // Pay during working hours is a conflict unless the incidents settings compensate it; loss of earnings always is.
        if (item.workingHours && ((!paidDuringWorkingHours && amountOf(item) > 0) || list.some((o) => o.kind === 'loss-of-earnings' && o.sourceId === item.sourceId))) add('working-hours-conflict', [item], item.label);
        if (item.source !== 'incident' || item.kind !== 'compensation' || item.correction || !item.from || !item.to) continue;
        const hours = durationHours(item.from, item.to);
        const refreshed = list.some((o) => o.kind === 'flat-rate' && o.source === 'incident' && o.sourceId === item.sourceId);
        if (config.refreshment.amount === null && !refreshed && !item.workingHours && hours > config.refreshment.afterHours) add('refreshment', [item], `${item.label} (${round2(hours)} h)`);
        const days = calendarDays(item.from.toISOString(), item.to.toISOString());
        if (days > config.multiDayAfterDays) {
          const household = config.householdRates.filter((r) => r.validFrom <= item.date).toSorted((a, b) => b.validFrom.localeCompare(a.validFrom))[0];
          add('multi-day', [item], `${item.label} (${days} Tage)${household ? `; Haushaltsführende ${euro(household.amount)} je Stunde` : ''}`);
        }
      }
      if (config.maxPerDay !== null) {
        const perDay = new Map<string, ItemEntity[]>();
        for (const item of list) if (item.kind === 'compensation') perDay.set(item.date, [...(perDay.get(item.date) ?? []), item]);
        for (const [day, dayItems] of perDay) {
          const sum = round2(dayItems.reduce((s, i) => s + amountOf(i), 0));
          if (sum > config.maxPerDay) add('above-day-maximum', dayItems, `${germanDate(day)}: ${euro(sum)} > ${euro(config.maxPerDay)}`);
        }
      }
      const timed = list.filter((i) => i.kind === 'compensation' && !i.correction && i.from && i.to);
      for (let a = 0; a < timed.length; a++) {
        for (let b = a + 1; b < timed.length; b++) {
          const x = timed[a];
          const y = timed[b];
          if (x.from!.getTime() === y.from!.getTime()) add('duplicate', [x, y], `${x.label} / ${y.label}`);
          else if (overlapping({ from: x.from!.toISOString(), to: x.to!.toISOString() }, { from: y.from!.toISOString(), to: y.to!.toISOString() })) add('overlap', [x, y], `${x.label} / ${y.label}`);
        }
      }
      const total = list.reduce((s, i) => s + amountOf(i), 0);
      if (total > 0 && otherPayment.has(personId)) add('other-payment', list);
      else if (total > 0 && !validIban(people.get(personId)?.iban ?? '')) add('no-iban', list);
      if (total < 0) add('negative-total', list, String(round2(total)));
    }
    return problems;
  }

  /** Payees (persons, employers) of a run without valid IBAN. */
  private async withoutValidIban(detail: RunDetail): Promise<Payee[]> {
    const people = new Map((await this.directory.paymentDetails(detail.persons.map((p) => p.personId))).map((p) => [p.id, p]));
    return this.payees(detail, people, '').filter((p) => !validIban(p.iban));
  }

  /**
   * Closes the run. Persons (or employers) without valid IBAN block it unless confirmed (`acceptMissingIban`); the
   * confirmed payees are left out of the transfer files and kept as payouts another way, open (task for the treasury,
   * "abgerechnet" for the person) until marked as paid.
   */
  async close(user: AuthenticatedUser, id: string, acceptMissingIban = false): Promise<RunDetail> {
    const detail = await this.detail(id);
    if (detail.status !== 'draft') throw new ConflictException({ code: 'compensation.runClosed' });
    const blocking = detail.problems.filter((p) => p.blocking);
    if (blocking.length) throw new ConflictException({ code: 'compensation.problemsOpen', count: blocking.length });
    const withoutIban = await this.withoutValidIban(detail);
    if (withoutIban.length && !acceptMissingIban) throw new ConflictException({ code: 'compensation.ibanMissing', names: withoutIban.map((p) => p.name) });
    const em = this.em.fork();
    const run = await this.load(em, id);
    run.withoutIban = withoutIban.map((p) => p.name);
    run.manualPayouts = withoutIban.map((p): ManualPayout => ({ key: p.key, name: p.name, personIds: p.personIds, amount: p.amount, paidAt: null, paidBy: null }));
    // A negative total (corrections after a payout) cannot be transferred: those items stay open
    // and are offset against the person's next amounts.
    const totals = new Map<string, number>();
    for (const item of run.items.getItems()) totals.set(item.personId, (totals.get(item.personId) ?? 0) + amountOf(item));
    for (const item of run.items.getItems()) if ((totals.get(item.personId) ?? 0) < 0) item.run = null;
    run.status = 'closed';
    run.closedAt = new Date();
    run.closedBy = user.displayName;
    run.closedById = user.id;
    await em.flush();
    const closed = await this.detail(id);
    await this.events.publish<RunClosedEvent>(COMPENSATION_EVENTS.runClosed, { runId: run.id, number: run.number, from: run.from, to: run.to, total: closed.total });
    await this.audit.log('compensation.run-closed', { runId: run.id, number: run.number, total: closed.total, withoutIban: run.withoutIban });
    return closed;
  }

  /** Factual approval ("sachlich richtig") of a closed run before it is handed over for payout; not by who closed it. */
  async approve(user: AuthenticatedUser, id: string): Promise<RunDetail> {
    const em = this.em.fork();
    const run = await this.load(em, id);
    if (run.status !== 'closed') throw new ConflictException({ code: 'compensation.invalidTransition', from: run.status });
    if (run.approvedAt) throw new ConflictException({ code: 'compensation.alreadyApproved' });
    if (run.closedById === user.id) throw new ForbiddenException({ code: 'compensation.approverIsCloser' });
    Object.assign(run, { approvedAt: new Date(), approvedBy: user.displayName });
    await em.flush();
    await this.audit.log('compensation.run-approved', { runId: run.id, number: run.number });
    return this.detail(id);
  }

  /** A payout another way (payee without IBAN) is done, e.g. in cash or by a later transfer of the treasury. */
  async markManualPayout(user: AuthenticatedUser, id: string, key: string): Promise<RunDetail> {
    const em = this.em.fork();
    const run = await this.load(em, id);
    if (run.status === 'draft') throw new ConflictException({ code: 'compensation.runNotClosed' });
    const payout = (run.manualPayouts ?? []).find((p) => p.key === key);
    if (!payout) throw new NotFoundException({ code: 'compensation.unknownPayout' });
    if (payout.paidAt) throw new ConflictException({ code: 'compensation.payoutDone' });
    run.manualPayouts = run.manualPayouts.map((p) => (p.key === key ? { ...p, paidAt: new Date().toISOString(), paidBy: user.displayName } : p));
    await em.flush();
    await this.audit.log('compensation.manual-payout-marked', { runId: run.id, number: run.number, payee: payout.name, amount: payout.amount });
    return this.detail(id);
  }

  async advance(id: string, status: 'handed-over' | 'paid'): Promise<RunDetail> {
    const em = this.em.fork();
    const run = await this.load(em, id);
    const from = status === 'handed-over' ? 'closed' : 'handed-over';
    if (run.status !== from) throw new ConflictException({ code: 'compensation.invalidTransition', from: run.status });
    if (status === 'handed-over' && (await this.config()).factualApproval && !run.approvedAt) throw new ConflictException({ code: 'compensation.approvalMissing' });
    run.status = status;
    if (status === 'handed-over') run.handedOverAt = new Date();
    else run.paidAt = new Date();
    await em.flush();
    await this.audit.log(`compensation.run-${status}`, { runId: run.id, number: run.number });
    return this.detail(id);
  }

  /** Excel for the treasury: per person, per department, items, problems, loss of earnings per employer. */
  async workbook(id: string, language: Language, brigade: string): Promise<{ number: string; buffer: Buffer }> {
    const detail = await this.detail(id);
    const de = language === 'de';
    const em = this.em.fork();
    const items = await em.find(ItemEntity, { run: id });
    const people = new Map((await this.directory.paymentDetails([...new Set(items.map((i) => i.personId))])).map((p) => [p.id, p]));
    const departments = new Map((await this.organization.departments()).map((d) => [d.id, d.name]));
    const dep = (departmentId: string | null) => (departmentId ? (departments.get(departmentId) ?? '') : de ? '(ohne)' : '(none)');
    const date = (value: string | null) => (value ? formatCell(value, language) : '');
    const time = (d: Date | null | undefined) => (d ? d.toLocaleString(de ? 'de-DE' : 'en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' }) : '');
    const subtitle = `${brigade} · ${de ? 'Lauf' : 'Run'} ${detail.number} · ${date(detail.from)} – ${date(detail.to)}`;
    const wb = new ExcelJS.Workbook();
    wb.creator = 'f.orga';
    const total = de ? 'GESAMT' : 'TOTAL';
    addStyledSheet(wb, de ? 'Betrag pro Person' : 'Amount per person', de ? 'Betrag pro Person' : 'Amount per person', subtitle,
      de ? ['Abteilung', 'Name', 'Einsätze', 'Dienste', 'Betrag (€)'] : ['Department', 'Name', 'Incidents', 'Sessions', 'Amount (€)'],
      [...detail.persons.map((p) => [dep(p.departmentId), p.name, p.incidents, p.sessions, p.amount]), [total, '', '', '', detail.total]], [24, 30, 12, 12, 14]);
    addStyledSheet(wb, de ? 'Summe je Abteilung' : 'Total per department', de ? 'Summe je Abteilung' : 'Total per department', subtitle,
      de ? ['Abteilung', 'Personen', 'Einsätze', 'Betrag (€)'] : ['Department', 'Persons', 'Incidents', 'Amount (€)'],
      [...detail.departments.map((d) => [dep(d.departmentId), d.persons, d.incidents, d.amount]), [total, '', '', detail.total]], [28, 12, 12, 14]);
    const kind = (k: string) => ({ compensation: de ? 'Entschädigung' : 'Compensation', 'loss-of-earnings': de ? 'Verdienstausfall' : 'Loss of earnings', 'flat-rate': de ? 'Pauschale' : 'Flat rate', expenses: de ? 'Auslagen' : 'Expenses' })[k] ?? k;
    addStyledSheet(wb, de ? 'Posten' : 'Items', de ? 'Posten' : 'Items', subtitle,
      de ? ['Abteilung', 'Name', 'Beginn', 'Ende', 'Quelle', 'Bezeichnung', 'Art', 'Stunden', 'Satz (€)', 'Betrag (€)', 'Hinweis'] : ['Department', 'Name', 'Begin', 'End', 'Source', 'Label', 'Kind', 'Hours', 'Rate (€)', 'Amount (€)', 'Note'],
      detail.items.map((i) => {
        const entity = items.find((x) => x.id === i.id)!;
        return [dep(i.departmentId), name(people.get(i.personId)), i.from ? time(entity.from) : date(i.date), time(entity.to), SOURCE_TEXT[i.source]?.[language] ?? i.source, i.label, kind(i.kind), i.hours, i.rate, i.amount, [i.workingHours ? '(AZ)' : '', i.correction ? (de ? 'Korrektur' : 'Correction') : '', i.reason].filter(Boolean).join(' ')];
      }),
      [22, 28, 18, 18, 10, 30, 16, 10, 10, 12, 30]);
    addStyledSheet(wb, de ? 'Hinweise' : 'Notes', de ? 'Hinweise' : 'Notes', subtitle,
      de ? ['Hinweis', 'Name', 'Bezeichnung'] : ['Note', 'Name', 'Label'],
      detail.problems.map((p) => [PROBLEM_TEXT[p.code][language], p.name, p.detail]), [40, 30, 50]);
    const lost = items.filter((i) => i.kind === 'loss-of-earnings');
    addStyledSheet(wb, de ? 'Verdienstausfall' : 'Loss of earnings', de ? 'Verdienstausfall je Arbeitgeber' : 'Loss of earnings per employer', subtitle,
      de ? ['Arbeitgeber', 'Person', 'Datum', 'Bezeichnung', 'Betrag (€)'] : ['Employer', 'Person', 'Date', 'Label', 'Amount (€)'],
      lost.map((i) => [people.get(i.personId)?.employerName || '–', name(people.get(i.personId)), date(i.date), i.label, i.amount === null || i.amount === undefined ? null : Number(i.amount)])
        .toSorted((a, b) => String(a[0]).localeCompare(String(b[0]))),
      [30, 28, 14, 30, 14]);
    return { number: detail.number, buffer: Buffer.from(await wb.xlsx.writeBuffer()) };
  }

  /** Transfer file for the municipality's finance system: name, IBAN, amount, purpose (only persons with a positive total). */
  /**
   * Transfers of a run: one per person with a positive total, minus the loss of earnings assigned to the employer
   * (items from the assignment date), which is paid to the employer, one transfer per employer account.
   */
  private payees(detail: RunDetail, people: Map<string, PaymentDetails>, purpose: string): Payee[] {
    const assigned = (personId: string) => {
      const from = people.get(personId)?.lossOfEarningsAssignedFrom;
      if (!from) return 0;
      return round2(detail.items.filter((i) => i.personId === personId && i.kind === 'loss-of-earnings' && i.date >= from).reduce((sum, i) => sum + (i.amount ?? 0), 0));
    };
    const result: Payee[] = [];
    const employers = new Map<string, Payee>();
    for (const p of detail.persons.filter((x) => x.amount > 0)) {
      const details = people.get(p.personId);
      const toEmployer = Math.min(assigned(p.personId), p.amount);
      const own = round2(p.amount - toEmployer);
      if (own > 0) result.push({ key: p.personId, name: details?.accountHolder || `${details?.firstName ?? ''} ${details?.lastName ?? ''}`.trim() || p.name, iban: details?.iban ?? '', amount: own, purpose, personIds: [p.personId] });
      if (toEmployer > 0) {
        const iban = details?.employerIban ?? '';
        const employer = employers.get(iban || p.personId) ?? { key: `employer-${iban || p.personId}`, name: details?.employerName || p.name, iban, amount: 0, purpose: `${purpose} – Verdienstausfall`, personIds: [] };
        employer.amount = round2(employer.amount + toEmployer);
        employer.personIds.push(p.personId);
        employers.set(iban || p.personId, employer);
      }
    }
    return [...result, ...employers.values()];
  }

  /**
   * SEPA credit transfer file (pain.001.001.09) of a closed run: one transfer per person with a positive total.
   * Refused without a valid payer account, and when a person has no valid IBAN (the names are returned).
   */
  async transferXml(id: string, config: CompensationSettings, executionDate: string): Promise<{ number: string; xml: string }> {
    if (!config.payer.name.trim() || !validIban(config.payer.iban)) throw new BadRequestException({ code: 'compensation.payerMissing' });
    const { detail, payees } = await this.transfers(id, config.transferPurpose);
    const transfers = payees.map((p) => ({ endToEndId: `${detail.number}-${p.key.slice(-8)}`, name: p.name, iban: p.iban, amount: p.amount, purpose: p.purpose }));
    return { number: detail.number, xml: sepaCreditTransfer(config.payer, transfers, { messageId: `FORGA-${detail.number}-${Date.now().toString(36)}`, executionDate, createdAt: new Date() }) };
  }

  /**
   * Statements of a run as PDF letters, one page per person (address, items, total, account), optionally only the
   * persons of one primary department, e.g. to hand them out in the department.
   */
  async statementsPdf(id: string, departmentId: string | null): Promise<{ number: string; pdf: Buffer }> {
    const em = this.em.fork();
    const detail = await this.detail(id);
    const persons = detail.persons.filter((p) => !departmentId || p.departmentId === departmentId);
    if (!persons.length) throw new NotFoundException({ code: 'compensation.noStatements' });
    const people = new Map((await this.directory.paymentDetails(persons.map((p) => p.personId))).map((p) => [p.id, p]));
    const departments = new Map((await this.organization.departments()).map((d) => [d.id, d.name]));
    const otherPayment = new Set((detail.manualPayouts ?? []).flatMap((p) => p.personIds));
    const kindText: Record<string, string> = { 'loss-of-earnings': 'Verdienstausfall', expenses: 'Auslagen' };
    const content = persons.flatMap((person, index) => {
      const details = people.get(person.personId);
      const items = detail.items.filter((i) => i.personId === person.personId);
      const iban = details?.iban ? `…${details.iban.replace(/\s+/g, '').slice(-4)}` : '';
      return [
        { text: [details ? `${details.firstName} ${details.lastName}` : person.name, details?.street, `${details?.postalCode ?? ''} ${details?.city ?? ''}`.trim()].filter(Boolean).join('\n'), margin: [0, 20, 0, 0], ...(index > 0 ? { pageBreak: 'before' } : {}) },
        { text: `Abrechnung der Entschädigung ${detail.number}`, style: 'title' },
        { text: `Zeitraum ${germanDate(detail.from)} bis ${germanDate(detail.to)}${person.departmentId ? ` · ${departments.get(person.departmentId) ?? ''}` : ''}` },
        {
          table: {
            headerRows: 1,
            widths: [60, '*', 40, 50, 60],
            body: [
              [pdfHeaderCell('Datum'), pdfHeaderCell('Bezeichnung'), pdfHeaderCell('Std.', 'right'), pdfHeaderCell('Satz', 'right'), pdfHeaderCell('Betrag', 'right')],
              ...items.map((i) => [
                germanDate(i.date),
                `${i.label}${kindText[i.kind] && !i.label.includes(kindText[i.kind]!) ? ` – ${kindText[i.kind]}` : ''}${i.workingHours ? ' (AZ)' : ''}${i.correction ? ' (Korrektur)' : ''}`,
                { text: i.hours === null ? '' : String(i.hours).replace('.', ','), alignment: 'right' },
                { text: i.rate === null ? '' : euro(i.rate), alignment: 'right' },
                { text: i.amount === null ? 'offen' : euro(i.amount), alignment: 'right' },
              ]),
              [{ text: 'Summe', bold: true, colSpan: 4 }, '', '', '', { text: euro(person.amount), bold: true, alignment: 'right' }],
            ],
          },
          layout: PDF_TABLE_LAYOUT,
          margin: [0, 10, 0, 0],
        },
        {
          text:
            person.amount <= 0 ? 'Es ergibt sich keine Auszahlung.'
            : otherPayment.has(person.personId) ? 'Ohne Bankverbindung wird der Betrag auf anderem Weg ausgezahlt.'
            : iban ? `Der Betrag wird auf das Konto ${iban} überwiesen.`
            : 'Für die Überweisung fehlt eine Bankverbindung.',
          margin: [0, 12, 0, 0],
        },
        ...(details?.lossOfEarningsAssignedFrom && items.some((i) => i.kind === 'loss-of-earnings' && i.date >= details.lossOfEarningsAssignedFrom!)
          ? [{ text: `Der Verdienstausfall ist an ${details.employerName || 'den Arbeitgeber'} abgetreten und wird dorthin überwiesen.`, margin: [0, 4, 0, 0] }]
          : []),
      ];
    });
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const pdf = await renderLetterPdf({ brigade, letterhead: await brigadeLogoDataUrl(em, 'letterhead'), logo: await brigadeLogoDataUrl(em), title: `Abrechnung ${detail.number}`, content, language: 'de', now: new Date() });
    return { number: detail.number, pdf };
  }

  /**
   * Transfers of a closed run (CSV and SEPA alike): payees without valid IBAN confirmed when closing are left out;
   * any other payee without valid IBAN (e.g. an account removed later) refuses the file with the names.
   */
  private async transfers(id: string, purposeTemplate: string): Promise<{ detail: RunDetail; payees: Payee[] }> {
    const detail = await this.detail(id);
    if (detail.status === 'draft') throw new ConflictException({ code: 'compensation.runNotClosed' });
    // With the factual approval in the settings, transfers only exist after it.
    if ((await this.config()).factualApproval && !detail.approvedAt) throw new ConflictException({ code: 'compensation.approvalMissing' });
    const people = new Map((await this.directory.paymentDetails(detail.persons.map((p) => p.personId))).map((p) => [p.id, p]));
    const purpose = purposeTemplate.replace('{period}', `${germanDate(detail.from)}–${germanDate(detail.to)}`);
    // Amounts of persons confirmed without IBAN are paid another way, even if an account or an assignment to the
    // employer was added since (no double payout).
    const confirmed = new Set(detail.manualPayouts.flatMap((p) => p.personIds));
    const payees = this.payees(detail, people, purpose).filter((p) => !p.personIds.some((personId) => confirmed.has(personId)) && (validIban(p.iban) || !detail.withoutIban.includes(p.name)));
    const invalid = payees.filter((p) => !validIban(p.iban)).map((p) => p.name);
    if (invalid.length) throw new ConflictException({ code: 'compensation.invalidIban', names: invalid.join(', ') });
    return { detail, payees };
  }

  async transferCsv(id: string, purposeTemplate: string): Promise<{ number: string; csv: string }> {
    const { detail, payees } = await this.transfers(id, purposeTemplate);
    const lines = payees.map((p) => [p.name, p.iban, p.amount.toFixed(2).replace('.', ','), p.purpose].map(escape).join(';'));
    return { number: detail.number, csv: `﻿Name;IBAN;Betrag;Verwendungszweck\r\n${lines.join('\r\n')}\r\n` };
  }
}

export { PROBLEM_TEXT };
