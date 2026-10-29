import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { assertVersion, Audit, type AuthenticatedUser, berlinDate, berlinDayStart, brigadeLogoDataUrl, DomainEvents, pdfHeaderCell, PDF_TABLE_LAYOUT, renderLetterPdf, SettingsService } from '@forga/core-api';
import type { BrigadeSettings, SearchHit } from '@forga/core-contracts';
import {
  billableHours,
  type Candidate,
  claimOf,
  cleanLocation,
  COST_RECOVERY_EVENTS,
  type CostRecoverySettings,
  CostRecoverySettings as Settings,
  type CostRounding,
  type Debtor,
  ENDED_STATUSES,
  type IncidentNotice,
  IN_EFFECT_STATUSES,
  missingConfiguration,
  missingReasons,
  type Notice,
  type NoticeFilter,
  type NoticeIncident,
  NoticeInput,
  type NoticeIssuedEvent,
  type NoticeStatus,
  OPEN_STATUSES,
  paidOf,
  type Payment,
  PersonnelKind,
  personnelRateOn,
  type Position,
  refundDueOf,
  round2,
  totalOf,
  vehicleRateOn,
} from '@forga/cost-recovery-contracts';
import { EQUIPMENT_USAGE, type EquipmentUsageLookup } from '@forga/equipment-contracts';
import { type ChargeableIncident, INCIDENTS_LOOKUP, type IncidentForCostRecovery, type IncidentsLookup } from '@forga/incidents-contracts';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { AddressBookEntity, IncidentOffenseEntity, NoticeEntity } from '../cost-recovery.entities.js';

type ParsedNotice = ReturnType<typeof NoticeInput.parse>;
type Draft = Pick<Debtor, 'name' | 'street' | 'postalCode' | 'city' | 'role'>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const euro = (value: number) => value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const germanDate = (value: string) => value.split('-').toReversed().join('.');
const germanNumber = (value: number) => String(round2(value)).replace('.', ',');
const time = (value: string) => new Date(value).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
const addDays = (days: number) => berlinDate(new Date(Date.now() + days * 86_400_000));
const DEBTOR_ROLES = new Set(['causer', 'vehicle-keeper', 'owner']);
const address = (d: Draft) => [d.name, d.street, `${d.postalCode} ${d.city}`.trim()].filter(Boolean).join('\n');
const normalized = (value: string) => value.toLocaleLowerCase('de').replace(/\s+/g, ' ').trim();
const debtorKey = (d: Draft) => [d.name, d.street, d.postalCode, d.city].map(normalized).join('|');
const words = (query: string) => query.toLocaleLowerCase('de').split(/[\s,;]+/).filter(Boolean);
/** JSON with sorted keys, to compare contents independent of the key order. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_key, v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).toSorted(([a], [b]) => a.localeCompare(b))) : v));
/** Content of a notice that the four-eyes principle protects (the cash reference of the treasury is not part of it). */
const protectedContent = (n: Pick<NoticeEntity, 'offenseKey' | 'debtors' | 'positions' | 'reasoning' | 'remedy'>) => stable([n.offenseKey, n.debtors, n.positions, n.reasoning, n.remedy]);
/** A recalculated position matches the previous one: the same vehicle, otherwise the same kind and label. */
const positionKey = (p: Position) => (p.kind === 'vehicle' && p.vehicleId ? `vehicle:${p.vehicleId}` : `${p.kind}:${p.label}`);
/** Text without line breaks at hyphens (file and cash numbers in the letter head). */
const noWrap = (text: string) => ({ text, noWrap: true });
/** Display name without a role in brackets, e.g. "Erika Muster (Verwaltung / Kasse)". */
const withoutRole = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '');

/** Rounding of the time as stated in the notice. */
const ROUNDING_TEXT: Record<CostRounding, string> = {
  'started-half-hour': 'je angefangene halbe Stunde',
  'half-then-hour': 'bis 30 Minuten eine halbe Stunde, darüber je angefangene Stunde',
  'started-hour': 'je angefangene Stunde',
};

/** Addition to the personnel label (German documents). */
const PERSONNEL_LABELS: Record<PersonnelKind, string> = {
  volunteer: '',
  'fire-watch': ' – Brandsicherheitswache',
  career: ' – Hauptamt',
  'career-intermediate': ' – Hauptamt mittlerer Dienst',
  'career-elevated': ' – Hauptamt gehobener Dienst',
  'career-higher': ' – Hauptamt höherer Dienst',
};

/** Payment term in force: the one of the last reminder, else the due date of the notice. */
export const currentDueOn = (n: Pick<NoticeEntity, 'dueOn' | 'reminders'>): string | null => n.reminders?.at(-1)?.dueOn ?? n.dueOn ?? null;

/** Open, past the payment term in force (after a reminder its new term) and not paid in full; an objection suspends the reminder. */
export function isOverdue(n: Pick<NoticeEntity, 'status' | 'dueOn' | 'reminders' | 'positions' | 'payments'>, today = berlinDate()): boolean {
  const due = currentDueOn(n);
  return (n.status === 'issued' || n.status === 'handed-over') && Boolean(due) && due! < today && round2(totalOf(n.positions) - paidOf(n.payments ?? [])) > 0;
}

/** Overpaid amount of the notice to refund. */
export const refundDue = (n: Pick<NoticeEntity, 'status' | 'positions' | 'payments'>) => refundDueOf({ status: n.status, positions: n.positions, payments: n.payments ?? [] });

/** Status of an issued notice that is not settled: an objection pending, handed over to the treasury, or only issued. */
const openStatus = (n: NoticeEntity): NoticeStatus => (n.objection?.result === 'pending' ? 'objection' : n.handedOverAt ? 'handed-over' : 'issued');

export const toNoticeDto = (n: NoticeEntity, today = berlinDate()): Notice => {
  const total = totalOf(n.positions);
  const paid = paidOf(n.payments ?? []);
  return {
    id: n.id,
    number: n.number,
    incidentId: n.incidentId,
    dispatchNumber: n.dispatchNumber,
    alarmKeyword: n.alarmKeyword,
    alarmedAt: n.alarmedAt.toISOString(),
    location: n.location,
    offenseKey: n.offenseKey,
    debtors: n.debtors,
    positions: n.positions,
    total,
    reasoning: n.reasoning,
    remedy: n.remedy,
    cashReference: n.cashReference,
    status: n.status,
    submittedAt: iso(n.submittedAt),
    submittedBy: n.submittedBy ?? null,
    submittedById: n.submittedById ?? null,
    lastEditedBy: n.lastEditedBy ?? null,
    lastEditedById: n.lastEditedById ?? null,
    issuedAt: iso(n.issuedAt),
    issuedBy: n.issuedBy ?? null,
    dueOn: n.dueOn ?? null,
    handedOverAt: iso(n.handedOverAt),
    hasPdf: n.issuedAt !== null && n.issuedAt !== undefined,
    objection: n.objection ?? null,
    cancellation: n.cancellation ?? null,
    paidOn: n.paidOn ?? null,
    payments: n.payments ?? [],
    paid,
    // A replaced notice passed its payments on to the amendment.
    balance: n.status === 'amended' ? 0 : round2(claimOf(n) - paid),
    refundDue: refundDue(n),
    overdue: isOverdue(n, today),
    reminders: n.reminders ?? [],
    guestsNotCharged: n.guestsNotCharged ?? 0,
    amends: n.amendsId ? { id: n.amendsId, number: n.amendsNumber ?? '' } : null,
    amendedBy: n.amendedById ? { id: n.amendedById, number: n.amendedByNumber ?? '' } : null,
    version: n.version,
  };
};

