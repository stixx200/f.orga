import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, type OnModuleInit, Optional } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { assertVersion, type AuthenticatedUser, berlinDate, DomainEvents, Notifications, wordsWhere } from '@forga/core-api';
import { type LocalizedText, normalizeRfid } from '@forga/core-contracts';
import {
  addMonths,
  BulkInspectionInput,
  computeDues,
  type Defect,
  DefectInput,
  type DefectReportedEvent,
  DefectUpdate,
  EQUIPMENT_EVENTS,
  type EquipmentUsageLookup,
  type Inspection,
  InspectionCancellation,
  type InspectionResult,
  InspectionCorrection,
  InspectionInput,
  type InspectionType,
  isBlocked,
  type Item,
  ItemInput,
  type ItemStatus,
  type ItemIncident,
  type ItemStatusChangedEvent,
  type ItemSummary,
  type LastInspection,
  OPEN_DEFECT,
  type ReportableItem,
  type ReportUsage,
  ReportUsageInput,
  RetireInput,
  withIntervals,
} from '@forga/equipment-contracts';
import { INCIDENTS_EVENTS, INCIDENTS_LOOKUP, type IncidentsLookup, type ReportReleasedEvent } from '@forga/incidents-contracts';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { type SessionClosedEvent, TRAINING_EVENTS, TRAINING_SESSIONS, type TrainingSessions } from '@forga/training-contracts';
import { CategoryEntity, DefectEntity, EquipmentItemEntity, EquipmentTypeEntity, InspectionEntity, UsageEntity } from '../equipment.entities.js';

export const READ = 'equipment.read';
export const WRITE = 'equipment.write';
export const INSPECT = 'equipment.inspect';
export const REPORT_DEFECTS = 'equipment.defects.report';
export const NOTIFY_DEFECTS = 'equipment.defects.notify';
/** The same for items of breathing apparatus categories only (breathing apparatus officer). */
export const BREATHING_WRITE = 'equipment.breathing.write';
export const BREATHING_INSPECT = 'equipment.breathing.inspect';
export const BREATHING_NOTIFY = 'equipment.breathing.notify';

/** Permissions of the incidents and training modules for the equipment used in a report or session. */
const REPORTS_READ = 'incidents.reports.read';
const REPORTS_WRITE = 'incidents.reports.write';
const REPORTS_RELEASE = 'incidents.reports.release';
const SESSIONS_READ = 'training.read';
const SESSIONS_WRITE = ['training.attendance', 'training.plan'];

type ParsedItem = ReturnType<typeof ItemInput.parse>;
type ParsedInspection = ReturnType<typeof InspectionInput.parse>;
type Action = 'write' | 'inspect';
type UsageSource = 'incidents' | 'training';
/** Events and e-mails that go out only after the transaction has been committed. */
type AfterCommit = (() => Promise<void>)[];

/** Earliest date of an inspection or purchase. */
const EARLIEST = '1900-01-01';

/** Results of inspections in both languages (defect texts in e-mails and lists). */
export const RESULT_NAMES: Record<InspectionResult, LocalizedText> = {
  passed: { de: 'bestanden', en: 'passed' },
  'passed-with-defects': { de: 'mit Mängeln', en: 'with defects' },
  failed: { de: 'nicht bestanden', en: 'failed' },
};

/** Text of a defect: as reported, or for a finding of an inspection "<inspection type>: <notes or result>". */
export function defectText(defect: Pick<Defect, 'description' | 'finding'>, language: 'de' | 'en'): string {
  if (!defect.finding) return defect.description;
  return `${defect.finding.name[language] || defect.finding.name.de}: ${defect.description || RESULT_NAMES[defect.finding.result][language]}`;
}

/** Qualification an inspector person should have; other inspectors are external. */
/** Qualifications (catalog keys) a competent person needs for inspections of breathing apparatus or other equipment. */
export const INSPECTOR_QUALIFICATIONS = { breathing: 'breathing-apparatus-officer', other: 'equipment-officer' } as const;

const INSPECTOR_QUALIFICATION: Partial<Record<InspectionType['inspector'], (breathing: boolean) => string>> = {
  'competent-person': (breathing) => (breathing ? INSPECTOR_QUALIFICATIONS.breathing : INSPECTOR_QUALIFICATIONS.other),
};

const toInspectionDto = (i: InspectionEntity): Inspection => ({
  id: i.id, itemId: i.item.id, inspectionKey: i.inspectionKey, date: i.date, inspectorPersonId: i.inspectorPersonId ?? null, inspectorCompany: i.inspectorCompany, result: i.result,
  checklist: i.checklist, measurements: i.measurements, nextDueOn: i.nextDueOn ?? null, notes: i.notes, recordedBy: i.recordedBy, qualificationWarning: i.qualificationWarning,
  cancelled: i.cancelled, changeReason: i.changeReason,
});

export const toDefectDto = (d: DefectEntity): Defect => ({
  id: d.id, itemId: d.item.id, itemName: d.item.name, inventoryNumber: d.item.inventoryNumber, categoryKey: d.item.categoryKey, departmentId: d.item.departmentId, description: d.description,
  finding: d.inspectionId && d.findingName && d.findingResult ? { inspectionId: d.inspectionId, name: d.findingName, result: d.findingResult } : null, status: d.status,
  resolution: d.resolution, reportedBy: d.reportedBy, reportedAt: d.reportedAt.toISOString(), resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
});

const toSummary = (i: Item): ItemSummary => ({ id: i.id, inventoryNumber: i.inventoryNumber, name: i.name, departmentId: i.departmentId, status: i.status, blocked: i.blocked, reportOnly: true });

@Injectable()
export class ItemsService implements OnModuleInit, EquipmentUsageLookup {
  constructor(
    private readonly em: EntityManager,
    private readonly events: DomainEvents,
    private readonly notifications: Notifications,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Optional() @Inject(INCIDENTS_LOOKUP) private readonly incidents?: IncidentsLookup,
    @Optional() @Inject(TRAINING_SESSIONS) private readonly sessions?: TrainingSessions,
  ) {}

