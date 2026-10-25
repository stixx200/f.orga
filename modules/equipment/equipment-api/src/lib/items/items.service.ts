import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, type OnModuleInit, Optional } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { assertVersion, type AuthenticatedUser, berlinDate, DomainEvents, Notifications, wordsWhere } from '@forga/core-api';
import { normalizeRfid } from '@forga/core-contracts';
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
  type ReportUsage,
  ReportUsageInput,
  RetireInput,
  withIntervals,
} from '@forga/equipment-contracts';
import { INCIDENTS_EVENTS, INCIDENTS_LOOKUP, type IncidentsLookup, type ReportReleasedEvent } from '@forga/incidents-contracts';
import { PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
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

/** Qualification an inspector person should have; other inspectors are external. */
const INSPECTOR_QUALIFICATION: Partial<Record<InspectionType['inspector'], (breathing: boolean) => string>> = {
  'competent-person': (breathing) => (breathing ? 'breathing-apparatus-officer' : 'equipment-officer'),
};

const toInspectionDto = (i: InspectionEntity): Inspection => ({
  id: i.id, itemId: i.item.id, inspectionKey: i.inspectionKey, date: i.date, inspectorPersonId: i.inspectorPersonId ?? null, inspectorCompany: i.inspectorCompany, result: i.result,
  checklist: i.checklist, measurements: i.measurements, nextDueOn: i.nextDueOn ?? null, notes: i.notes, recordedBy: i.recordedBy, qualificationWarning: i.qualificationWarning,
  cancelled: i.cancelled, changeReason: i.changeReason,
});

export const toDefectDto = (d: DefectEntity): Defect => ({
  id: d.id, itemId: d.item.id, itemName: d.item.name, inventoryNumber: d.item.inventoryNumber, categoryKey: d.item.categoryKey, departmentId: d.item.departmentId, description: d.description, status: d.status,
  resolution: d.resolution, reportedBy: d.reportedBy, reportedAt: d.reportedAt.toISOString(), resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
});

const toSummary = (i: EquipmentItemEntity): ItemSummary => ({ id: i.id, inventoryNumber: i.inventoryNumber, name: i.name, departmentId: i.departmentId, status: i.status, reportOnly: true });

@Injectable()
export class ItemsService implements OnModuleInit, EquipmentUsageLookup {
  constructor(
    private readonly em: EntityManager,
    private readonly events: DomainEvents,
    private readonly notifications: Notifications,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
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

  /** The item for readers; members who may only report defects get the summary (no price, serial number, inspections). */
  async view(user: AuthenticatedUser, id: string): Promise<Item | ItemSummary> {
    const item = await this.load(this.em.fork(), id, user);
    return user.can(READ, item.departmentId) ? (await this.toDtos([item]))[0] : toSummary(item);
  }

  /** E-mail to those who are to be told about new defects in the department of the item (breathing apparatus: their own permission). */
  private async notifyDefect(event: DefectReportedEvent): Promise<void> {
    const em = this.em.fork();
    const defect = await em.findOne(DefectEntity, event.defectId, { populate: ['item'] });
    if (!defect) return;
    const { item } = defect;
    await this.notifications.notify({
      permission: (await this.isBreathing(em, item)) ? BREATHING_NOTIFY : NOTIFY_DEFECTS,
      departmentId: item.departmentId,
      action: 'equipment.defect-notified',
      details: { defectId: defect.id, itemId: item.id },
      path: `/equipment/items/${item.id}?tab=defects`,
      compose: (language, name) =>
        language === 'de'
          ? { subject: `Neuer Mangel: ${item.name} (${item.inventoryNumber})`, text: `Hallo ${name},\n\n${defect.reportedBy} hat einen Mangel gemeldet:\n\n${item.name} (${item.inventoryNumber})\n${defect.description}` }
          : { subject: `New defect: ${item.name} (${item.inventoryNumber})`, text: `Hello ${name},\n\n${defect.reportedBy} reported a defect:\n\n${item.name} (${item.inventoryNumber})\n${defect.description}` },
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
    const defects = await em.find(DefectEntity, { item: { $in: ids }, status: { $in: ['reported', 'in-progress'] } });
    return items.map((item) => {
      const dues =
        item.status === 'retired'
          ? []
          : computeDues(inspections.get(item.id) ?? [], last.get(item.id) ?? new Map(), item.triggered, today, { purchasedOn: item.purchasedOn ?? null, createdOn: item.createdOn });
      const due = dues.map((d) => d.dueOn).filter((d): d is string => d !== null).toSorted();
      return {
        id: item.id, inventoryNumber: item.inventoryNumber, name: item.name, typeKey: item.typeKey ?? null, categoryKey: item.categoryKey, serialNumber: item.serialNumber, barcode: item.barcode ?? null, rfid: item.rfid ?? null, manufacturer: item.manufacturer,
        yearBuilt: item.yearBuilt ?? null, purchasedOn: item.purchasedOn ?? null, price: item.price === null || item.price === undefined ? null : Number(item.price), properties: item.properties, departmentId: item.departmentId, vehicleId: item.vehicleId ?? null,
        stationId: item.stationId ?? null, loadingPlace: item.loadingPlace, quantity: item.quantity, expiresOn: item.expiresOn ?? null, inspections: inspections.get(item.id) ?? [], ownInspections: item.inspections !== null && item.inspections !== undefined,
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
    const words = filter.q ? wordsWhere(filter.q, ['name', 'inventoryNumber', 'serialNumber', 'barcode']) : null;
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
    // Overrides and initial inspections only for inspection types of the item.
    const keys = new Set((input.inspections ?? type?.inspections ?? []).map((t) => t.key));
    for (const key of [...Object.keys(input.intervalOverrides), ...input.initialInspections.map((i) => i.inspectionKey)]) {
      if (!keys.has(key)) throw new BadRequestException({ code: 'equipment.unknownInspection', key });
    }
    for (const initial of input.initialInspections) this.checkDates(initial.date, initial.nextDueOn);
  }

  /** An inspection lies in the past (or today); its next due date after it. */
  private checkDates(date: string, nextDueOn: string | null): void {
    if (date > berlinDate()) throw new BadRequestException({ code: 'equipment.inspectionInFuture', date });
    if (nextDueOn && nextDueOn <= date) throw new BadRequestException({ code: 'equipment.nextDueNotAfterDate', date, nextDueOn });
  }

  async create(user: AuthenticatedUser, input: ParsedItem): Promise<Item> {
    if (!user.can(WRITE, input.departmentId)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [WRITE] });
    const em = this.em.fork();
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

  async update(user: AuthenticatedUser, id: string, input: ParsedItem): Promise<Item> {
    const em = this.em.fork();
    const item = await this.load(em, id, user);
    this.require(user, WRITE, item);
    assertVersion(item, input.version);
    if (!user.can(WRITE, input.departmentId)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [WRITE] });
    await this.validate(em, { ...input, initialInspections: [] }, id);
    const { version: _version, initialInspections: _initial, ...fields } = input;
    Object.assign(item, fields);
    await em.flush();
    return (await this.toDtos([item]))[0];
  }

  private async setStatus(item: EquipmentItemEntity, status: ItemStatus): Promise<void> {
    if (item.status === status) return;
    const previous = item.status;
    item.status = status;
    await this.events.publish<ItemStatusChangedEvent>(EQUIPMENT_EVENTS.statusChanged, { itemId: item.id, previous, status });
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
    this.require(user, WRITE, item);
    item.retirement = input;
    await this.setStatus(item, 'retired');
    for (const defect of await em.find(DefectEntity, { item, status: { $in: ['reported', 'in-progress'] } })) {
      defect.status = 'retired';
      defect.resolvedAt = new Date();
    }
    await em.flush();
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

  private async record(em: EntityManager, user: AuthenticatedUser, item: EquipmentItemEntity, input: ParsedInspection, types: InspectionType[], breathing: boolean): Promise<InspectionEntity> {
    this.requireMay(user, 'inspect', item, breathing);
    if (item.status === 'retired') throw new ConflictException({ code: 'equipment.retired' });
    const type = types.find((t) => t.key === input.inspectionKey);
    if (!type) throw new BadRequestException({ code: 'equipment.unknownInspection', key: input.inspectionKey });
    this.checkDates(input.date, input.result === 'failed' ? null : input.nextDueOn);
    const inspection = em.create(InspectionEntity, {
      ...input,
      item,
      nextDueOn: this.nextDue(type, input),
      recordedBy: user.displayName,
      qualificationWarning: await this.qualificationWarning(type, input.inspectorPersonId, input.date, breathing),
    });
    if (input.result !== 'failed' && item.triggered[input.inspectionKey] && item.triggered[input.inspectionKey] <= input.date) {
      const { [input.inspectionKey]: _done, ...rest } = item.triggered;
      item.triggered = rest;
    }
    if (input.result === 'failed') {
      await this.setStatus(item, 'defective');
      await this.reportFinding(em, user, item, `${type.name.de}: ${input.notes || 'nicht bestanden'}`);
    } else if (input.result === 'passed-with-defects') {
      // Usable with defects: the defect is recorded, the status stays.
      await this.reportFinding(em, user, item, `${type.name.de}: ${input.notes || 'mit Mängeln'}`);
    } else if (item.status === 'in-inspection' || item.status === 'defective') {
      await this.setStatus(item, 'ready');
    }
    return inspection;
  }

  private async reportFinding(em: EntityManager, user: AuthenticatedUser, item: EquipmentItemEntity, description: string): Promise<void> {
    const defect = em.create(DefectEntity, { item, description, status: 'reported', reportedBy: user.displayName });
    await em.flush();
    await this.events.publish<DefectReportedEvent>(EQUIPMENT_EVENTS.defectReported, { defectId: defect.id, itemId: item.id, departmentId: item.departmentId, description });
  }

  async inspect(user: AuthenticatedUser, id: string, input: ParsedInspection): Promise<Inspection> {
    const em = this.em.fork();
    const item = await this.load(em, id, user);
    const types = (await this.inspectionsOf(em, [item])).get(item.id) ?? [];
    const inspection = await this.record(em, user, item, input, types, await this.isBreathing(em, item));
    await em.flush();
    return toInspectionDto(inspection);
  }

  async bulkInspect(user: AuthenticatedUser, input: ReturnType<typeof BulkInspectionInput.parse>): Promise<{ recorded: number }> {
    const em = this.em.fork();
    const items = await em.find(EquipmentItemEntity, { id: { $in: input.itemIds } });
    if (items.length !== new Set(input.itemIds).size) throw new NotFoundException();
    const types = await this.inspectionsOf(em, items);
    const breathing = await this.breathingCategories(em);
    const { itemIds: _ids, ...single } = input;
    for (const item of items) await this.record(em, user, item, { ...single, checklist: [], nextDueOn: null }, types.get(item.id) ?? [], breathing.has(item.categoryKey));
    await em.flush();
    return { recorded: items.length };
  }

  private async loadInspection(em: EntityManager, user: AuthenticatedUser, id: string): Promise<{ inspection: InspectionEntity; type: InspectionType; breathing: boolean }> {
    const inspection = await em.findOne(InspectionEntity, id, { populate: ['item'] });
    if (!inspection || !user.can(READ, inspection.item.departmentId)) throw new NotFoundException();
    const breathing = await this.isBreathing(em, inspection.item);
    this.requireMay(user, 'inspect', inspection.item, breathing);
    if (inspection.cancelled) throw new ConflictException({ code: 'equipment.inspectionCancelled' });
    const types = (await this.inspectionsOf(em, [inspection.item])).get(inspection.item.id) ?? [];
    const type = types.find((t) => t.key === inspection.inspectionKey) ?? { key: inspection.inspectionKey, name: { de: inspection.inspectionKey, en: inspection.inspectionKey }, intervalMonths: null, trigger: 'periodic', inspector: 'user', checklist: [] };
    return { inspection, type, breathing };
  }

  /** Corrects a recorded inspection (typing error, wrong date or result); the reason stays with it and in the history. Status and defects stay. */
  async correctInspection(user: AuthenticatedUser, id: string, input: ReturnType<typeof InspectionCorrection.parse>): Promise<Inspection> {
    const em = this.em.fork();
    const { inspection, type, breathing } = await this.loadInspection(em, user, id);
    this.checkDates(input.date, input.result === 'failed' ? null : input.nextDueOn);
    const { reason, ...fields } = input;
    Object.assign(inspection, {
      ...fields,
      nextDueOn: this.nextDue(type, input),
      qualificationWarning: await this.qualificationWarning(type, input.inspectorPersonId, input.date, breathing),
      changeReason: reason,
    });
    await em.flush();
    return toInspectionDto(inspection);
  }

  /** Cancels an inspection recorded by mistake: it stays in the history, but no longer counts for the due dates. */
  async cancelInspection(user: AuthenticatedUser, id: string, input: ReturnType<typeof InspectionCancellation.parse>): Promise<Inspection> {
    const em = this.em.fork();
    const { inspection } = await this.loadInspection(em, user, id);
    inspection.cancelled = true;
    inspection.changeReason = input.reason;
    await em.flush();
    return toInspectionDto(inspection);
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
    if (filter.open) Object.assign(where, { status: { $in: ['reported', 'in-progress'] } });
    if (filter.itemId) Object.assign(where, { item: { ...(visible as object), id: filter.itemId } });
    return (await this.em.fork().find(DefectEntity, where, { populate: ['item'], orderBy: { reportedAt: 'desc' } })).map(toDefectDto);
  }

  /** "My area": items the user may report defects for, by inventory number or name. */
  async reportable(user: AuthenticatedUser, query: string): Promise<{ id: string; inventoryNumber: string; name: string }[]> {
    const visible = this.visible(user, REPORT_DEFECTS);
    const q = query.trim();
    if (!visible || q.length < 2) return [];
    const words = wordsWhere(q, ['inventoryNumber', 'name', 'barcode']);
    const match = { $or: [...(words ? [words] : []), { rfid: { $ilike: `%${normalizeRfid(q) || q}%` } }] } as FilterQuery<EquipmentItemEntity>;
    const items = await this.em.fork().find(EquipmentItemEntity, { $and: [visible, { status: { $ne: 'retired' } }, match] }, { limit: 20, orderBy: { inventoryNumber: 'asc' } });
    return items.map((i) => ({ id: i.id, inventoryNumber: i.inventoryNumber, name: i.name }));
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
   * Handles a defect. "Fixed" needs a resolution; the item then waits for an inspection ("in inspection"), which
   * sets it ready when passed, unless another defect is open.
   */
  async updateDefect(user: AuthenticatedUser, id: string, input: ReturnType<typeof DefectUpdate.parse>): Promise<Defect> {
    const em = this.em.fork();
    const defect = await em.findOne(DefectEntity, id, { populate: ['item'] });
    if (!defect || !(user.can(READ, defect.item.departmentId) || user.can(BREATHING_WRITE, defect.item.departmentId))) throw new NotFoundException();
    this.requireMay(user, 'write', defect.item, await this.isBreathing(em, defect.item));
    if (input.status === 'fixed' && !input.resolution) throw new BadRequestException({ code: 'equipment.resolutionRequired' });
    defect.status = input.status;
    defect.resolution = input.resolution;
    defect.resolvedAt = input.status === 'fixed' || input.status === 'retired' ? new Date() : null;
    if (input.status === 'in-progress' && defect.item.status !== 'retired') await this.setStatus(defect.item, 'in-repair');
    if (input.status === 'fixed' && (defect.item.status === 'defective' || defect.item.status === 'in-repair')) {
      const others = await em.count(DefectEntity, { item: defect.item, status: { $in: ['reported', 'in-progress'] }, id: { $ne: defect.id } });
      if (!others) await this.setStatus(defect.item, 'in-inspection');
    }
    await em.flush();
    return toDefectDto(defect);
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
  private async usageDepartments(user: AuthenticatedUser, id: string, source: UsageSource, mode: 'read' | 'write'): Promise<string[]> {
    if (source === 'incidents') {
      const [report] = this.incidents ? await this.incidents.reports([id]) : [];
      const releaser = user.grant(REPORTS_RELEASE) === 'brigade';
      if (!report || !(releaser || user.can(REPORTS_READ, report.departmentId) || user.can(REPORTS_WRITE, report.departmentId))) throw new NotFoundException();
      if (mode === 'write' && !releaser) {
        if (!user.can(REPORTS_WRITE, report.departmentId)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [REPORTS_WRITE] });
        if (report.locked) throw new ForbiddenException({ code: 'incidents.reportLocked' });
        if (report.status !== 'draft') throw new ForbiddenException({ code: 'incidents.notDraft', status: report.status });
      }
      return [report.departmentId];
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
      if (!departments.includes(item.departmentId) && !stock.has(item.categoryKey)) throw new BadRequestException({ code: 'equipment.otherDepartment', item: item.inventoryNumber });
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
