import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { assertVersion, type AuthenticatedUser, berlinDate, berlinDayStart, brigadeLogoDataUrl, DomainEvents, pdfHeaderCell, PDF_TABLE_LAYOUT, renderLetterPdf, SettingsService } from '@forga/core-api';
import type { BrigadeSettings } from '@forga/core-contracts';
import {
  billableHours,
  COST_RECOVERY_EVENTS,
  CostRecoverySettings,
  type Candidate,
  type Debtor,
  missingReasons,
  type Notice,
  NoticeInput,
  type NoticeIssuedEvent,
  type NoticeStatus,
  PersonnelKind,
  personnelRateOn,
  type Position,
  round2,
  totalOf,
  vehicleRateOn,
} from '@forga/cost-recovery-contracts';
import { EQUIPMENT_USAGE, type EquipmentUsageLookup } from '@forga/equipment-contracts';
import { type ChargeableIncident, INCIDENTS_LOOKUP, type IncidentForCostRecovery, type IncidentsLookup } from '@forga/incidents-contracts';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { AddressBookEntity, IncidentOffenseEntity, NoticeEntity } from '../cost-recovery.entities.js';

type ParsedNotice = ReturnType<typeof NoticeInput.parse>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const euro = (value: number) => value.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
const germanDate = (value: string) => value.split('-').toReversed().join('.');
const DEBTOR_ROLES = new Set(['causer', 'vehicle-keeper', 'owner']);
const address = (d: Debtor) => [d.name, d.street, `${d.postalCode} ${d.city}`.trim()].filter(Boolean).join('\n');

export const toNoticeDto = (n: NoticeEntity): Notice => ({
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
  total: totalOf(n.positions),
  reasoning: n.reasoning,
  remedy: n.remedy,
  cashReference: n.cashReference,
  status: n.status,
  issuedAt: iso(n.issuedAt),
  issuedBy: n.issuedBy ?? null,
  dueOn: n.dueOn ?? null,
  hasPdf: n.issuedAt !== null && n.issuedAt !== undefined,
  objection: n.objection ?? null,
  cancellation: n.cancellation ?? null,
  paidOn: n.paidOn ?? null,
  amends: n.amendsId ? { id: n.amendsId, number: n.amendsNumber ?? '' } : null,
  amendedBy: n.amendedById ? { id: n.amendedById, number: n.amendedByNumber ?? '' } : null,
  version: n.version,
});

/** Suggested legal ground from keyword and statistics. */
export function suggestOffense(incident: Pick<ChargeableIncident, 'falseAlarmType'> & { compensationKind?: string }): string | null {
  if (incident.falseAlarmType === 'fire-alarm-system') return 'fire-alarm-system';
  if (incident.falseAlarmType === 'malicious') return 'false-alarm';
  if (incident.compensationKind === 'fire-watch') return 'voluntary';
  return null;
}

/** Cost notices (§ 34 FwG BW) calculated from chargeable incidents. */
/** Addition to the personnel label (German documents). */
const PERSONNEL_LABELS: Record<PersonnelKind, string> = {
  volunteer: '',
  'fire-watch': ' – Brandsicherheitswache',
  career: ' – Hauptamt',
  'career-intermediate': ' – Hauptamt mittlerer Dienst',
  'career-elevated': ' – Hauptamt gehobener Dienst',
  'career-higher': ' – Hauptamt höherer Dienst',
};