  onModuleInit(): void {
    this.events.subscribe<ReportReleasedEvent>(INCIDENTS_EVENTS.reportReleased, (e) => this.afterIncident(e));
    this.events.subscribe<DefectReportedEvent>(EQUIPMENT_EVENTS.defectReported, (e) => this.notifyDefect(e));
    this.events.subscribe<SessionClosedEvent>(TRAINING_EVENTS.sessionClosed, (e) => this.afterSession(e));
  }

  // ----- Access -----

  /** Keys of the breathing apparatus categories. */
  async breathingCategories(em: EntityManager = this.em.fork()): Promise<Set<string>> {
    return new Set((await em.find(CategoryEntity, { breathingApparatus: true })).map((c) => c.key));
  }

  /** Writing (status, defects) or inspecting: the general permission, or the breathing apparatus one for breathing apparatus. */
  may(user: AuthenticatedUser, action: Action, item: Pick<EquipmentItemEntity, 'departmentId'>, breathing: boolean): boolean {
    const [general, special] = action === 'write' ? [WRITE, BREATHING_WRITE] : [INSPECT, BREATHING_INSPECT];
    return user.can(general, item.departmentId) || (breathing && user.can(special, item.departmentId));
  }

  private requireMay(user: AuthenticatedUser, action: Action, item: Pick<EquipmentItemEntity, 'departmentId'>, breathing: boolean): void {
    if (this.may(user, action, item, breathing)) return;
    throw new ForbiddenException({ code: 'auth.forbidden', permissions: action === 'write' ? [WRITE, BREATHING_WRITE] : [INSPECT, BREATHING_INSPECT] });
  }

  private async isBreathing(em: EntityManager, item: EquipmentItemEntity): Promise<boolean> {
    return (await em.count(CategoryEntity, { key: item.categoryKey, breathingApparatus: true })) > 0;
  }

  visible(user: AuthenticatedUser, permission = READ): FilterQuery<EquipmentItemEntity> | null {
    const grant = user.grant(permission);
    if (!grant) return null;
    return grant === 'brigade' ? {} : { departmentId: { $in: grant } };
  }

