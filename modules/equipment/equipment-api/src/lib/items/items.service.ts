import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, type OnModuleInit, Optional } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { assertVersion, type AuthenticatedUser, berlinDate, DomainEvents, Notifications } from '@forga/core-api';
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
  InspectionInput,
  type InspectionType,
  type Item,
  ItemInput,
  type ItemStatus,
  type ItemIncident,
  type ItemStatusChangedEvent,
  type ReportUsage,
  ReportUsageInput,
  RetireInput,
} from '@forga/equipment-contracts';
import { INCIDENTS_EVENTS, INCIDENTS_LOOKUP, type IncidentsLookup, type ReportReleasedEvent } from '@forga/incidents-contracts';
import { PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { type SessionClosedEvent, TRAINING_EVENTS } from '@forga/training-contracts';
import { CategoryEntity, DefectEntity, EquipmentItemEntity, EquipmentTypeEntity, InspectionEntity, UsageEntity } from '../equipment.entities.js';

export const READ = 'equipment.read';
export const WRITE = 'equipment.write';
export const INSPECT = 'equipment.inspect';
export const REPORT_DEFECTS = 'equipment.defects.report';
export const NOTIFY_DEFECTS = 'equipment.defects.notify';

type ParsedItem = ReturnType<typeof ItemInput.parse>;
type ParsedInspection = ReturnType<typeof InspectionInput.parse>;

/** Qualification an inspector person should have; other inspectors are external. */
const INSPECTOR_QUALIFICATION: Partial<Record<InspectionType['inspector'], (breathing: boolean) => string>> = {
  'competent-person': (breathing) => (breathing ? 'breathing-apparatus-officer' : 'equipment-officer'),
};

const toInspectionDto = (i: InspectionEntity): Inspection => ({
  id: i.id, itemId: i.item.id, inspectionKey: i.inspectionKey, date: i.date, inspectorPersonId: i.inspectorPersonId ?? null, inspectorCompany: i.inspectorCompany, result: i.result,
  checklist: i.checklist, measurements: i.measurements, nextDueOn: i.nextDueOn ?? null, notes: i.notes, recordedBy: i.recordedBy, qualificationWarning: i.qualificationWarning,
});

export const toDefectDto = (d: DefectEntity): Defect => ({
  id: d.id, itemId: d.item.id, itemName: d.item.name, inventoryNumber: d.item.inventoryNumber, departmentId: d.item.departmentId, description: d.description, status: d.status,
  resolution: d.resolution, reportedBy: d.reportedBy, reportedAt: d.reportedAt.toISOString(), resolvedAt: d.resolvedAt ? d.resolvedAt.toISOString() : null,
});

@Injectable()
export class ItemsService implements OnModuleInit, EquipmentUsageLookup {
  constructor(
    private readonly em: EntityManager,
    private readonly events: DomainEvents,
    private readonly notifications: Notifications,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Optional() @Inject(INCIDENTS_LOOKUP) private readonly incidents?: IncidentsLookup,
  ) {}

  onModuleInit(): void {
    this.events.subscribe<ReportReleasedEvent>(INCIDENTS_EVENTS.reportReleased, (e) => this.afterIncident(e));
    this.events.subscribe<DefectReportedEvent>(EQUIPMENT_EVENTS.defectReported, (e) => this.notifyDefect(e));
    this.events.subscribe<SessionClosedEvent>(TRAINING_EVENTS.sessionClosed, (e) => this.afterSession(e));
  }

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

  /** E-mail to those who are to be told about new defects in the department of the item. */
  private async notifyDefect(event: DefectReportedEvent): Promise<void> {
    const defect = await this.em.fork().findOne(DefectEntity, event.defectId, { populate: ['item'] });
    if (!defect) return;
    const { item } = defect;
    await this.notifications.notify({
      permission: NOTIFY_DEFECTS,
      departmentId: item.departmentId,
      action: 'equipment.defect-notified',
      details: { defectId: defect.id, itemId: item.id },
      path: `/equipment/items/${item.id}`,
      compose: (language, name) =>
        language === 'de'
          ? { subject: `Neuer Mangel: ${item.name} (${item.inventoryNumber})`, text: `Hallo ${name},\n\n${defect.reportedBy} hat einen Mangel gemeldet:\n\n${item.name} (${item.inventoryNumber})\n${defect.description}` }
          : { subject: `New defect: ${item.name} (${item.inventoryNumber})`, text: `Hello ${name},\n\n${defect.reportedBy} reported a defect:\n\n${item.name} (${item.inventoryNumber})\n${defect.description}` },
    });
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

  /** Effective inspection types: own ones, otherwise those of the equipment type. */
  private async inspectionsOf(em: EntityManager, items: EquipmentItemEntity[]): Promise<Map<string, InspectionType[]>> {
    const types = new Map((await em.find(EquipmentTypeEntity, { key: { $in: [...new Set(items.flatMap((i) => (i.typeKey ? [i.typeKey] : [])))] } })).map((t) => [t.key, t.inspections]));
    return new Map(items.map((i) => [i.id, i.inspections ?? (i.typeKey ? (types.get(i.typeKey) ?? []) : [])]));
  }

  async toDtos(items: EquipmentItemEntity[], today = berlinDate()): Promise<Item[]> {
    if (!items.length) return [];
    const em = this.em.fork();
    const inspections = await this.inspectionsOf(em, items);
    const ids = items.map((i) => i.id);
    const done = await em.find(InspectionEntity, { item: { $in: ids } }, { orderBy: { date: 'desc' } });
    const last = new Map<string, Map<string, { date: string; nextDueOn: string | null }>>();
    for (const i of done) {
      const perItem = last.get(i.item.id) ?? new Map();
      if (!perItem.has(i.inspectionKey)) perItem.set(i.inspectionKey, { date: i.date, nextDueOn: i.nextDueOn ?? null });
      last.set(i.item.id, perItem);
    }
    const defects = await em.find(DefectEntity, { item: { $in: ids }, status: { $in: ['reported', 'in-progress'] } });
    return items.map((item) => {
      const dues = item.status === 'retired' ? [] : computeDues(inspections.get(item.id) ?? [], last.get(item.id) ?? new Map(), item.triggered, today);
      const due = dues.map((d) => d.dueOn).filter((d): d is string => d !== null).toSorted();
      return {
        id: item.id, inventoryNumber: item.inventoryNumber, name: item.name, typeKey: item.typeKey ?? null, categoryKey: item.categoryKey, serialNumber: item.serialNumber, barcode: item.barcode ?? null, rfid: item.rfid ?? null, manufacturer: item.manufacturer,
        yearBuilt: item.yearBuilt ?? null, purchasedOn: item.purchasedOn ?? null, price: item.price === null || item.price === undefined ? null : Number(item.price), properties: item.properties, departmentId: item.departmentId, vehicleId: item.vehicleId ?? null,
        stationId: item.stationId ?? null, loadingPlace: item.loadingPlace, quantity: item.quantity, expiresOn: item.expiresOn ?? null, inspections: inspections.get(item.id) ?? [], ownInspections: item.inspections !== null && item.inspections !== undefined,
        status: item.status, retirement: item.retirement ?? null, forVehicleId: item.forVehicleId ?? null, dues, nextDue: due[0] ?? null,
        openDefects: defects.filter((d) => d.item.id === item.id).length, notes: item.notes, version: item.version,
      };
    });
  }

  async list(user: AuthenticatedUser, filter: { categoryKey?: string; departmentId?: string; vehicleId?: string; status?: string; q?: string; includeRetired?: boolean; dueBefore?: string }): Promise<Item[]> {
    const visible = this.visible(user);
    if (!visible) return [];
    const where: FilterQuery<EquipmentItemEntity>[] = [visible];
    if (filter.categoryKey) where.push({ categoryKey: filter.categoryKey });
    if (filter.departmentId) where.push({ departmentId: filter.departmentId });
    if (filter.vehicleId) where.push({ vehicleId: filter.vehicleId });
    if (filter.status) where.push({ status: filter.status as ItemStatus });
    else if (!filter.includeRetired) where.push({ status: { $ne: 'retired' } });
    if (filter.q) where.push({ $or: [{ name: { $ilike: `%${filter.q}%` } }, { inventoryNumber: { $ilike: `%${filter.q}%` } }, { serialNumber: { $ilike: `%${filter.q}%` } }, { barcode: { $ilike: `%${filter.q}%` } }, { rfid: { $ilike: `%${normalizeRfid(filter.q) || filter.q}%` } }] });
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
    if (input.typeKey && !(await em.count(EquipmentTypeEntity, { key: input.typeKey }))) throw new BadRequestException({ code: 'equipment.unknownType', key: input.typeKey });
  }

  async create(user: AuthenticatedUser, input: ParsedItem): Promise<Item> {
    if (!user.can(WRITE, input.departmentId)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [WRITE] });
    const em = this.em.fork();
    await this.validate(em, input);
    const { version: _version, ...fields } = input;
    const item = em.create(EquipmentItemEntity, { ...fields, status: 'ready', triggered: {}, forVehicleId: null });
    await em.flush();
    return (await this.toDtos([item]))[0];
  }

  async update(user: AuthenticatedUser, id: string, input: ParsedItem): Promise<Item> {
    const em = this.em.fork();
    const item = await this.load(em, id, user);
    this.require(user, WRITE, item);
    assertVersion(item, input.version);
    if (!user.can(WRITE, input.departmentId)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [WRITE] });
    await this.validate(em, input, id);
    const { version: _version, ...fields } = input;
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
    this.require(user, WRITE, item);
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

  async inspections(user: AuthenticatedUser, id: string): Promise<Inspection[]> {
    const em = this.em.fork();
    const item = await this.load(em, id, user);
    return (await em.find(InspectionEntity, { item }, { orderBy: { date: 'desc' } })).map(toInspectionDto);
  }

  private async record(em: EntityManager, user: AuthenticatedUser, item: EquipmentItemEntity, input: ParsedInspection, types: InspectionType[], breathing: boolean): Promise<InspectionEntity> {
    this.require(user, INSPECT, item);
    if (item.status === 'retired') throw new ConflictException({ code: 'equipment.retired' });
    const type = types.find((t) => t.key === input.inspectionKey);
    if (!type) throw new BadRequestException({ code: 'equipment.unknownInspection', key: input.inspectionKey });
    let warning = false;
    const expected = INSPECTOR_QUALIFICATION[type.inspector]?.(breathing);
    if (input.inspectorPersonId && expected) {
      const [person] = await this.directory.snapshots([input.inspectorPersonId], input.date);
      warning = !person?.qualifications.includes(expected);
    }
    const inspection = em.create(InspectionEntity, {
      ...input,
      item,
      nextDueOn: input.nextDueOn ?? (type.intervalMonths ? addMonths(input.date, type.intervalMonths) : null),
      recordedBy: user.displayName,
      qualificationWarning: warning,
    });
    if (item.triggered[input.inspectionKey] && item.triggered[input.inspectionKey] <= input.date) {
      const { [input.inspectionKey]: _done, ...rest } = item.triggered;
      item.triggered = rest;
    }
    if (input.result === 'failed') {
      await this.setStatus(item, 'defective');
      const defect = em.create(DefectEntity, { item, description: `${type.name.de}: ${input.notes || 'nicht bestanden'}`, status: 'reported', reportedBy: user.displayName });
      await em.flush();
      await this.events.publish<DefectReportedEvent>(EQUIPMENT_EVENTS.defectReported, { defectId: defect.id, itemId: item.id, departmentId: item.departmentId, description: defect.description });
    } else if (item.status === 'in-inspection' || item.status === 'defective') {
      await this.setStatus(item, input.result === 'passed' ? 'ready' : item.status);
    }
    return inspection;
  }

  async inspect(user: AuthenticatedUser, id: string, input: ParsedInspection): Promise<Inspection> {
    const em = this.em.fork();
    const item = await this.load(em, id, user);
    const types = (await this.inspectionsOf(em, [item])).get(item.id) ?? [];
    const category = await em.findOne(CategoryEntity, { key: item.categoryKey });
    const inspection = await this.record(em, user, item, input, types, category?.breathingApparatus ?? false);
    await em.flush();
    return toInspectionDto(inspection);
  }

  async bulkInspect(user: AuthenticatedUser, input: ReturnType<typeof BulkInspectionInput.parse>): Promise<{ recorded: number }> {
    const em = this.em.fork();
    const items = await em.find(EquipmentItemEntity, { id: { $in: input.itemIds } });
    if (items.length !== new Set(input.itemIds).size) throw new NotFoundException();
    const types = await this.inspectionsOf(em, items);
    const breathing = new Set((await em.find(CategoryEntity, { breathingApparatus: true })).map((c) => c.key));
    const { itemIds: _ids, ...single } = input;
    for (const item of items) await this.record(em, user, item, { ...single, checklist: [], nextDueOn: null }, types.get(item.id) ?? [], breathing.has(item.categoryKey));
    await em.flush();
    return { recorded: items.length };
  }

  /** Makes an "after …" inspection due now, e.g. after washing a hose. */
  async trigger(user: AuthenticatedUser, id: string, inspectionKey: string): Promise<Item> {
    const em = this.em.fork();
    const item = await this.load(em, id, user);
    this.require(user, INSPECT, item);
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
    const like = `%${q.replaceAll('%', '').replaceAll('_', '')}%`;
    const items = await this.em.fork().find(EquipmentItemEntity, { $and: [visible, { status: { $ne: 'retired' } }, { $or: [{ inventoryNumber: { $ilike: like } }, { name: { $ilike: like } }, { barcode: { $ilike: like } }, { rfid: { $ilike: `%${normalizeRfid(query) || query}%` } }] }] }, { limit: 20, orderBy: { inventoryNumber: 'asc' } });
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
    if (!user.can(REPORT_DEFECTS, item.departmentId) && !user.can(WRITE, item.departmentId)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [REPORT_DEFECTS] });
    const defect = em.create(DefectEntity, { item, description: input.description, status: 'reported', reportedBy: user.displayName, reportedByUserId: user.id });
    await em.flush();
    await this.events.publish<DefectReportedEvent>(EQUIPMENT_EVENTS.defectReported, { defectId: defect.id, itemId: item.id, departmentId: item.departmentId, description: input.description });
    return toDefectDto(defect);
  }

  async updateDefect(user: AuthenticatedUser, id: string, input: ReturnType<typeof DefectUpdate.parse>): Promise<Defect> {
    const em = this.em.fork();
    const defect = await em.findOne(DefectEntity, id, { populate: ['item'] });
    if (!defect) throw new NotFoundException();
    this.require(user, WRITE, defect.item);
    defect.status = input.status;
    defect.resolution = input.resolution;
    defect.resolvedAt = input.status === 'fixed' || input.status === 'retired' ? new Date() : null;
    if (input.status === 'in-progress' && defect.item.status !== 'retired') await this.setStatus(defect.item, 'in-repair');
    if (input.status === 'fixed' && (defect.item.status === 'defective' || defect.item.status === 'in-repair')) {
      const others = await em.count(DefectEntity, { item: defect.item, status: { $in: ['reported', 'in-progress'] }, id: { $ne: defect.id } });
      if (!others) await this.setStatus(defect.item, 'ready');
    }
    await em.flush();
    return toDefectDto(defect);
  }

  // ----- Use in incident reports and training sessions -----

  async forReport(reportId: string, source: 'incidents' | 'training' = 'incidents'): Promise<ReportUsage[]> {
    const rows = await this.em.fork().find(UsageEntity, { reportId, source }, { populate: ['item'] });
    const stock = new Set((await this.em.fork().find(CategoryEntity, { tracking: 'stock' })).map((c) => c.key));
    return rows.map((r) => ({ itemId: r.item.id, name: r.item.name, inventoryNumber: r.item.inventoryNumber, quantity: r.quantity, inspectAfter: r.inspectAfter, stock: stock.has(r.item.categoryKey) }));
  }

  async setUsage(user: AuthenticatedUser, reportId: string, input: ReturnType<typeof ReportUsageInput.parse>, source: 'incidents' | 'training' = 'incidents'): Promise<ReportUsage[]> {
    const permissions = source === 'incidents' ? ['incidents.reports.write', 'incidents.reports.release'] : ['training.attendance', 'training.plan'];
    if (!permissions.some((p) => user.can(p))) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [permissions[0]] });
    const em = this.em.fork();
    for (const row of await em.find(UsageEntity, { reportId, source })) em.remove(row);
    const items = await em.find(EquipmentItemEntity, { id: { $in: input.map((u) => u.itemId) } });
    for (const u of input) {
      const item = items.find((i) => i.id === u.itemId);
      if (!item) throw new BadRequestException({ code: 'equipment.unknownItem' });
      em.create(UsageEntity, { reportId, source, item, quantity: u.quantity, inspectAfter: u.inspectAfter });
    }
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