@Injectable()
export class NoticesService {
  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
    private readonly events: DomainEvents,
    @Inject(INCIDENTS_LOOKUP) private readonly incidents: IncidentsLookup,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Optional() @Inject(EQUIPMENT_USAGE) private readonly equipment?: EquipmentUsageLookup,
  ) {}

  async config(): Promise<CostRecoverySettings> {
    return CostRecoverySettings.parse((await this.settings.get('cost-recovery.general')) ?? {});
  }

  async candidates(from: string, to: string): Promise<Candidate[]> {
    const incidents = await this.incidents.chargeable(from, to);
    const notices = await this.em.fork().find(NoticeEntity, { incidentId: { $in: incidents.map((i) => i.incidentId) }, status: { $nin: ['cancelled', 'amended'] } });
    const chosen = await this.chosenOffenses(incidents.map((i) => i.incidentId));
    return incidents.map((i) => {
      const notice = notices.find((n) => n.incidentId === i.incidentId);
      return { ...i, suggestedOffense: chosen.get(i.incidentId) ?? suggestOffense(i), noticeId: notice?.id ?? null, noticeStatus: notice?.status ?? null };
    });
  }

  /** Legal grounds chosen in the incident reports. */
  async chosenOffenses(incidentIds: string[]): Promise<Map<string, string>> {
    if (!incidentIds.length) return new Map();
    return new Map((await this.em.fork().find(IncidentOffenseEntity, { incidentId: { $in: incidentIds } })).map((o) => [o.incidentId, o.offenseKey]));
  }

  async setOffense(user: AuthenticatedUser, incidentId: string, offenseKey: string | null): Promise<string | null> {
    if (offenseKey && !(await this.config()).offenses.some((o) => o.key === offenseKey)) throw new BadRequestException({ code: 'cost-recovery.unknownOffense' });
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

  async list(filter: { status?: string; year?: number }): Promise<Notice[]> {
    const where = {
      ...(filter.status ? { status: { $in: filter.status.split(',') as NoticeStatus[] } } : {}),
      ...(filter.year ? { alarmedAt: { $gte: berlinDayStart(`${filter.year}-01-01`), $lt: berlinDayStart(`${filter.year + 1}-01-01`) } } : {}),
    };
    return (await this.em.fork().find(NoticeEntity, where, { orderBy: { alarmedAt: 'desc' } })).map(toNoticeDto);
  }

  async load(em: EntityManager, id: string): Promise<NoticeEntity> {
    const notice = await em.findOne(NoticeEntity, id);
    if (!notice) throw new NotFoundException();
    return notice;
  }

  /** Personnel and vehicle positions of all reports, materials from the equipment used. */
  async calculate(incident: IncidentForCostRecovery, config: CostRecoverySettings): Promise<Position[]> {
    const date = berlinDate(new Date(incident.alarmedAt));
    const departments = new Map((await this.organization.departments()).map((d) => [d.id, d.shortName || d.name]));
    const vehicles = new Map((await this.organization.vehicles({ includeRetired: true })).map((v) => [v.id, v]));
    // Career staff by their employment in the person file (rate of the career group, else the general career rate);
    // at a fire watch everyone counts at the fire watch rate.
    const fireWatch = incident.compensationKind === 'fire-watch';
    const personIds = [...new Set(incident.reports.flatMap((r) => r.personnel.flatMap((p) => (p.personId ? [p.personId] : []))))];
    const employment = new Map((await this.directory.snapshots(personIds, date)).map((s) => [s.id, s.employment]));
    const kindOf = (personId: string): PersonnelKind => {
      if (fireWatch) return 'fire-watch';
      const e = employment.get(personId);
      if (e === 'career-intermediate' || e === 'career-elevated' || e === 'career-higher') return config.personnelRates.some((r) => r.kind === e) ? e : 'career';
      return e === 'fire-service-employee' ? 'career' : 'volunteer';
    };
    const positions: Position[] = [];
    for (const report of incident.reports) {
      const present = report.personnel.filter((p) => p.personId && (config.chargeStandby || !p.standby));
      for (const kind of PersonnelKind.options) {
        const group = present.filter((p) => kindOf(p.personId!) === kind);
        if (!group.length) continue;
        const rate = personnelRateOn(config.personnelRates, kind, date);
        const hours = group.reduce((sum, p) => sum + billableHours(p.from, p.to, config.rounding), 0);
        const amount = round2(hours * (rate ?? 0));
        positions.push({
          kind: 'personnel',
          label: `Personal ${departments.get(report.departmentId) ?? ''}${PERSONNEL_LABELS[kind]} (${group.length} ${group.length === 1 ? 'Person' : 'Personen'})${rate === null ? ' – kein Satz' : ''}`.replace(/\s+/g, ' ').trim(),
          quantity: hours, unit: 'h', rate: rate ?? 0, amount, computedAmount: amount, reason: '', category: kind, vehicleId: null,
        });
      }
      for (const v of report.vehicles) {
        const vehicle = vehicles.get(v.vehicleId);
        const category = vehicle?.costRecoveryCategory ?? vehicle?.vehicleType ?? '';
        const rate = vehicleRateOn(config.vehicleRates, category, date);
        const hours = billableHours(v.departedAt ?? report.alarmedAt, v.returnedAt ?? report.returnedAt, config.vehicleRounding ?? config.rounding);
        const amount = round2(hours * (rate ?? 0));
        positions.push({
          kind: 'vehicle',
          label: `${vehicle ? vehicle.radioCallSign || vehicle.designation : 'Fahrzeug'}${rate === null ? ' – kein Satz' : ''}`,
          quantity: hours, unit: 'h', rate: rate ?? 0, amount, computedAmount: amount, reason: '', category, vehicleId: v.vehicleId,
        });
      }
      for (const used of (await this.equipment?.forReport(report.reportId)) ?? []) {
        if (!used.stock) continue;
        const material = config.materials.find((m) => m.key === used.inventoryNumber || m.name === used.name);
        const amount = round2(used.quantity * (material?.price ?? 0));
        positions.push({ kind: 'material', label: material?.name ?? used.name, quantity: used.quantity, unit: material?.unit ?? 'Stück', rate: material?.price ?? 0, amount, computedAmount: amount, reason: '', category: null, vehicleId: null });
      }
    }
    return positions;
  }

  private fillTemplate(template: string, incident: Pick<IncidentForCostRecovery, 'alarmedAt' | 'location'>, basis: string): string {
    return template
      .replaceAll('{date}', germanDate(berlinDate(new Date(incident.alarmedAt))))
      .replaceAll('{location}', incident.location || '–')
      .replaceAll('{basis}', basis);
  }

  async create(incidentId: string): Promise<Notice> {
    const incident = await this.incidents.forCostRecovery(incidentId);
    if (!incident) throw new NotFoundException({ code: 'cost-recovery.unknownIncident' });
    const em = this.em.fork();
    if (await em.count(NoticeEntity, { incidentId, status: { $ne: 'cancelled' } })) throw new ConflictException({ code: 'cost-recovery.noticeExists' });
    const config = await this.config();
    const offenseKey = (await this.chosenOffenses([incidentId])).get(incidentId) ?? suggestOffense(incident) ?? config.offenses[0]?.key ?? '';
    const offense = config.offenses.find((o) => o.key === offenseKey);
    const book = await em.find(AddressBookEntity, {});
    const debtors: Debtor[] = incident.reports
      .flatMap((r) => r.parties)
      .filter((p) => DEBTOR_ROLES.has(p.role))
      .map((p) => {
        const known = book.find((b) => b.name.toLowerCase() === p.name.toLowerCase());
        return known ? { name: known.name, street: known.street, postalCode: known.postalCode, city: known.city, role: p.role } : { name: p.name, street: p.street, postalCode: p.postalCode, city: p.city, role: p.role };
      });
    const year = berlinDate(new Date(incident.alarmedAt)).slice(0, 4);
    const used = await em.find(NoticeEntity, { number: { $like: `KE-${year}-%` } }, { fields: ['number'] });
    const highest = Math.max(0, ...used.map((n) => Number(n.number.split('-')[2]) || 0));
    const notice = em.create(NoticeEntity, {
      number: `KE-${year}-${String(highest + 1).padStart(3, '0')}`,
      incidentId,
      dispatchNumber: incident.dispatchNumber,
      alarmKeyword: incident.alarmKeyword,
      alarmedAt: new Date(incident.alarmedAt),
      location: incident.location,
      offenseKey,
      debtors,
      positions: await this.calculate(incident, config),
      reasoning: this.fillTemplate(config.reasoning, incident, offense?.legalBasis ?? config.defaultLegalBasis),
      remedy: config.remedy,
      cashReference: '',
      status: 'draft',
    });
    await em.flush();
    return toNoticeDto(notice);
  }

  async update(id: string, input: ParsedNotice): Promise<Notice> {
    const em = this.em.fork();
    const notice = await this.load(em, id);
    assertVersion(notice, input.version);
    if (notice.status !== 'draft' && notice.status !== 'review') throw new ConflictException({ code: 'cost-recovery.notEditable', status: notice.status });
    const config = await this.config();
    if (!config.offenses.some((o) => o.key === input.offenseKey)) throw new BadRequestException({ code: 'cost-recovery.unknownOffense' });
    const missing = missingReasons(input.positions);
    if (missing.length) throw new BadRequestException({ code: 'cost-recovery.reasonMissing', positions: missing.map((p) => p.label) });
    Object.assign(notice, { offenseKey: input.offenseKey, debtors: input.debtors, positions: input.positions, reasoning: input.reasoning, remedy: input.remedy, cashReference: input.cashReference });
    await em.flush();
    return toNoticeDto(notice);
  }

  /** Calculates the positions again from the incident (e.g. after a corrected report); manual positions stay. */
  async recalculate(id: string): Promise<Notice> {
    const em = this.em.fork();
    const notice = await this.load(em, id);
    if (notice.status !== 'draft') throw new ConflictException({ code: 'cost-recovery.notEditable', status: notice.status });
    const incident = await this.incidents.forCostRecovery(notice.incidentId);
    if (!incident) throw new NotFoundException({ code: 'cost-recovery.unknownIncident' });
    const manual = notice.positions.filter((p) => p.computedAmount === null);
    notice.positions = [...(await this.calculate(incident, await this.config())), ...manual];
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

  submit(id: string): Promise<Notice> {
    return this.transition(id, ['draft'], (n) => {
      if (!n.debtors.length) throw new BadRequestException({ code: 'cost-recovery.debtorMissing' });
      n.status = 'review';
    });
  }

  returnToDraft(id: string): Promise<Notice> {
    return this.transition(id, ['review'], (n) => {
      n.status = 'draft';
    });
  }

  /** Issues the notice: due date, PDF stored unchangeably, event `cost-recovery.notice.issued`. */
  async issue(user: AuthenticatedUser, id: string): Promise<Notice> {
    const config = await this.config();
    const result = await this.transition(id, ['review'], async (n) => {
      if (totalOf(n.positions) <= 0) throw new BadRequestException({ code: 'cost-recovery.totalZero' });
      if (n.positions.some((p) => p.rate === 0 && p.amount === 0)) throw new BadRequestException({ code: 'cost-recovery.rateMissing' });
      const issuedAt = new Date();
      const due = new Date(issuedAt.getTime() + config.dueDays * 86_400_000);
      Object.assign(n, { status: 'issued', issuedAt, issuedBy: user.displayName, dueOn: berlinDate(due) });
      n.pdf = await this.renderPdf(n, config);
    });
    if (result.amends) await this.replaceOriginal(result);
    await this.events.publish<NoticeIssuedEvent>(COST_RECOVERY_EVENTS.noticeIssued, { noticeId: result.id, incidentId: result.incidentId, total: result.total });
    return result;
  }

  /** An issued amendment replaces its original, which stays as document but no longer counts. */
  private async replaceOriginal(amendment: Notice): Promise<void> {
    const em = this.em.fork();
    const original = await em.findOne(NoticeEntity, amendment.amends!.id);
    if (!original) return;
    Object.assign(original, { status: 'amended', amendedById: amendment.id, amendedByNumber: amendment.number });
    await em.flush();
  }

  handOver(id: string): Promise<Notice> {
    return this.transition(id, ['issued'], (n) => {
      n.status = 'handed-over';
    });
  }

  markPaid(id: string, paidOn: string): Promise<Notice> {
    return this.transition(id, ['issued', 'handed-over', 'objection'], (n) => {
      n.status = 'paid';
      n.paidOn = paidOn;
    });
  }

  objection(id: string, input: { date: string; result: 'pending' | 'upheld' | 'rejected'; note: string }): Promise<Notice> {
    return this.transition(id, ['issued', 'handed-over', 'objection'], (n) => {
      n.objection = input;
      // Upheld: the notice is lifted; rejected: back to the treasury's collection.
      n.status = input.result === 'upheld' ? 'cancelled' : input.result === 'rejected' ? 'handed-over' : 'objection';
      if (input.result === 'upheld') n.cancellation = { date: input.date, reason: `Widerspruch abgeholfen: ${input.note}` };
    });
  }

  /**
   * Amendment notice (Änderungsbescheid) for an issued notice: a draft copy with the number of the original plus `-Ä1`, `-Ä2` …
   * Issuing it replaces the original (status `amended`). One open amendment per notice.
   */
  async amend(id: string): Promise<Notice> {
    const em = this.em.fork();
    const original = await this.load(em, id);
    if (!['issued', 'handed-over', 'objection'].includes(original.status)) throw new ConflictException({ code: 'cost-recovery.notAmendable', status: original.status });
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
      reasoning: original.reasoning,
      remedy: original.remedy,
      cashReference: original.cashReference,
      status: 'draft',
      amendsId: original.id,
      amendsNumber: original.number,
    });
    await em.flush();
    return toNoticeDto(amendment);
  }

  cancel(id: string, reason: string): Promise<Notice> {
    return this.transition(id, ['draft', 'review', 'issued', 'handed-over', 'objection'], (n) => {
      n.status = 'cancelled';
      n.cancellation = { date: berlinDate(), reason };
    });
  }

  async pdf(id: string): Promise<{ number: string; data: Buffer }> {
    const em = this.em.fork();
    const notice = await em.findOne(NoticeEntity, id, { populate: ['pdf'] });
    if (!notice) throw new NotFoundException();
    // Issued: exactly the stored version. Draft: a preview.
    if (notice.pdf) return { number: notice.number, data: Buffer.from(notice.pdf) };
    return { number: notice.number, data: await this.renderPdf(notice, await this.config()) };
  }

  private async renderPdf(n: NoticeEntity, config: CostRecoverySettings): Promise<Buffer> {
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const offense = config.offenses.find((o) => o.key === n.offenseKey);
    const total = totalOf(n.positions);
    const date = n.issuedAt ? berlinDate(n.issuedAt) : berlinDate();
    const content: unknown[] = [
      { columns: [{ text: [config.authority || brigade?.name || '', '\n', config.authorityAddress].join(''), style: 'small', width: '*' }, { text: `Datum: ${germanDate(date)}\nAktenzeichen: ${n.number}${n.cashReference ? `\nKassenzeichen: ${n.cashReference}` : ''}`, width: 'auto', alignment: 'right' }] },
      { stack: n.debtors.map((d) => ({ text: address(d), margin: [0, 6, 0, 0] })), margin: [0, 24, 0, 0] },
      { text: `${n.amendsId ? 'Änderungsbescheid' : 'Kostenbescheid'}${n.issuedAt ? '' : ' (Entwurf)'}`, style: 'title' },
      ...(n.amendsId ? [{ text: `Der Kostenbescheid ${n.amendsNumber} wird aufgehoben und durch diesen Bescheid ersetzt.`, margin: [0, 0, 0, 6] }] : []),
      { text: `Feuerwehreinsatz am ${germanDate(berlinDate(n.alarmedAt))}${n.location ? ` in ${n.location}` : ''} (${n.alarmKeyword}, Einsatz-Nr. ${n.dispatchNumber})` },
      { text: 'Rechtsgrundlage', style: 'heading' },
      { text: `${[offense ? `${offense.legalBasis} (${offense.name.de})` : config.defaultLegalBasis, config.regulation, config.statute].filter((t) => t.trim()).join('; ')}.` },
      { text: 'Kosten', style: 'heading' },
      {
        table: {
          headerRows: 1,
          widths: ['*', 50, 30, 60, 70],
          body: [
            [pdfHeaderCell('Position'), pdfHeaderCell('Menge', 'right'), pdfHeaderCell(''), pdfHeaderCell('Satz', 'right'), pdfHeaderCell('Betrag', 'right')],
            ...n.positions.map((p) => [p.label, { text: String(p.quantity).replace('.', ','), alignment: 'right' }, p.unit, { text: euro(p.rate), alignment: 'right' }, { text: euro(p.amount), alignment: 'right' }]),
            [{ text: 'Gesamtbetrag', bold: true, colSpan: 4 }, '', '', '', { text: euro(total), bold: true, alignment: 'right' }],
          ],
        },
        layout: PDF_TABLE_LAYOUT,
      },
      { text: `Der Betrag ist bis zum ${n.dueOn ? germanDate(n.dueOn) : '…'} zu zahlen${config.bankAccount ? ` auf das Konto ${config.bankAccount}` : ''}${n.cashReference ? ` unter Angabe des Kassenzeichens ${n.cashReference}` : ''}.`, margin: [0, 10, 0, 0] },
      ...(n.debtors.length > 1 && config.jointLiability.trim() ? [{ text: config.jointLiability, margin: [0, 6, 0, 0] }] : []),
      { text: 'Begründung', style: 'heading' },
      { text: n.reasoning },
      { text: 'Rechtsbehelfsbelehrung', style: 'heading' },
      { text: n.remedy },
      { text: `\n\n${config.signer || n.issuedBy || ''}`, margin: [0, 20, 0, 0] },
    ];
    const em = this.em.fork();
    return renderLetterPdf({
      brigade,
      letterhead: await brigadeLogoDataUrl(em, 'letterhead'),
      logo: await brigadeLogoDataUrl(em),
      title: `Kostenbescheid ${n.number}`,
      content,
      language: 'de',
      now: new Date(),
    });
  }
}