  require(user: AuthenticatedUser, permission: string, item: Pick<EquipmentItemEntity, 'departmentId'>): void {
    if (!user.can(permission, item.departmentId)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [permission] });
  }

  async load(em: EntityManager, id: string, user: AuthenticatedUser): Promise<EquipmentItemEntity> {
    const item = await em.findOne(EquipmentItemEntity, id);
    if (!item || !(user.can(READ, item.departmentId) || user.can(REPORT_DEFECTS, item.departmentId))) throw new NotFoundException();
    return item;
  }

  /** The item for readers; members who may only report defects get the summary (status and "blocked", no price, serial number, inspections). */
  async view(user: AuthenticatedUser, id: string): Promise<Item | ItemSummary> {
    const item = await this.load(this.em.fork(), id, user);
    const [dto] = await this.toDtos([item]);
    return user.can(READ, item.departmentId) ? dto : toSummary(dto);
  }

  /** E-mail to those who are to be told about new defects in the department of the item (breathing apparatus: their own permission). */
  private async notifyDefect(event: DefectReportedEvent): Promise<void> {
    const em = this.em.fork();
    const defect = await em.findOne(DefectEntity, event.defectId, { populate: ['item'] });
    if (!defect) return;
    const { item } = defect;
    const dto = toDefectDto(defect);
    await this.notifications.notify({
      permission: (await this.isBreathing(em, item)) ? BREATHING_NOTIFY : NOTIFY_DEFECTS,
      departmentId: item.departmentId,
      action: 'equipment.defect-notified',
      details: { defectId: defect.id, itemId: item.id },
      path: `/equipment/items/${item.id}?tab=defects`,
      compose: (language, name) =>
        language === 'de'
          ? { subject: `Neuer Mangel: ${item.name} (${item.inventoryNumber})`, text: `Hallo ${name},\n\n${defect.reportedBy} hat einen Mangel gemeldet:\n\n${item.name} (${item.inventoryNumber})\n${defectText(dto, 'de')}` }
          : { subject: `New defect: ${item.name} (${item.inventoryNumber})`, text: `Hello ${name},\n\n${defect.reportedBy} reported a defect:\n\n${item.name} (${item.inventoryNumber})\n${defectText(dto, 'en')}` },
    });
  }

  // ----- Items -----

  /** Incident reports the item was used in, newest first; empty without the incidents module. */
  async incidentsOf(user: AuthenticatedUser, id: string): Promise<ItemIncident[]> {
    const em = this.em.fork();
    const item = await this.load(em, id, user);
    this.require(user, READ, item);
    if (!this.incidents) return [];
    const usages = new Map((await em.find(UsageEntity, { item, source: 'incidents' })).map((u) => [u.reportId, u]));
    return (await this.incidents.reports([...usages.keys()])).map((r) => ({
      reportId: r.reportId,
      reportNumber: r.reportNumber,
      incidentId: r.incidentId,
      dispatchNumber: r.dispatchNumber,
      alarmKeyword: r.alarmKeyword,
      alarmedAt: r.alarmedAt,
      location: r.location,
      quantity: usages.get(r.reportId)!.quantity,
      inspectAfter: usages.get(r.reportId)!.inspectAfter,
    }));
  }

  /** Effective inspection types: own ones, otherwise those of the equipment type; with the interval overrides of the item. */
  private async inspectionsOf(em: EntityManager, items: EquipmentItemEntity[]): Promise<Map<string, InspectionType[]>> {
    const types = new Map((await em.find(EquipmentTypeEntity, { key: { $in: [...new Set(items.flatMap((i) => (i.typeKey ? [i.typeKey] : [])))] } })).map((t) => [t.key, t.inspections]));
    return new Map(items.map((i) => [i.id, withIntervals(i.inspections ?? (i.typeKey ? (types.get(i.typeKey) ?? []) : []), i.intervalOverrides ?? {})]));
  }

  async toDtos(items: EquipmentItemEntity[], today = berlinDate()): Promise<Item[]> {
    if (!items.length) return [];
    const em = this.em.fork();
    const inspections = await this.inspectionsOf(em, items);
    const locking = new Set((await em.find(CategoryEntity, { lockWhenOverdue: true })).map((c) => c.key));
    const ids = items.map((i) => i.id);
    const done = await em.find(InspectionEntity, { item: { $in: ids }, cancelled: false }, { orderBy: { date: 'desc', id: 'desc' } });
    const last = new Map<string, Map<string, LastInspection>>();
    for (const i of done) {
      const perItem = last.get(i.item.id) ?? new Map<string, LastInspection>();
      if (!perItem.has(i.inspectionKey)) perItem.set(i.inspectionKey, { date: i.date, nextDueOn: i.nextDueOn ?? null, result: i.result });
      last.set(i.item.id, perItem);
    }
    const defects = await em.find(DefectEntity, { item: { $in: ids }, status: { $in: [...OPEN_DEFECT] } });
    return items.map((item) => {
      const dues =
        item.status === 'retired'
          ? []
          : computeDues(inspections.get(item.id) ?? [], last.get(item.id) ?? new Map(), item.triggered, today, { purchasedOn: item.purchasedOn ?? null, createdOn: item.createdOn, dueFromRecording: !item.forVehicleId });
      const due = dues.map((d) => d.dueOn).filter((d): d is string => d !== null).toSorted();
      return {
        id: item.id, inventoryNumber: item.inventoryNumber, name: item.name, typeKey: item.typeKey ?? null, categoryKey: item.categoryKey, serialNumber: item.serialNumber, barcode: item.barcode ?? null, rfid: item.rfid ?? null, manufacturer: item.manufacturer,
        yearBuilt: item.yearBuilt ?? null, purchasedOn: item.purchasedOn ?? null, price: item.price === null || item.price === undefined ? null : Number(item.price), properties: item.properties, departmentId: item.departmentId, vehicleId: item.vehicleId ?? null,
        stationId: item.stationId ?? null, loadingPlace: item.loadingPlace, location: item.location, quantity: item.quantity, expiresOn: item.expiresOn ?? null, inspections: inspections.get(item.id) ?? [], ownInspections: item.inspections !== null && item.inspections !== undefined,
        intervalOverrides: item.intervalOverrides ?? {}, status: item.status, blocked: isBlocked(dues, locking.has(item.categoryKey), today), labelPrintedAt: item.labelPrintedAt ? item.labelPrintedAt.toISOString() : null,
        retirement: item.retirement ?? null, forVehicleId: item.forVehicleId ?? null, dues, nextDue: due[0] ?? null,
        openDefects: defects.filter((d) => d.item.id === item.id).length, notes: item.notes, version: item.version,
      };
    });
  }

  async list(user: AuthenticatedUser, filter: { categoryKey?: string; departmentId?: string; vehicleId?: string; status?: string; q?: string; includeRetired?: boolean; dueBefore?: string; withoutLabel?: boolean }): Promise<Item[]> {
    const visible = this.visible(user);
    if (!visible) return [];
    const where: FilterQuery<EquipmentItemEntity>[] = [visible];
    if (filter.categoryKey) where.push({ categoryKey: filter.categoryKey });
    if (filter.departmentId) where.push({ departmentId: filter.departmentId });
    if (filter.vehicleId) where.push({ vehicleId: filter.vehicleId });
    if (filter.withoutLabel) where.push({ labelPrintedAt: null });
    if (filter.status) where.push({ status: filter.status as ItemStatus });
    else if (!filter.includeRetired) where.push({ status: { $ne: 'retired' } });
    const words = filter.q ? wordsWhere(filter.q, ['name', 'inventoryNumber', 'serialNumber', 'barcode', 'location']) : null;
    if (filter.q) where.push({ $or: [...(words ? [words] : []), { rfid: { $ilike: `%${normalizeRfid(filter.q) || filter.q}%` } }] } as FilterQuery<EquipmentItemEntity>);
    const items = await this.em.fork().find(EquipmentItemEntity, { $and: where }, { orderBy: { inventoryNumber: 'asc' }, limit: 5000 });
    const dtos = await this.toDtos(items);
    return filter.dueBefore ? dtos.filter((i) => i.nextDue !== null && i.nextDue <= filter.dueBefore!) : dtos;
  }

  private async validate(em: EntityManager, input: ParsedItem, id?: string): Promise<void> {
    if (await em.count(EquipmentItemEntity, { inventoryNumber: input.inventoryNumber, ...(id ? { id: { $ne: id } } : {}) })) {
      throw new BadRequestException({ code: 'equipment.inventoryNumberTaken', value: input.inventoryNumber });
    }
    for (const field of ['barcode', 'rfid'] as const) {
      const value = input[field];
      if (value && (await em.count(EquipmentItemEntity, { [field]: value, ...(id ? { id: { $ne: id } } : {}) }))) {
        throw new BadRequestException({ code: 'codes.taken', field, value });
      }
    }
    if (!(await em.count(CategoryEntity, { key: input.categoryKey }))) throw new BadRequestException({ code: 'equipment.unknownCategory', key: input.categoryKey });
    const type = input.typeKey ? await em.findOne(EquipmentTypeEntity, { key: input.typeKey }) : null;
    if (input.typeKey && !type) throw new BadRequestException({ code: 'equipment.unknownType', key: input.typeKey });
    if (input.purchasedOn && input.purchasedOn > berlinDate()) throw new BadRequestException({ code: 'equipment.purchaseInFuture', date: input.purchasedOn });
    if (input.purchasedOn && input.purchasedOn < EARLIEST) throw new BadRequestException({ code: 'equipment.dateTooEarly', date: input.purchasedOn });
    // Overrides and initial inspections only for inspection types of the item.
    const keys = new Set((input.inspections ?? type?.inspections ?? []).map((t) => t.key));
    for (const key of [...Object.keys(input.intervalOverrides), ...input.initialInspections.map((i) => i.inspectionKey)]) {
      if (!keys.has(key)) throw new BadRequestException({ code: 'equipment.unknownInspection', key });
    }
    for (const initial of input.initialInspections) this.checkDates(initial.date, initial.nextDueOn, input.purchasedOn);
  }

  /** An inspection lies in the past (or today), not before 1900 or the purchase; its next due date after it. */
  private checkDates(date: string, nextDueOn: string | null, purchasedOn: string | null | undefined): void {
    if (date > berlinDate()) throw new BadRequestException({ code: 'equipment.inspectionInFuture', date });
    if (date < EARLIEST) throw new BadRequestException({ code: 'equipment.dateTooEarly', date });
    if (purchasedOn && date < purchasedOn) throw new BadRequestException({ code: 'equipment.inspectionBeforePurchase', date, purchasedOn });
    if (nextDueOn && nextDueOn <= date) throw new BadRequestException({ code: 'equipment.nextDueNotAfterDate', date, nextDueOn });
  }

  /** Whether items of the category are breathing apparatus. */
  private async breathingCategory(em: EntityManager, categoryKey: string): Promise<boolean> {
    return (await em.count(CategoryEntity, { key: categoryKey, breathingApparatus: true })) > 0;
  }

  /** Creating: `equipment.write` in the department, for breathing apparatus categories also `equipment.breathing.write`. */
  async create(user: AuthenticatedUser, input: ParsedItem): Promise<Item> {
    const em = this.em.fork();
    this.requireMay(user, 'write', input, await this.breathingCategory(em, input.categoryKey));
    await this.validate(em, input);
    const { version: _version, initialInspections, ...fields } = input;
    const item = em.create(EquipmentItemEntity, { ...fields, status: 'ready', triggered: {}, forVehicleId: null });
    // Inspections done before the item was recorded, so its due dates start from them.
    for (const initial of initialInspections) {
      em.create(InspectionEntity, {
        item, inspectionKey: initial.inspectionKey, date: initial.date, nextDueOn: initial.nextDueOn, result: 'passed', recordedBy: user.displayName,
        inspectorCompany: '', checklist: [], measurements: '', notes: '', qualificationWarning: false,
      });
    }
    await em.flush();
    return (await this.toDtos([item]))[0];
  }

  /** Editing: write permission for the item as it is and as it will be (department and category, breathing apparatus included). */
  async update(user: AuthenticatedUser, id: string, input: ParsedItem): Promise<Item> {
    const em = this.em.fork();
    const item = await this.load(em, id, user);
    this.requireMay(user, 'write', item, await this.isBreathing(em, item));
    assertVersion(item, input.version);
    this.requireMay(user, 'write', input, await this.breathingCategory(em, input.categoryKey));
    await this.validate(em, { ...input, initialInspections: [] }, id);
    const { version: _version, initialInspections: _initial, ...fields } = input;
    Object.assign(item, fields);
    await em.flush();
    return (await this.toDtos([item]))[0];
  }

  /** Sets the status; the event goes out after the commit (`after`). */
  private setStatus(item: EquipmentItemEntity, status: ItemStatus, after: AfterCommit): void {
    if (item.status === status) return;
    const previous = item.status;
    item.status = status;
    after.push(() => this.events.publish<ItemStatusChangedEvent>(EQUIPMENT_EVENTS.statusChanged, { itemId: item.id, previous, status }));
  }

  async changeStatus(user: AuthenticatedUser, id: string, status: Exclude<ItemStatus, 'retired'>): Promise<Item> {
    const em = this.em.fork();
    const item = await this.load(em, id, user);
    this.requireMay(user, 'write', item, await this.isBreathing(em, item));
    if (item.status === 'retired') throw new ConflictException({ code: 'equipment.retired' });
    const previous = item.status;
    item.status = status;
    await em.flush();
    await this.events.publish<ItemStatusChangedEvent>(EQUIPMENT_EVENTS.statusChanged, { itemId: item.id, previous, status });
    return (await this.toDtos([item]))[0];
  }

  async retire(user: AuthenticatedUser, id: string, input: ReturnType<typeof RetireInput.parse>): Promise<Item> {
    const em = this.em.fork();
    const item = await this.load(em, id, user);
    this.requireMay(user, 'write', item, await this.isBreathing(em, item));
    const after: AfterCommit = [];
    item.retirement = input;
    this.setStatus(item, 'retired', after);
    for (const defect of await em.find(DefectEntity, { item, status: { $in: [...OPEN_DEFECT] } })) {
      defect.status = 'retired';
      defect.resolvedAt = new Date();
    }
    await em.flush();
    for (const publish of after) await publish();
    return (await this.toDtos([item]))[0];
  }

  /** Labels of these items have been printed (filter "without label" on the label page). */
  async labelsPrinted(user: AuthenticatedUser, itemIds: string[]): Promise<{ marked: number }> {
    const em = this.em.fork();
    const items = await em.find(EquipmentItemEntity, { id: { $in: itemIds } });
    if (items.length !== new Set(itemIds).size) throw new NotFoundException();
    const breathing = await this.breathingCategories(em);
    for (const item of items) this.requireMay(user, 'write', item, breathing.has(item.categoryKey));
    const now = new Date();
    for (const item of items) item.labelPrintedAt = now;
    await em.flush();
    return { marked: items.length };
  }

  // ----- Inspections -----

  async inspections(user: AuthenticatedUser, id: string): Promise<Inspection[]> {
    const em = this.em.fork();
    const item = await this.load(em, id, user);
    this.require(user, READ, item);
    return (await em.find(InspectionEntity, { item }, { orderBy: { date: 'desc', id: 'desc' } })).map(toInspectionDto);
  }

  private async qualificationWarning(type: InspectionType, inspectorPersonId: string | null, date: string, breathing: boolean): Promise<boolean> {
    const expected = INSPECTOR_QUALIFICATION[type.inspector]?.(breathing);
    if (!inspectorPersonId || !expected) return false;
    const [person] = await this.directory.snapshots([inspectorPersonId], date);
    return !person?.qualifications.includes(expected);
  }

  private nextDue(type: InspectionType, input: Pick<ParsedInspection, 'date' | 'result' | 'nextDueOn'>): string | null {
    // A failed inspection stays due: it does not advance the due date.
    if (input.result === 'failed') return null;
    return input.nextDueOn ?? (type.intervalMonths ? addMonths(input.date, type.intervalMonths) : null);
  }

  /** Checks an inspection before anything is written: permission, item not retired, inspection type of the item, dates. */
  private inspectable(user: AuthenticatedUser, item: EquipmentItemEntity, input: ParsedInspection, types: InspectionType[], breathing: boolean): InspectionType {
    this.requireMay(user, 'inspect', item, breathing);
    if (item.status === 'retired') throw new ConflictException({ code: 'equipment.retired' });
    const type = types.find((t) => t.key === input.inspectionKey);
    if (!type) throw new BadRequestException({ code: 'equipment.unknownInspection', key: input.inspectionKey });
    this.checkDates(input.date, input.result === 'failed' ? null : input.nextDueOn, item.purchasedOn);
    return type;
  }

  /**
   * Records a checked inspection (`inspectable`): a passed one settles a trigger ("after use" …) up to its date; a failed
   * one makes the item defective, a failed one or one with defects records a defect; then the status follows.
   */
  private async record(em: EntityManager, user: AuthenticatedUser, item: EquipmentItemEntity, input: ParsedInspection, type: InspectionType, types: InspectionType[], breathing: boolean, after: AfterCommit): Promise<InspectionEntity> {
    const trigger = item.triggered[input.inspectionKey];
    const settles = input.result !== 'failed' && Boolean(trigger) && trigger <= input.date;
    if (settles) {
      const { [input.inspectionKey]: _done, ...rest } = item.triggered;
      item.triggered = rest;
    }
    const inspection = em.create(InspectionEntity, {
      ...input,
      id: uuidv7(),
      item,
      nextDueOn: this.nextDue(type, input),
      recordedBy: user.displayName,
      qualificationWarning: await this.qualificationWarning(type, input.inspectorPersonId, input.date, breathing),
      clearedTrigger: settles ? trigger : null,
    });
    if (input.result !== 'passed') this.reportFinding(em, user, item, inspection, type, after);
    if (input.result === 'failed') this.setStatus(item, 'defective', after);
    else await this.settle(em, item, types, after, input.result === 'passed');
    return inspection;
  }

  /** Defect for a failed inspection or one with defects; the e-mail goes out after the commit. */
  private reportFinding(em: EntityManager, user: AuthenticatedUser, item: EquipmentItemEntity, inspection: InspectionEntity, type: InspectionType, after: AfterCommit): void {
    const defect = em.create(DefectEntity, {
      id: uuidv7(), item, description: inspection.notes, inspectionId: inspection.id, findingName: type.name, findingResult: inspection.result, status: 'reported', reportedBy: user.displayName,
    });
    after.push(() => this.events.publish<DefectReportedEvent>(EQUIPMENT_EVENTS.defectReported, { defectId: defect.id, itemId: item.id, departmentId: item.departmentId, description: defect.description }));
  }

  /**
   * Status after inspections changed: the latest valid inspection of a type failed → defective (unless in repair);
   * otherwise, without open defects, a defective item becomes ready, one "in inspection" only with a passed inspection
   * (`released`).
   */
  private async settle(em: EntityManager, item: EquipmentItemEntity, types: InspectionType[], after: AfterCommit, released: boolean): Promise<void> {
    if (item.status === 'retired') return;
    await em.flush();
    const keys = new Set(types.map((t) => t.key));
    const latest = new Map<string, InspectionResult>();
    for (const i of await em.find(InspectionEntity, { item, cancelled: false }, { orderBy: { date: 'desc', id: 'desc' } })) {
      if (keys.has(i.inspectionKey) && !latest.has(i.inspectionKey)) latest.set(i.inspectionKey, i.result);
    }
    if ([...latest.values()].includes('failed')) {
      if (item.status === 'ready' || item.status === 'in-inspection') this.setStatus(item, 'defective', after);
      return;
    }
    if (await em.count(DefectEntity, { item, status: { $in: [...OPEN_DEFECT] } })) return;
    if (item.status === 'defective' || (item.status === 'in-inspection' && released)) this.setStatus(item, 'ready', after);
  }

  /** Runs `work` in a transaction and publishes its events and e-mails after the commit. */
  private async inTransaction<T>(work: (em: EntityManager, after: AfterCommit) => Promise<T>): Promise<T> {
    const after: AfterCommit = [];
    const result = await this.em.fork().transactional((em) => work(em, after));
    for (const publish of after) await publish();
    return result;
  }

  async inspect(user: AuthenticatedUser, id: string, input: ParsedInspection): Promise<Inspection> {
    const inspection = await this.inTransaction(async (em, after) => {
      const item = await this.load(em, id, user);
      const types = (await this.inspectionsOf(em, [item])).get(item.id) ?? [];
      const breathing = await this.isBreathing(em, item);
      const type = this.inspectable(user, item, input, types, breathing);
      return this.record(em, user, item, input, type, types, breathing, after);
    });
    return toInspectionDto(inspection);
  }

  /** All or nothing: every item is checked (permission, inspection type, dates) before the first inspection is written. */
  async bulkInspect(user: AuthenticatedUser, input: ReturnType<typeof BulkInspectionInput.parse>): Promise<{ recorded: number; ids: string[] }> {
    const { itemIds, ...single } = input;
    const parsed: ParsedInspection = { ...single, checklist: [], nextDueOn: null };
    return this.inTransaction(async (em, after) => {
      const items = await em.find(EquipmentItemEntity, { id: { $in: itemIds } });
      if (items.length !== new Set(itemIds).size) throw new NotFoundException();
      const types = await this.inspectionsOf(em, items);
      const breathing = await this.breathingCategories(em);
      const checked = items.map((item) => ({ item, type: this.inspectable(user, item, parsed, types.get(item.id) ?? [], breathing.has(item.categoryKey)) }));
      const ids: string[] = [];
      for (const { item, type } of checked) ids.push((await this.record(em, user, item, parsed, type, types.get(item.id) ?? [], breathing.has(item.categoryKey), after)).id);
      await em.flush();
      return { recorded: items.length, ids };
    });
  }

  private async loadInspection(em: EntityManager, user: AuthenticatedUser, id: string): Promise<{ inspection: InspectionEntity; type: InspectionType; types: InspectionType[]; breathing: boolean }> {
    const inspection = await em.findOne(InspectionEntity, id, { populate: ['item'] });
    if (!inspection || !user.can(READ, inspection.item.departmentId)) throw new NotFoundException();
    const breathing = await this.isBreathing(em, inspection.item);
    this.requireMay(user, 'inspect', inspection.item, breathing);
    if (inspection.cancelled) throw new ConflictException({ code: 'equipment.inspectionCancelled' });
    const types = (await this.inspectionsOf(em, [inspection.item])).get(inspection.item.id) ?? [];
    const type = types.find((t) => t.key === inspection.inspectionKey) ?? { key: inspection.inspectionKey, name: { de: inspection.inspectionKey, en: inspection.inspectionKey }, intervalMonths: null, trigger: 'periodic', inspector: 'user', checklist: [] };
    return { inspection, type, types, breathing };
  }

  /** Withdraws the open defects an inspection recorded (it was cancelled or corrected to "passed"). */
  private async withdrawFindings(em: EntityManager, inspection: InspectionEntity, reason: string): Promise<void> {
    for (const defect of await em.find(DefectEntity, { inspectionId: inspection.id, status: { $in: [...OPEN_DEFECT] } })) {
      defect.status = 'withdrawn';
      defect.resolution = reason;
      defect.resolvedAt = new Date();
    }
  }

  /** Puts back the trigger an inspection settled, unless a later one is set. */
  private restoreTrigger(inspection: InspectionEntity): void {
    const { item, clearedTrigger } = inspection;
    if (!clearedTrigger) return;
    const current = item.triggered[inspection.inspectionKey];
    if (!current || current < clearedTrigger) item.triggered = { ...item.triggered, [inspection.inspectionKey]: clearedTrigger };
    inspection.clearedTrigger = null;
  }

  /**
   * Corrects a recorded inspection (typing error, wrong date or result); the reason stays with it and in the history.
   * The consequences follow the new result as for a new inspection: corrected to "failed" the item becomes defective
   * with a defect, to "passed" the defects of the inspection are withdrawn; then the status is settled again.
   */
  async correctInspection(user: AuthenticatedUser, id: string, input: ReturnType<typeof InspectionCorrection.parse>): Promise<Inspection> {
    const corrected = await this.inTransaction(async (em, after) => {
      const { inspection, type, types, breathing } = await this.loadInspection(em, user, id);
      const { item } = inspection;
      this.checkDates(input.date, input.result === 'failed' ? null : input.nextDueOn, item.purchasedOn);
      const previous = inspection.result;
      const { reason, ...fields } = input;
      Object.assign(inspection, {
        ...fields,
        nextDueOn: this.nextDue(type, input),
        qualificationWarning: await this.qualificationWarning(type, input.inspectorPersonId, input.date, breathing),
        changeReason: reason,
      });
      if (input.result === 'passed') await this.withdrawFindings(em, inspection, reason);
      else if (previous === 'passed') this.reportFinding(em, user, item, inspection, type, after);
      else {
        for (const defect of await em.find(DefectEntity, { inspectionId: inspection.id, status: { $in: [...OPEN_DEFECT] } })) {
          defect.findingResult = input.result;
          defect.description = input.notes;
        }
      }
      // A failed inspection does not settle a trigger; a passed one settles it up to its date.
      const trigger = item.triggered[inspection.inspectionKey];
      if (input.result === 'failed') this.restoreTrigger(inspection);
      else if (trigger && trigger <= input.date) {
        const { [inspection.inspectionKey]: _done, ...rest } = item.triggered;
        item.triggered = rest;
        inspection.clearedTrigger = trigger;
      }
      if (input.result === 'failed' && previous !== 'failed' && item.status !== 'retired') this.setStatus(item, 'defective', after);
      else await this.settle(em, item, types, after, input.result === 'passed');
      return inspection;
    });
    return toInspectionDto(corrected);
  }

  /**
   * Cancels an inspection recorded by mistake: it stays in the history, but no longer counts for the due dates. Its open
   * defects are withdrawn, a trigger it settled is due again, and the status follows the remaining inspections.
   */
  async cancelInspection(user: AuthenticatedUser, id: string, input: ReturnType<typeof InspectionCancellation.parse>): Promise<Inspection> {
    const cancelled = await this.inTransaction(async (em, after) => {
      const { inspection, types } = await this.loadInspection(em, user, id);
      inspection.cancelled = true;
      inspection.changeReason = input.reason;
      await this.withdrawFindings(em, inspection, input.reason);
      this.restoreTrigger(inspection);
      await this.settle(em, inspection.item, types, after, inspection.result !== 'passed');
      return inspection;
    });
    return toInspectionDto(cancelled);
  }

  /** Makes an inspection of the item due now, e.g. after washing a hose. */
  async trigger(user: AuthenticatedUser, id: string, inspectionKey: string): Promise<Item> {
    const em = this.em.fork();
    const item = await this.load(em, id, user);
    this.requireMay(user, 'inspect', item, await this.isBreathing(em, item));
    if (item.status === 'retired') throw new ConflictException({ code: 'equipment.retired' });
    const types = (await this.inspectionsOf(em, [item])).get(item.id) ?? [];
    if (!types.some((t) => t.key === inspectionKey)) throw new BadRequestException({ code: 'equipment.unknownInspection', key: inspectionKey });
    item.triggered = { ...item.triggered, [inspectionKey]: berlinDate() };
    await em.flush();
    return (await this.toDtos([item]))[0];
  }

  // ----- Defects -----

  async defects(user: AuthenticatedUser, filter: { open?: boolean; itemId?: string }): Promise<Defect[]> {
    const visible = this.visible(user);
    if (!visible) return [];
    const where: FilterQuery<DefectEntity> = { item: visible as FilterQuery<EquipmentItemEntity> };
    if (filter.open) Object.assign(where, { status: { $in: [...OPEN_DEFECT] } });
    if (filter.itemId) Object.assign(where, { item: { ...(visible as object), id: filter.itemId } });
    return (await this.em.fork().find(DefectEntity, where, { populate: ['item'], orderBy: { reportedAt: 'desc' } })).map(toDefectDto);
  }

  /**
   * "My area": items the user may report defects for, by inventory number, name, barcode or RFID chip, or by a scanned
   * `code` (label URL, barcode, RFID chip or inventory number, exact); with the current place, vehicle or station and loading place.
   */
  async reportable(user: AuthenticatedUser, query: string, code = ''): Promise<ReportableItem[]> {
    const visible = this.visible(user, REPORT_DEFECTS);
    const q = query.trim();
    const scanned = code.trim();
    if (!visible || (q.length < 2 && !scanned)) return [];
    let match: FilterQuery<EquipmentItemEntity>;
    if (scanned) {
      const label = /\/equipment\/items\/([0-9a-f-]{36})/i.exec(scanned);
      const exact = scanned.replace(/[\\%_]/g, '\\$&');
      match = label ? { id: label[1].toLowerCase() } : { $or: [{ barcode: { $ilike: exact } }, { rfid: normalizeRfid(scanned) }, { inventoryNumber: { $ilike: exact } }] };
    } else {
      const words = wordsWhere(q, ['inventoryNumber', 'name', 'barcode', 'location']);
      match = { $or: [...(words ? [words] : []), { rfid: { $ilike: `%${normalizeRfid(q) || q}%` } }] } as FilterQuery<EquipmentItemEntity>;
    }
    const items = await this.em.fork().find(EquipmentItemEntity, { $and: [visible, { status: { $ne: 'retired' } }, match] }, { limit: 20, orderBy: { inventoryNumber: 'asc' } });
    if (!items.length) return [];
    const vehicles = new Map((await this.organization.vehicles({ includeRetired: true })).map((v) => [v.id, v.radioCallSign || v.designation]));
    const stations = new Map((await this.organization.stations()).map((s) => [s.id, s.name]));
    const place = (i: EquipmentItemEntity) => [i.location, i.vehicleId ? vehicles.get(i.vehicleId) : i.stationId ? stations.get(i.stationId) : '', i.loadingPlace].filter(Boolean).join(' · ');
    return items.map((i) => ({ id: i.id, inventoryNumber: i.inventoryNumber, name: i.name, place: place(i) }));
  }

  /** Defects the user reported. */
  async ownDefects(user: AuthenticatedUser): Promise<Defect[]> {
    return (await this.em.fork().find(DefectEntity, { reportedByUserId: user.id }, { populate: ['item'], orderBy: { reportedAt: 'desc' }, limit: 50 })).map(toDefectDto);
  }

  /** Every member allowed to report defects in the department of the item, e.g. via QR code. */
  async reportDefect(user: AuthenticatedUser, id: string, input: ReturnType<typeof DefectInput.parse>): Promise<Defect> {
    const em = this.em.fork();
    const item = await this.load(em, id, user);
    if (!user.can(REPORT_DEFECTS, item.departmentId) && !this.may(user, 'write', item, await this.isBreathing(em, item))) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [REPORT_DEFECTS] });
    const defect = em.create(DefectEntity, { item, description: input.description, status: 'reported', reportedBy: user.displayName, reportedByUserId: user.id });
    await em.flush();
    await this.events.publish<DefectReportedEvent>(EQUIPMENT_EVENTS.defectReported, { defectId: defect.id, itemId: item.id, departmentId: item.departmentId, description: input.description });
    return toDefectDto(defect);
  }

  /**
   * Handles a defect. "Fixed" needs a resolution; unless another defect is open, the item then waits for an inspection
   * ("in inspection"), which sets it ready when passed. An item without inspection types is ready right away.
   */
  async updateDefect(user: AuthenticatedUser, id: string, input: ReturnType<typeof DefectUpdate.parse>): Promise<Defect> {
    const after: AfterCommit = [];
    const handled = await this.em.fork().transactional(async (em) => {
      const defect = await em.findOne(DefectEntity, id, { populate: ['item'] });
      if (!defect || !(user.can(READ, defect.item.departmentId) || user.can(BREATHING_WRITE, defect.item.departmentId))) throw new NotFoundException();
      const { item } = defect;
      this.requireMay(user, 'write', item, await this.isBreathing(em, item));
      if (input.status === 'fixed' && !input.resolution) throw new BadRequestException({ code: 'equipment.resolutionRequired' });
      defect.status = input.status;
      defect.resolution = input.resolution;
      defect.resolvedAt = input.status === 'fixed' || input.status === 'retired' ? new Date() : null;
      if (input.status === 'in-progress' && item.status !== 'retired') this.setStatus(item, 'in-repair', after);
      if (input.status === 'fixed' && (item.status === 'defective' || item.status === 'in-repair')) {
        const others = await em.count(DefectEntity, { item, status: { $in: [...OPEN_DEFECT] }, id: { $ne: defect.id } });
        const toInspect = ((await this.inspectionsOf(em, [item])).get(item.id) ?? []).length > 0;
        if (!others) this.setStatus(item, toInspect ? 'in-inspection' : 'ready', after);
      }
      return defect;
    });
    for (const publish of after) await publish();
    return toDefectDto(handled);
  }

  // ----- Use in incident reports and training sessions -----

  async forReport(reportId: string, source: UsageSource = 'incidents'): Promise<ReportUsage[]> {
    const rows = await this.em.fork().find(UsageEntity, { reportId, source }, { populate: ['item'] });
    const stock = new Set((await this.em.fork().find(CategoryEntity, { tracking: 'stock' })).map((c) => c.key));
    return rows.map((r) => ({ itemId: r.item.id, name: r.item.name, inventoryNumber: r.item.inventoryNumber, quantity: r.quantity, inspectAfter: r.inspectAfter, stock: stock.has(r.item.categoryKey) }));
  }

  /**
   * Departments of the report or session after checking access: reading needs the read permission of the report or
   * session; writing a draft report that is not locked (releasers always) or a session that is not closed.
   */
  private async usageDepartments(user: AuthenticatedUser, id: string, source: UsageSource, mode: 'read' | 'write'): Promise<string[] | null> {
    if (source === 'incidents') {
      const [report] = this.incidents ? await this.incidents.reports([id]) : [];
      const releaser = user.grant(REPORTS_RELEASE) === 'brigade';
      if (report && !report.departmentId) {
        // Report of a brigade-wide unit (e.g. the duty officer): read brigade-wide, written by releasers; items of any department.
        if (!(releaser || user.grant(REPORTS_READ) === 'brigade')) throw new NotFoundException();
        if (mode === 'write' && !releaser) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [REPORTS_RELEASE] });
        return null;
      }
      const departmentId = report?.departmentId ?? '';
      if (!report || !(releaser || user.can(REPORTS_READ, departmentId) || user.can(REPORTS_WRITE, departmentId))) throw new NotFoundException();
      if (mode === 'write' && !releaser) {
        if (!user.can(REPORTS_WRITE, departmentId)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [REPORTS_WRITE] });
        if (report.locked) throw new ForbiddenException({ code: 'incidents.reportLocked' });
        if (report.status !== 'draft') throw new ForbiddenException({ code: 'incidents.notDraft', status: report.status });
      }
      return [departmentId];
    }
    const [session] = this.sessions ? await this.sessions.sessions([id]) : [];
    const can = (permission: string) => Boolean(session?.departmentIds.some((d) => user.can(permission, d)));
    if (!session || !(can(SESSIONS_READ) || SESSIONS_WRITE.some(can))) throw new NotFoundException();
    if (mode === 'write') {
      if (!SESSIONS_WRITE.some(can)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: SESSIONS_WRITE });
      if (session.status === 'closed') throw new ConflictException({ code: 'training.closed' });
    }
    return session.departmentIds;
  }

  async usage(user: AuthenticatedUser, id: string, source: UsageSource): Promise<ReportUsage[]> {
    await this.usageDepartments(user, id, source, 'read');
    return this.forReport(id, source);
  }

  /** Items of the departments of the report or session; consumables (stock) of any department. */
  async setUsage(user: AuthenticatedUser, reportId: string, input: ReturnType<typeof ReportUsageInput.parse>, source: UsageSource = 'incidents'): Promise<ReportUsage[]> {
    const departments = await this.usageDepartments(user, reportId, source, 'write');
    const em = this.em.fork();
    const items = await em.find(EquipmentItemEntity, { id: { $in: input.map((u) => u.itemId) } });
    const stock = new Set((await em.find(CategoryEntity, { tracking: 'stock' })).map((c) => c.key));
    for (const u of input) {
      const item = items.find((i) => i.id === u.itemId);
      if (!item || item.status === 'retired') throw new BadRequestException({ code: 'equipment.unknownItem' });
      if (departments && !departments.includes(item.departmentId) && !stock.has(item.categoryKey)) throw new BadRequestException({ code: 'equipment.otherDepartment', item: item.inventoryNumber });
    }
    for (const row of await em.find(UsageEntity, { reportId, source })) em.remove(row);
    for (const u of input) em.create(UsageEntity, { reportId, source, item: items.find((i) => i.id === u.itemId)!, quantity: u.quantity, inspectAfter: u.inspectAfter });
    await em.flush();
    return this.forReport(reportId, source);
  }

  /** Closed training session: items marked "inspect after use" get their inspections with the trigger "after use" due. */
  async afterSession(e: SessionClosedEvent): Promise<void> {
    const em = this.em.fork();
    const used = await em.find(UsageEntity, { reportId: e.sessionId, source: 'training', inspectAfter: true }, { populate: ['item'] });
    const items = used.map((u) => u.item).filter((i) => i.status !== 'retired');
    const types = await this.inspectionsOf(em, items);
    const date = berlinDate(new Date(e.startsAt));
    for (const item of items) {
      const keys = (types.get(item.id) ?? []).filter((t) => t.trigger === 'after-use').map((t) => t.key);
      if (keys.length) item.triggered = { ...item.triggered, ...Object.fromEntries(keys.map((k) => [k, date])) };
    }
    await em.flush();
  }

  /**
   * Released report: items marked "inspect after the incident" and all items on the vehicles of the report
   * get their inspections with the trigger "after incident" due.
   */
  async afterIncident(e: ReportReleasedEvent): Promise<void> {
    const em = this.em.fork();
    const used = await em.find(UsageEntity, { reportId: e.reportId, source: 'incidents', inspectAfter: true }, { populate: ['item'] });
    const onVehicles = e.vehicleIds.length ? await em.find(EquipmentItemEntity, { vehicleId: { $in: e.vehicleIds }, status: { $ne: 'retired' } }) : [];
    const items = [...new Map([...used.map((u) => u.item), ...onVehicles].map((i) => [i.id, i])).values()];
    const types = await this.inspectionsOf(em, items);
    const date = berlinDate(new Date(e.alarmedAt));
    for (const item of items) {
      const keys = (types.get(item.id) ?? []).filter((t) => t.trigger === 'after-incident' || (t.trigger === 'after-use' && used.some((u) => u.item.id === item.id))).map((t) => t.key);
      if (keys.length) item.triggered = { ...item.triggered, ...Object.fromEntries(keys.map((k) => [k, date])) };
    }
    await em.flush();
  }
}