/** Suggested legal ground from keyword and statistics. */
export function suggestOffense(incident: Pick<ChargeableIncident, 'falseAlarmType'> & { compensationKind?: string }): string | null {
  if (incident.falseAlarmType === 'fire-alarm-system') return 'fire-alarm-system';
  if (incident.falseAlarmType === 'malicious') return 'false-alarm';
  if (incident.compensationKind === 'fire-watch') return 'voluntary';
  return null;
}

/** Debtors from the parties of all reports: the same person or company listed in several reports counts once. */
export function mergeDebtors(debtors: Debtor[]): Debtor[] {
  const seen = new Map<string, Debtor>();
  for (const d of debtors) if (!seen.has(debtorKey(d))) seen.set(debtorKey(d), d);
  return [...seen.values()];
}

/** Cost notices calculated from chargeable incidents: from the draft over review and issue to payment. */
@Injectable()
export class NoticesService {
  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
    private readonly events: DomainEvents,
    private readonly audit: Audit,
    @Inject(INCIDENTS_LOOKUP) private readonly incidents: IncidentsLookup,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Optional() @Inject(EQUIPMENT_USAGE) private readonly equipment?: EquipmentUsageLookup,
  ) {}

  async config(): Promise<CostRecoverySettings> {
    return Settings.parse((await this.settings.get('cost-recovery.general')) ?? {});
  }

  async candidates(from: string, to: string): Promise<Candidate[]> {
    const incidents = await this.incidents.chargeable(from, to);
    const notices = await this.em.fork().find(NoticeEntity, { incidentId: { $in: incidents.map((i) => i.incidentId) }, status: { $nin: ENDED_STATUSES } });
    const chosen = await this.chosenOffenses(incidents.map((i) => i.incidentId));
    return incidents.map((i) => {
      const notice = notices.find((n) => n.incidentId === i.incidentId);
      return { ...i, location: cleanLocation(i.location), suggestedOffense: chosen.get(i.incidentId) ?? suggestOffense(i), noticeId: notice?.id ?? null, noticeStatus: notice?.status ?? null };
    });
  }

  /** Legal grounds chosen in the incident reports. */
  async chosenOffenses(incidentIds: string[]): Promise<Map<string, string>> {
    if (!incidentIds.length) return new Map();
    return new Map((await this.em.fork().find(IncidentOffenseEntity, { incidentId: { $in: incidentIds } })).map((o) => [o.incidentId, o.offenseKey]));
  }

  /** Legal ground of a chargeable incident (unknown incident 404, not chargeable 409); clearing it is always possible. */
  async setOffense(user: AuthenticatedUser, incidentId: string, offenseKey: string | null): Promise<string | null> {
    if (offenseKey) {
      if (!(await this.config()).offenses.some((o) => o.key === offenseKey)) throw new BadRequestException({ code: 'cost-recovery.unknownOffense' });
      const { chargeable } = await this.incidentState(incidentId);
      if (!chargeable) throw new ConflictException({ code: 'cost-recovery.notChargeable' });
    }
    const em = this.em.fork();
    const existing = await em.findOne(IncidentOffenseEntity, incidentId);
    if (!offenseKey) {
      if (existing) await em.remove(existing).flush();
      return null;
    }
    if (existing) Object.assign(existing, { offenseKey, setBy: user.displayName });
    else em.create(IncidentOffenseEntity, { incidentId, offenseKey, setBy: user.displayName });
    await em.flush();
    return offenseKey;
  }

  /**
   * May the user read the incident: cost notices or costs of incidents (brigade-wide permissions of this card), or the
   * reports of one of its departments (reports of brigade-wide units need the permission brigade-wide).
   */
  async mayReadIncident(user: AuthenticatedUser, incidentId: string): Promise<boolean> {
    if (['cost-recovery.read', 'cost-recovery.write', 'incidents.costs'].some((p) => user.can(p))) return true;
    if (!user.can('incidents.reports.read')) return false;
    const incident = await this.incidents.forCostRecovery(incidentId);
    if (!incident) return false;
    return incident.reports.some((r) => user.can('incidents.reports.read', r.departmentId ?? null));
  }

  /** All notices of an incident, also cancelled, amended and discarded ones (incident page). */
  async ofIncident(incidentId: string): Promise<IncidentNotice[]> {
    const notices = await this.em.fork().find(NoticeEntity, { incidentId }, { orderBy: { createdAt: 'asc' } });
    return notices.map((n) => ({ id: n.id, number: n.number, status: n.status, total: totalOf(n.positions), issuedAt: iso(n.issuedAt) }));
  }

  /** Notices of the filter: status, year, words of number, debtor, dispatch number, cash reference or location, overdue. */
  async find(filter: NoticeFilter): Promise<NoticeEntity[]> {
    const where: FilterQuery<NoticeEntity> = {
      ...(filter.ids ? { id: { $in: filter.ids.split(',').filter(Boolean) } } : {}),
      ...(filter.status ? { status: { $in: filter.status.split(',') as NoticeStatus[] } } : {}),
      ...(filter.year ? { alarmedAt: { $gte: berlinDayStart(`${filter.year}-01-01`), $lt: berlinDayStart(`${filter.year + 1}-01-01`) } } : {}),
    };
    const today = berlinDate();
    const query = words(filter.q ?? '');
    return (await this.em.fork().find(NoticeEntity, where, { orderBy: { alarmedAt: 'desc', number: 'desc' } })).filter((n) => {
      if (filter.overdue === 'true' && !isOverdue(n, today)) return false;
      if (filter.refund === 'true' && refundDue(n) <= 0) return false;
      if (!query.length) return true;
      const text = [n.number, n.dispatchNumber, n.alarmKeyword, n.cashReference, n.location, ...n.debtors.map((d) => d.name)].join(' ').toLocaleLowerCase('de');
      return query.every((w) => text.includes(w));
    });
  }

  async list(filter: NoticeFilter): Promise<Notice[]> {
    const today = berlinDate();
    return (await this.find(filter)).map((n) => toNoticeDto(n, today));
  }

  /** Global search: file number, debtor, dispatch number, cash reference. */
  async search(user: AuthenticatedUser, query: string): Promise<SearchHit[]> {
    if (!user.can('cost-recovery.read') || !words(query).length) return [];
    const found = (await this.find({ q: query })).filter((n) => n.status !== 'discarded').slice(0, 6);
    return found.map((n) => ({
      id: n.id,
      group: { de: 'Kostenbescheide', en: 'Cost notices' },
      title: [n.number, n.debtors.map((d) => d.name).filter(Boolean).join('; ')].filter(Boolean).join(' · '),
      description: `${n.dispatchNumber} ${n.alarmKeyword} · ${germanDate(berlinDate(n.alarmedAt))}`,
      to: `/cost-recovery/notices/${n.id}`,
    }));
  }

  async load(em: EntityManager, id: string): Promise<NoticeEntity> {
    const notice = await em.findOne(NoticeEntity, id);
    if (!notice) throw new NotFoundException();
    return notice;
  }

  /**
   * Personnel and vehicle positions of all reports, materials from the equipment used. Guests (without person file)
   * are charged as volunteers or counted as not charged, per setting `guests`.
   */
  async calculate(incident: IncidentForCostRecovery, config: CostRecoverySettings): Promise<{ positions: Position[]; guestsNotCharged: number }> {
    const date = berlinDate(new Date(incident.alarmedAt));
    const departments = new Map((await this.organization.departments()).map((d) => [d.id, d.shortName || d.name]));
    const vehicles = new Map((await this.organization.vehicles({ includeRetired: true })).map((v) => [v.id, v]));
    // Career staff by their employment in the person file (rate of the career group, else the general career rate);
    // at a fire watch everyone counts at the fire watch rate.
    const fireWatch = incident.compensationKind === 'fire-watch';
    const personIds = [...new Set(incident.reports.flatMap((r) => r.personnel.flatMap((p) => (p.personId ? [p.personId] : []))))];
    const employment = new Map((await this.directory.snapshots(personIds, date)).map((s) => [s.id, s.employment]));
    const kindOf = (personId: string | null): PersonnelKind => {
      if (fireWatch) return 'fire-watch';
      if (!personId) return 'volunteer';
      const e = employment.get(personId);
      if (e === 'career-intermediate' || e === 'career-elevated' || e === 'career-higher') return config.personnelRates.some((r) => r.kind === e) ? e : 'career';
      return e === 'fire-service-employee' ? 'career' : 'volunteer';
    };
    // Each vehicle from its departure (else the report's, else the alarm) to its return (else the report's). A vehicle
    // listed in several reports of the incident is billed once, from the earliest departure to the latest return.
    const usage = new Map<string, { from: string; to: string }>();
    for (const report of incident.reports) {
      for (const v of report.vehicles) {
        const from = v.departedAt ?? report.departedAt ?? report.alarmedAt;
        const to = v.returnedAt ?? report.returnedAt;
        const known = usage.get(v.vehicleId);
        usage.set(v.vehicleId, known ? { from: from < known.from ? from : known.from, to: to > known.to ? to : known.to } : { from, to });
      }
    }
    const billed = new Set<string>();
    const positions: Position[] = [];
    let guestsNotCharged = 0;
    for (const report of incident.reports) {
      const present = report.personnel.filter((p) => config.chargeStandby || !p.standby);
      const guests = present.filter((p) => !p.personId);
      const charged = config.guests === 'volunteer' ? present : present.filter((p) => p.personId);
      const uncharged = config.guests === 'volunteer' ? 0 : guests.length;
      // Guests not charged are counted for the notice (hint and line in the PDF), also when a report has only guests.
      guestsNotCharged += uncharged;
      for (const kind of PersonnelKind.options) {
        const group = charged.filter((p) => kindOf(p.personId) === kind);
        if (!group.length) continue;
        const rate = personnelRateOn(config.personnelRates, kind, date);
        const each = group.map((p) => billableHours(p.from, p.to, config.rounding));
        const hours = round2(each.reduce((sum, h) => sum + h, 0));
        const amount = round2(hours * (rate ?? 0));
        const count = `${group.length} ${group.length === 1 ? 'Person' : 'Personen'}`;
        positions.push({
          kind: 'personnel',
          // The report of a brigade-wide unit is named by its short name, e.g. "Personal EvD".
          label: `Personal ${report.departmentId ? (departments.get(report.departmentId) ?? '') : (report.unitLabel?.de ?? '')}${PERSONNEL_LABELS[kind]} (${count})${rate === null ? ' – kein Satz' : ''}`.replace(/\s+/g, ' ').trim(),
          quantity: hours, unit: 'h', rate: rate ?? 0, amount, computedAmount: amount, reason: '', category: kind, vehicleId: null,
          persons: group.length, hoursEach: each.every((h) => h === each[0]) ? each[0]! : null,
        });
      }
      for (const v of report.vehicles) {
        if (billed.has(v.vehicleId)) continue;
        billed.add(v.vehicleId);
        const vehicle = vehicles.get(v.vehicleId);
        const category = vehicle?.costRecoveryCategory || vehicle?.vehicleType || '';
        const rate = vehicleRateOn(config.vehicleRates, category, date);
        const { from, to } = usage.get(v.vehicleId)!;
        const hours = billableHours(from, to, config.vehicleRounding ?? config.rounding);
        const amount = round2(hours * (rate ?? 0));
        positions.push({
          kind: 'vehicle',
          label: `${vehicle ? vehicle.radioCallSign || vehicle.designation : 'Fahrzeug'}${rate === null ? ' – kein Satz' : ''}`,
          quantity: hours, unit: 'h', rate: rate ?? 0, amount, computedAmount: amount, reason: '', category, vehicleId: v.vehicleId, persons: null, hoursEach: null,
        });
      }
      for (const used of (await this.equipment?.forReport(report.reportId)) ?? []) {
        if (!used.stock) continue;
        const material = config.materials.find((m) => m.key === used.inventoryNumber || m.name === used.name);
        const amount = round2(used.quantity * (material?.price ?? 0));
        positions.push({ kind: 'material', label: material?.name ?? used.name, quantity: used.quantity, unit: material?.unit ?? 'Stück', rate: material?.price ?? 0, amount, computedAmount: amount, reason: '', category: null, vehicleId: null, persons: null, hoursEach: null });
      }
    }
    return { positions, guestsNotCharged };
  }

  private fillTemplate(template: string, incident: Pick<IncidentForCostRecovery, 'alarmedAt' | 'location'>, basis: string): string {
    return template
      .replaceAll('{date}', germanDate(berlinDate(new Date(incident.alarmedAt))))
      .replaceAll('{location}', cleanLocation(incident.location) || '–')
      .replaceAll('{basis}', basis);
  }

  /** The incident with its state for billing: still marked chargeable, all reports released for billing. */
  private async incidentState(incidentId: string): Promise<{ incident: IncidentForCostRecovery; chargeable: boolean; released: boolean }> {
    const incident = await this.incidents.forCostRecovery(incidentId);
    if (!incident) throw new NotFoundException({ code: 'cost-recovery.unknownIncident' });
    const day = berlinDate(new Date(incident.alarmedAt));
    const chargeable = (await this.incidents.chargeable(day, day)).some((i) => i.incidentId === incidentId);
    return { incident, chargeable, released: incident.released };
  }

  /** The incident of a notice with names, for reading it beside the notice. */
  async incidentOf(noticeId: string): Promise<NoticeIncident> {
    const notice = await this.load(this.em.fork(), noticeId);
    const { incident, chargeable, released } = await this.incidentState(notice.incidentId);
    const departments = new Map((await this.organization.departments()).map((d) => [d.id, d.name]));
    const vehicles = new Map((await this.organization.vehicles({ includeRetired: true })).map((v) => [v.id, v.radioCallSign || v.designation]));
    return {
      incidentId: incident.incidentId,
      dispatchNumber: incident.dispatchNumber,
      alarmKeyword: incident.alarmKeyword,
      alarmMessage: incident.alarmMessage,
      alarmedAt: incident.alarmedAt,
      location: cleanLocation(incident.location),
      chargeableReason: incident.chargeableReason,
      notes: incident.notes,
      chargeable,
      released,
      reports: incident.reports.map((r) => ({
        reportId: r.reportId,
        department: r.departmentId ? (departments.get(r.departmentId) ?? '') : (r.unitLabel?.de ?? ''),
        number: r.number,
        status: r.status,
        alarmedAt: r.alarmedAt,
        departedAt: r.departedAt,
        returnedAt: r.returnedAt,
        incidentCommander: r.incidentCommander,
        situation: r.situation,
        actions: r.actions,
        cause: r.cause,
        vehicles: r.vehicles.map((v) => ({ ...v, name: vehicles.get(v.vehicleId) ?? '', crew: r.personnel.filter((p) => p.vehicleId === v.vehicleId).length })),
        personnel: r.personnel.map((p) => ({ name: p.name, vehicle: p.vehicleId ? (vehicles.get(p.vehicleId) ?? '') : '', from: p.from, to: p.to, standby: p.standby })),
        parties: r.parties,
      })),
    };
  }

  /** A draft for a chargeable incident; the settings need legal grounds, legal basis, regulation and legal remedy. */
  async create(incidentId: string): Promise<Notice> {
    const config = await this.config();
    const missing = missingConfiguration(config);
    if (missing.length) throw new ConflictException({ code: 'cost-recovery.notConfigured', missing });
    const { incident, chargeable } = await this.incidentState(incidentId);
    if (!chargeable) throw new ConflictException({ code: 'cost-recovery.notChargeable' });
    const em = this.em.fork();
    if (await em.count(NoticeEntity, { incidentId, status: { $nin: ENDED_STATUSES } })) throw new ConflictException({ code: 'cost-recovery.noticeExists' });
    const offenseKey = (await this.chosenOffenses([incidentId])).get(incidentId) ?? suggestOffense(incident) ?? config.offenses[0]?.key ?? '';
    const offense = config.offenses.find((o) => o.key === offenseKey);
    const book = await em.find(AddressBookEntity, {});
    const debtors = mergeDebtors(
      incident.reports
        .flatMap((r) => r.parties)
        .filter((p) => DEBTOR_ROLES.has(p.role))
        .map((p) => {
          const known = book.find((b) => b.name.toLowerCase() === p.name.toLowerCase());
          return known ? { name: known.name, street: known.street, postalCode: known.postalCode, city: known.city, role: p.role } : { name: p.name, street: p.street, postalCode: p.postalCode, city: p.city, role: p.role };
        }),
    );
    const year = berlinDate(new Date(incident.alarmedAt)).slice(0, 4);
    const used = await em.find(NoticeEntity, { number: { $like: `KE-${year}-%` } }, { fields: ['number'] });
    const highest = Math.max(0, ...used.map((n) => Number(n.number.split('-')[2]) || 0));
    const { positions, guestsNotCharged } = await this.calculate(incident, config);
    const notice = em.create(NoticeEntity, {
      number: `KE-${year}-${String(highest + 1).padStart(3, '0')}`,
      incidentId,
      dispatchNumber: incident.dispatchNumber,
      alarmKeyword: incident.alarmKeyword,
      alarmedAt: new Date(incident.alarmedAt),
      location: cleanLocation(incident.location),
      offenseKey,
      debtors,
      positions,
      guestsNotCharged,
      reasoning: this.fillTemplate(config.reasoning, incident, offense?.legalBasis ?? config.defaultLegalBasis),
      remedy: config.remedy,
      cashReference: '',
      status: 'draft',
    });
    await em.flush();
    return toNoticeDto(notice);
  }

  /**
   * Saves a draft or a notice in review. A change of the content in review (not only the cash reference) is remembered:
   * with the four-eyes principle, whoever changed it cannot issue it.
   */
  async update(user: AuthenticatedUser, id: string, input: ParsedNotice): Promise<Notice> {
    const em = this.em.fork();
    const notice = await this.load(em, id);
    assertVersion(notice, input.version);
    if (notice.status !== 'draft' && notice.status !== 'review') throw new ConflictException({ code: 'cost-recovery.notEditable', status: notice.status });
    const config = await this.config();
    if (!config.offenses.some((o) => o.key === input.offenseKey)) throw new BadRequestException({ code: 'cost-recovery.unknownOffense' });
    const missing = missingReasons(input.positions);
    if (missing.length) throw new BadRequestException({ code: 'cost-recovery.reasonMissing', positions: missing.map((p) => p.label) });
    const changed = protectedContent(notice) !== protectedContent(input);
    Object.assign(notice, { offenseKey: input.offenseKey, debtors: input.debtors, positions: input.positions, reasoning: input.reasoning, remedy: input.remedy, cashReference: input.cashReference });
    if (changed && notice.status === 'review') Object.assign(notice, { lastEditedBy: user.displayName, lastEditedById: user.id });
    await em.flush();
    return toNoticeDto(notice);
  }

  /**
   * Calculates the positions again from the incident (e.g. after a corrected report). Positions added by hand stay; a
   * position whose calculation is unchanged keeps its deviation (amount, rate category such as "als MTW", reason).
   */
  async recalculate(id: string): Promise<Notice> {
    const em = this.em.fork();
    const notice = await this.load(em, id);
    if (notice.status !== 'draft') throw new ConflictException({ code: 'cost-recovery.notEditable', status: notice.status });
    const incident = await this.incidents.forCostRecovery(notice.incidentId);
    if (!incident) throw new NotFoundException({ code: 'cost-recovery.unknownIncident' });
    const manual = notice.positions.filter((p) => p.computedAmount === null);
    const deviations = new Map(notice.positions.filter((p) => p.computedAmount !== null && p.reason.trim() && round2(p.amount) !== round2(p.computedAmount)).map((p) => [positionKey(p), p]));
    const { positions, guestsNotCharged } = await this.calculate(incident, await this.config());
    const kept = positions.map((p) => {
      const before = deviations.get(positionKey(p));
      return before && round2(before.computedAmount!) === round2(p.computedAmount!) ? before : p;
    });
    Object.assign(notice, { positions: [...kept, ...manual], guestsNotCharged });
    await em.flush();
    return toNoticeDto(notice);
  }

  private async transition(id: string, from: NoticeStatus[], change: (notice: NoticeEntity) => void | Promise<void>): Promise<Notice> {
    const em = this.em.fork();
    const notice = await this.load(em, id);
    if (!from.includes(notice.status)) throw new ConflictException({ code: 'cost-recovery.invalidTransition', from: notice.status });
    await change(notice);
    await em.flush();
    return toNoticeDto(notice);
  }

  /** For review: needs a debtor with name; remembers who submitted it (four-eyes principle). */
  submit(user: AuthenticatedUser, id: string): Promise<Notice> {
    return this.transition(id, ['draft'], (n) => {
      if (!n.debtors.length) throw new BadRequestException({ code: 'cost-recovery.debtorMissing' });
      if (n.debtors.some((d) => !d.name.trim())) throw new BadRequestException({ code: 'cost-recovery.debtorIncomplete' });
      Object.assign(n, { status: 'review', submittedAt: new Date(), submittedBy: user.displayName, submittedById: user.id, lastEditedBy: null, lastEditedById: null });
    }).then((n) => this.logged('cost-recovery.notice-submitted', n));
  }

  returnToDraft(id: string): Promise<Notice> {
    return this.transition(id, ['review'], (n) => {
      Object.assign(n, { status: 'draft', submittedAt: null, submittedBy: null, submittedById: null, lastEditedBy: null, lastEditedById: null });
    });
  }

  /** Audit entry of a step of the notice. */
  private async logged(action: string, n: Notice, details: Record<string, unknown> = {}): Promise<Notice> {
    await this.audit.log(action, { noticeId: n.id, number: n.number, status: n.status, ...details });
    return n;
  }

  /** Name below the signature: the person linked to the user, else the display name (without a role in brackets). */
  private async signerName(user: AuthenticatedUser): Promise<string> {
    const [person] = user.personId ? await this.directory.snapshots([user.personId]) : [];
    return person ? `${person.firstName} ${person.lastName}` : withoutRole(user.displayName);
  }

  /** Paid on the notice an amendment replaces: carried over when the amendment is issued. */
  private async paidBefore(n: NoticeEntity): Promise<number> {
    if (!n.amendsId || n.issuedAt) return 0;
    const original = await this.em.fork().findOne(NoticeEntity, n.amendsId);
    return original ? paidOf(original.payments ?? []) : 0;
  }

  /**
   * Issues the notice: only for an incident still chargeable whose reports are all released for billing, by someone
   * other than the submitter and the last editor in review when the four-eyes principle is on, with the cash
   * reference when it is required.
   * Due date, PDF stored unchangeably, event `cost-recovery.notice.issued`.
   */
  async issue(user: AuthenticatedUser, id: string): Promise<Notice> {
    const config = await this.config();
    const current = await this.load(this.em.fork(), id);
    const { chargeable, released } = await this.incidentState(current.incidentId);
    const signer = await this.signerName(user);
    const paidBefore = await this.paidBefore(current);
    const result = await this.transition(id, ['review'], async (n) => {
      if (!chargeable) throw new ConflictException({ code: 'cost-recovery.notChargeable' });
      if (!released) throw new ConflictException({ code: 'cost-recovery.notReleased' });
      if (config.fourEyes && (n.submittedById === user.id || n.lastEditedById === user.id)) throw new ForbiddenException({ code: 'cost-recovery.fourEyes' });
      if (totalOf(n.positions) <= 0) throw new BadRequestException({ code: 'cost-recovery.totalZero' });
      if (n.positions.some((p) => p.rate === 0 && p.amount === 0)) throw new BadRequestException({ code: 'cost-recovery.rateMissing' });
      if (!n.remedy.trim()) throw new BadRequestException({ code: 'cost-recovery.remedyMissing' });
      if (config.cashReferenceRequired && !n.cashReference) throw new BadRequestException({ code: 'cost-recovery.cashReferenceMissing' });
      if (n.cashReference) {
        // Payments are matched by the cash reference: it may belong to one notice in effect only (an amendment takes over the one of its original).
        const others = await this.em.fork().count(NoticeEntity, { cashReference: n.cashReference, id: { $nin: [n.id, ...(n.amendsId ? [n.amendsId] : [])] }, status: { $in: [...OPEN_STATUSES, 'paid'] } });
        if (others) throw new ConflictException({ code: 'cost-recovery.cashReferenceUsed', cashReference: n.cashReference });
      }
      const issuedAt = new Date();
      const due = new Date(issuedAt.getTime() + config.dueDays * 86_400_000);
      Object.assign(n, { status: 'issued', issuedAt, issuedBy: signer, dueOn: berlinDate(due) });
      n.pdf = await this.renderPdf(n, config, paidBefore);
    });
    const issued = result.amends ? await this.replaceOriginal(result) : result;
    await this.events.publish<NoticeIssuedEvent>(COST_RECOVERY_EVENTS.noticeIssued, { noticeId: issued.id, incidentId: issued.incidentId, total: issued.total });
    return this.logged('cost-recovery.notice-issued', issued, { total: issued.total, amends: issued.amends?.number ?? null });
  }

  /**
   * An issued amendment replaces its original, which stays as document but no longer counts. Payments on the original
   * are carried over, so the balance of the amendment is right.
   */
  private async replaceOriginal(amendment: Notice): Promise<Notice> {
    const em = this.em.fork();
    const original = await em.findOne(NoticeEntity, amendment.amends!.id);
    const notice = await this.load(em, amendment.id);
    if (!original) return toNoticeDto(notice);
    Object.assign(original, { status: 'amended', amendedById: amendment.id, amendedByNumber: amendment.number });
    const carried = (original.payments ?? []).filter((p) => !p.reversal).map((p) => ({ ...p, id: uuidv7(), note: [p.note, `aus ${original.number}`].filter(Boolean).join(' · ') }));
    if (carried.length) {
      notice.payments = [...(notice.payments ?? []), ...carried];
      this.settle(notice);
    }
    await em.flush();
    return toNoticeDto(notice);
  }

  /** Hands one notice in effect over to the treasury (also when already paid or in objection); only once. */
  handOver(id: string): Promise<Notice> {
    return this.transition(id, IN_EFFECT_STATUSES, (n) => {
      if (n.handedOverAt) throw new ConflictException({ code: 'cost-recovery.invalidTransition', from: n.status });
      n.handedOverAt = new Date();
      if (n.status === 'issued') n.status = 'handed-over';
    }).then((n) => this.logged('cost-recovery.notice-handed-over', n));
  }

  /** Paid in full: status `paid` with the day of the last payment; otherwise back to the open status. */
  private settle(n: NoticeEntity): void {
    const active = (n.payments ?? []).filter((p) => !p.reversal);
    const full = active.length > 0 && paidOf(active) >= totalOf(n.positions);
    // Cancelled notices keep their status (payments on them are refunded).
    if (!IN_EFFECT_STATUSES.includes(n.status)) return;
    n.paidOn = full ? active.filter((p) => p.amount > 0).map((p) => p.date).toSorted().at(-1)! : null;
    // A pending objection stays visible as status, also when the notice is paid.
    n.status = full && n.objection?.result !== 'pending' ? 'paid' : openStatus(n);
  }

  /** A payment (also partial) on or after the day of issue and not in the future; an overpayment shows as negative balance. */
  addPayment(user: AuthenticatedUser, id: string, input: { date: string; amount: number; note: string }): Promise<Notice> {
    return this.transition(id, [...OPEN_STATUSES, 'paid'], (n) => {
      if (input.date < berlinDate(n.issuedAt!)) throw new BadRequestException({ code: 'cost-recovery.paymentBeforeIssue' });
      if (input.date > berlinDate()) throw new BadRequestException({ code: 'cost-recovery.paymentInFuture' });
      const payment: Payment = { id: uuidv7(), date: input.date, amount: round2(input.amount), note: input.note, recordedBy: user.displayName, reversal: null };
      n.payments = [...(n.payments ?? []), payment];
      this.settle(n);
    }).then((n) => this.logged('cost-recovery.payment-recorded', n, { date: input.date, amount: round2(input.amount) }));
  }

  /**
   * Refund of an overpayment (or of payments on a cancelled notice), recorded as a negative payment; at most the
   * amount due. The task "Erstattung" disappears when nothing is left to refund.
   */
  refund(user: AuthenticatedUser, id: string, input: { date: string; amount: number; note: string }): Promise<Notice> {
    return this.transition(id, [...IN_EFFECT_STATUSES, 'cancelled'], (n) => {
      const due = refundDue(n);
      if (due <= 0) throw new ConflictException({ code: 'cost-recovery.noRefundDue' });
      if (round2(input.amount) > due) throw new BadRequestException({ code: 'cost-recovery.refundTooHigh', due: due.toFixed(2) });
      if (input.date < berlinDate(n.issuedAt!)) throw new BadRequestException({ code: 'cost-recovery.paymentBeforeIssue' });
      if (input.date > berlinDate()) throw new BadRequestException({ code: 'cost-recovery.paymentInFuture' });
      n.payments = [...(n.payments ?? []), { id: uuidv7(), date: input.date, amount: -round2(input.amount), note: input.note || 'Erstattung', recordedBy: user.displayName, reversal: null }];
      this.settle(n);
    }).then((n) => this.logged('cost-recovery.refund-recorded', n, { date: input.date, amount: round2(input.amount) }));
  }

  /** Reverses a payment (e.g. booked to the wrong notice), with reason; a paid notice becomes open again. */
  reversePayment(user: AuthenticatedUser, id: string, paymentId: string, reason: string): Promise<Notice> {
    return this.transition(id, [...IN_EFFECT_STATUSES, 'cancelled'], (n) => {
      const payment = (n.payments ?? []).find((p) => p.id === paymentId);
      if (!payment) throw new NotFoundException({ code: 'cost-recovery.unknownPayment' });
      if (payment.reversal) throw new ConflictException({ code: 'cost-recovery.paymentReversed' });
      n.payments = n.payments.map((p) => (p.id === paymentId ? { ...p, reversal: { date: berlinDate(), reason, by: user.displayName } } : p));
      this.settle(n);
    }).then((n) => this.logged('cost-recovery.payment-reversed', n, { paymentId, reason }));
  }

  /**
   * Objection, also against a paid notice: upheld lifts the notice (payments are then refunded); rejected restores the
   * status before the objection (issued or handed over, or paid).
   */
  objection(id: string, input: { date: string; result: 'pending' | 'upheld' | 'rejected'; note: string }): Promise<Notice> {
    return this.transition(id, IN_EFFECT_STATUSES, (n) => {
      n.objection = input;
      if (input.result === 'upheld') {
        n.status = 'cancelled';
        n.cancellation = { date: input.date, reason: `Widerspruch abgeholfen: ${input.note}` };
        return;
      }
      n.status = openStatus(n);
      this.settle(n);
    }).then((n) => this.logged('cost-recovery.objection-recorded', n, { result: input.result }));
  }

  /**
   * Amendment notice (Änderungsbescheid) for an issued notice, also a paid one: a draft copy with the number of the
   * original plus `-Ä1`, `-Ä2` … Issuing it replaces the original (status `amended`). One open amendment per notice.
   */
  async amend(id: string): Promise<Notice> {
    const em = this.em.fork();
    const original = await this.load(em, id);
    if (!IN_EFFECT_STATUSES.includes(original.status)) throw new ConflictException({ code: 'cost-recovery.notAmendable', status: original.status });
    if (await em.count(NoticeEntity, { amendsId: original.id, status: { $in: ['draft', 'review'] } })) throw new ConflictException({ code: 'cost-recovery.amendmentOpen' });
    const count = await em.count(NoticeEntity, { amendsId: original.id });
    const base = original.number.replace(/-Ä\d+$/, '');
    const amendment = em.create(NoticeEntity, {
      number: `${base}-Ä${count + 1}`,
      incidentId: original.incidentId,
      dispatchNumber: original.dispatchNumber,
      alarmKeyword: original.alarmKeyword,
      alarmedAt: original.alarmedAt,
      location: original.location,
      offenseKey: original.offenseKey,
      debtors: original.debtors,
      positions: original.positions,
      guestsNotCharged: original.guestsNotCharged,
      reasoning: original.reasoning,
      remedy: original.remedy,
      // Same claim: the amendment keeps the cash reference; only one of both is in effect at a time.
      cashReference: original.cashReference,
      status: 'draft',
      amendsId: original.id,
      amendsNumber: original.number,
    });
    await em.flush();
    return this.logged('cost-recovery.amendment-created', toNoticeDto(amendment), { amends: original.number });
  }

  /** Discards a draft or a notice in review (never issued); the reason is optional. */
  discard(id: string, reason: string): Promise<Notice> {
    return this.transition(id, ['draft', 'review'], (n) => {
      n.status = 'discarded';
      n.cancellation = { date: berlinDate(), reason };
    }).then((n) => this.logged('cost-recovery.notice-discarded', n, { reason }));
  }

  /** Deletes a draft (never submitted or issued); its file number may be used again. */
  async remove(id: string): Promise<void> {
    const em = this.em.fork();
    const notice = await this.load(em, id);
    if (notice.status !== 'draft') throw new ConflictException({ code: 'cost-recovery.notDraft', status: notice.status });
    const dto = toNoticeDto(notice);
    em.remove(notice);
    await em.flush();
    await this.logged('cost-recovery.notice-deleted', dto);
  }

  /** Lifts an issued notice (Aufhebung), e.g. waiver for undue hardship, also a paid one (payments are then refunded). */
  cancel(id: string, reason: string): Promise<Notice> {
    return this.transition(id, IN_EFFECT_STATUSES, (n) => {
      n.status = 'cancelled';
      n.cancellation = { date: berlinDate(), reason };
    }).then((n) => this.logged('cost-recovery.notice-cancelled', n, { reason }));
  }

  /** Payment reminder for an overdue notice: recorded with a new payment term; the letter is a PDF. */
  async remind(user: AuthenticatedUser, id: string): Promise<Notice> {
    const config = await this.config();
    const signer = await this.signerName(user);
    const notice = await this.transition(id, ['issued', 'handed-over'], (n) => {
      if (!isOverdue(n)) throw new ConflictException({ code: 'cost-recovery.notOverdue' });
      n.reminders = [...(n.reminders ?? []), { date: berlinDate(), dueOn: addDays(config.reminder.days), by: signer }];
    });
    return this.logged('cost-recovery.reminder-recorded', notice, { dueOn: notice.reminders.at(-1)?.dueOn });
  }

  async pdf(id: string): Promise<{ number: string; data: Buffer }> {
    const em = this.em.fork();
    const notice = await em.findOne(NoticeEntity, id, { populate: ['pdf'] });
    if (!notice) throw new NotFoundException();
    // Issued: exactly the stored version. Draft: a preview.
    if (notice.pdf) return { number: notice.number, data: Buffer.from(notice.pdf) };
    return { number: notice.number, data: await this.renderPdf(notice, await this.config(), await this.paidBefore(notice)) };
  }

  /** Letter head: authority, date, file number, cash reference; then the debtors. */
  private letterHead(n: NoticeEntity, config: CostRecoverySettings, brigade: BrigadeSettings | null, date: string): unknown[] {
    return [
      {
        columns: [
          { text: [config.authority || brigade?.name || '', '\n', config.authorityAddress].join(''), style: 'small', width: '*' },
          { stack: [noWrap(`Datum: ${germanDate(date)}`), noWrap(`Aktenzeichen: ${n.number}`), ...(n.cashReference ? [noWrap(`Kassenzeichen: ${n.cashReference}`)] : [])], width: 'auto', alignment: 'right' },
        ],
      },
      { stack: n.debtors.map((d) => ({ text: address(d), margin: [0, 6, 0, 0] })), margin: [0, 24, 0, 0] },
    ];
  }

  /** Name of the person who issues (or reminds), without a role in brackets, with the function of the settings below. */
  private signature(name: string | null, config: CostRecoverySettings): unknown {
    return { text: `\n\n${[(name && withoutRole(name)) || '(Name der erlassenden Person)', config.signer].filter(Boolean).join('\n')}`, margin: [0, 20, 0, 0] };
  }

  private async render(n: NoticeEntity, title: string, content: unknown[]): Promise<Buffer> {
    const em = this.em.fork();
    return renderLetterPdf({
      brigade: await this.settings.get<BrigadeSettings>('brigade'),
      letterhead: await brigadeLogoDataUrl(em, 'letterhead'),
      logo: await brigadeLogoDataUrl(em),
      title: `${title} ${n.number}`,
      content,
      language: 'de',
      now: new Date(),
    });
  }

  /** Quantity of a position: personnel as "persons × hours", else quantity and unit. */
  private quantityText(p: Position): string {
    if (p.kind === 'personnel' && p.persons) return p.hoursEach !== null ? `${p.persons} × ${germanNumber(p.hoursEach)} ${p.unit}` : `${p.persons} Pers., ${germanNumber(p.quantity)} ${p.unit}`;
    return `${germanNumber(p.quantity)} ${p.unit}`;
  }

  /** The notice as PDF; an amendment shows what was paid on the replaced notice and what is left to pay or to refund. */
  private async renderPdf(n: NoticeEntity, config: CostRecoverySettings, paidBefore = 0): Promise<Buffer> {
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const offense = config.offenses.find((o) => o.key === n.offenseKey);
    const total = totalOf(n.positions);
    const date = n.issuedAt ? berlinDate(n.issuedAt) : berlinDate();
    // Times of the incident: alarm, first departure, last return over all reports.
    const incident = await this.incidents.forCostRecovery(n.incidentId);
    const departed = incident?.reports.flatMap((r) => (r.departedAt ? [r.departedAt] : [])).toSorted()[0];
    const returned = incident?.reports.map((r) => r.returnedAt).toSorted().at(-1);
    const alarmDay = berlinDate(n.alarmedAt);
    const at = (value: string) => `${berlinDate(new Date(value)) === alarmDay ? '' : `${germanDate(berlinDate(new Date(value)))} `}${time(value)} Uhr`;
    const times = [`Alarmierung ${time(n.alarmedAt.toISOString())} Uhr`, departed && `Ausrücken ${at(departed)}`, returned && `Rückkehr ${at(returned)}`].filter(Boolean).join(' · ');
    const remaining = round2(total - paidBefore);
    const account = `${config.bankAccount ? ` auf das Konto ${config.bankAccount}` : ''}${n.cashReference ? ` unter Angabe des Kassenzeichens ${n.cashReference}` : ''}`;
    const due = n.dueOn ? germanDate(n.dueOn) : '…';
    const paymentText = !paidBefore
      ? `Der Betrag ist bis zum ${due} zu zahlen${account}.`
      : remaining > 0
        ? `Der noch offene Betrag von ${euro(remaining)} ist bis zum ${due} zu zahlen${account}.`
        : remaining < 0
          ? `Der zu viel gezahlte Betrag von ${euro(-remaining)} wird erstattet.`
          : 'Der Betrag ist durch die bisherigen Zahlungen beglichen.';
    const vehicleRounding = config.vehicleRounding ?? config.rounding;
    const rounding = vehicleRounding === config.rounding
      ? `Die Zeiten werden ${ROUNDING_TEXT[config.rounding]} berechnet.`
      : `Die Zeiten des Personals werden ${ROUNDING_TEXT[config.rounding]}, die der Fahrzeuge ${ROUNDING_TEXT[vehicleRounding]} berechnet.`;
    const content: unknown[] = [
      ...this.letterHead(n, config, brigade, date),
      { text: `${n.amendsId ? 'Änderungsbescheid' : 'Kostenbescheid'}${n.issuedAt ? '' : ' (Entwurf)'}`, style: 'title' },
      ...(n.amendsId ? [{ text: `Der Kostenbescheid ${n.amendsNumber} wird aufgehoben und durch diesen Bescheid ersetzt.`, margin: [0, 0, 0, 6] }] : []),
      { text: `Feuerwehreinsatz am ${germanDate(alarmDay)}${n.location ? ` in ${cleanLocation(n.location)}` : ''} (${n.alarmKeyword}, Einsatz-Nr. ${n.dispatchNumber})` },
      { text: times, style: 'small', margin: [0, 2, 0, 0] },
      { text: 'Rechtsgrundlage', style: 'heading' },
      { text: `${[offense ? `${offense.legalBasis} (${offense.name.de})` : config.defaultLegalBasis, config.regulation, config.statute].filter((t) => t.trim()).join('; ')}.` },
      { text: 'Kosten', style: 'heading' },
      {
        table: {
          headerRows: 1,
          widths: ['*', 85, 65, 70],
          body: [
            [pdfHeaderCell('Position'), pdfHeaderCell('Menge', 'right'), pdfHeaderCell('Satz', 'right'), pdfHeaderCell('Betrag', 'right')],
            ...n.positions.map((p) => [
              p.reason && p.computedAmount !== null && round2(p.amount) !== round2(p.computedAmount) ? { text: [p.label, { text: `\n${p.reason}`, style: 'small' }] } : p.label,
              { text: this.quantityText(p), alignment: 'right' },
              { text: euro(p.rate), alignment: 'right' },
              { text: euro(p.amount), alignment: 'right' },
            ]),
            [{ text: 'Gesamtbetrag', bold: true, colSpan: 3 }, '', '', { text: euro(total), bold: true, alignment: 'right' }],
            ...(paidBefore
              ? [
                  [{ text: `Bereits gezahlt (auf ${n.amendsNumber ?? 'den ersetzten Bescheid'})`, colSpan: 3 }, '', '', { text: euro(-paidBefore), alignment: 'right' }],
                  [{ text: remaining < 0 ? 'Zu erstatten' : 'Noch zu zahlen', bold: true, colSpan: 3 }, '', '', { text: euro(Math.abs(remaining)), bold: true, alignment: 'right' }],
                ]
              : []),
          ],
        },
        layout: PDF_TABLE_LAYOUT,
      },
      { text: rounding, style: 'small', margin: [0, 4, 0, 0] },
      ...(n.guestsNotCharged ? [{ text: `${n.guestsNotCharged} ${n.guestsNotCharged === 1 ? 'Gast ohne Personalakte wurde' : 'Gäste ohne Personalakte wurden'} nicht berechnet.`, style: 'small', margin: [0, 2, 0, 0] }] : []),
      { text: paymentText, margin: [0, 10, 0, 0] },
      ...(n.debtors.length > 1 && config.jointLiability.trim() ? [{ text: config.jointLiability, margin: [0, 6, 0, 0] }] : []),
      { text: 'Begründung', style: 'heading' },
      { text: n.reasoning },
      { text: 'Rechtsbehelfsbelehrung', style: 'heading' },
      { text: n.remedy },
      this.signature(n.issuedBy ?? null, config),
    ];
    return this.render(n, n.amendsId ? 'Änderungsbescheid' : 'Kostenbescheid', content);
  }

  /** Letter of a recorded reminder (`index`, default the last one) with the text of the settings. */
  async reminderPdf(id: string, index?: number): Promise<{ number: string; data: Buffer }> {
    const n = await this.load(this.em.fork(), id);
    const reminders = n.reminders ?? [];
    const reminder = reminders[index ?? reminders.length - 1];
    if (!reminder) throw new NotFoundException({ code: 'cost-recovery.noReminder' });
    const config = await this.config();
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const total = totalOf(n.positions);
    const paid = paidOf(n.payments ?? []);
    const open = round2(total - paid);
    const text = config.reminder.text
      .replaceAll('{number}', n.number)
      .replaceAll('{issuedOn}', n.issuedAt ? germanDate(berlinDate(n.issuedAt)) : '')
      .replaceAll('{total}', euro(total))
      .replaceAll('{open}', euro(open))
      .replaceAll('{dueOn}', n.dueOn ? germanDate(n.dueOn) : '')
      .replaceAll('{newDueOn}', germanDate(reminder.dueOn));
    const content: unknown[] = [
      ...this.letterHead(n, config, brigade, reminder.date),
      { text: config.reminder.title, style: 'title' },
      { text: `Kostenbescheid ${n.number} – Feuerwehreinsatz am ${germanDate(berlinDate(n.alarmedAt))} (${n.alarmKeyword}, Einsatz-Nr. ${n.dispatchNumber})`, margin: [0, 0, 0, 8] },
      { text },
      {
        table: {
          widths: ['*', 90],
          body: [
            ['Festgesetzter Betrag', { text: euro(total), alignment: 'right' }],
            ['Bisher gezahlt', { text: euro(paid), alignment: 'right' }],
            [{ text: 'Offener Betrag', bold: true }, { text: euro(open), bold: true, alignment: 'right' }],
          ],
        },
        layout: PDF_TABLE_LAYOUT,
        margin: [0, 10, 0, 0],
      },
      ...(config.bankAccount || n.cashReference ? [{ text: `Bitte überweisen Sie den Betrag${config.bankAccount ? ` auf das Konto ${config.bankAccount}` : ''}${n.cashReference ? ` unter Angabe des Kassenzeichens ${n.cashReference}` : ''}.`, margin: [0, 10, 0, 0] }] : []),
      this.signature(reminder.by, config),
    ];
    return { number: n.number, data: await this.render(n, config.reminder.title, content) };
  }
}
