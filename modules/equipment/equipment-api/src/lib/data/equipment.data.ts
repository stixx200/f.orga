import { Inject, Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { type AuthenticatedUser, berlinDate, type DeadlineInput, type DeadlineProvider, type DescribeContext, type PersonDataSection, SettingsService, User, wordsWhere } from '@forga/core-api';
import { type LocalizedText, normalizeRfid, type SearchHit } from '@forga/core-contracts';
import { EquipmentSettings } from '@forga/equipment-contracts';
import { ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import { CategoryEntity, DefectEntity, EquipmentItemEntity, EquipmentTypeEntity, InspectionEntity, RecentBulkCategoryEntity, UsageEntity } from '../equipment.entities.js';
import { BREATHING_INSPECT, BREATHING_WRITE, INSPECT, ItemsService, READ, REPORT_DEFECTS, WRITE } from '../items/items.service.js';

/** The item of a defect or an inspection in the data access request. */
const itemReference = (i: EquipmentItemEntity) => ({ id: i.id, inventoryNumber: i.inventoryNumber, name: i.name });

/** The item in the access report: inventory number and name. */
const itemLabel = (i: EquipmentItemEntity) => `${i.inventoryNumber} ${i.name}`.trim();

/** Deadlines (inspections, expiry, open defects), search and export of the equipment module. */
@Injectable()
export class EquipmentData implements DeadlineProvider {
  readonly module = 'equipment';

  constructor(
    private readonly em: EntityManager,
    private readonly items: ItemsService,
    private readonly settings: SettingsService,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  async settingsValue(): Promise<EquipmentSettings> {
    return EquipmentSettings.parse((await this.settings.get('equipment.settings')) ?? {});
  }

  /**
   * Inspections and expiry of items, reported defects. Items of breathing apparatus categories go to the breathing
   * apparatus officer (`equipment.breathing.*`), the others to the equipment officer.
   */
  async deadlines(asOf: string): Promise<DeadlineInput[]> {
    const em = this.em.fork();
    const settings = await this.settingsValue();
    const active = await em.find(EquipmentItemEntity, { status: { $ne: 'retired' } });
    const items = await this.items.toDtos(active, asOf);
    const all = await em.find(CategoryEntity, {});
    const categories = new Map(all.map((c) => [c.key, c.name]));
    const breathing = new Set(all.filter((c) => c.breathingApparatus).map((c) => c.key));
    const inspect = (categoryKey: string) => (breathing.has(categoryKey) ? BREATHING_INSPECT : INSPECT);
    const write = (categoryKey: string) => (breathing.has(categoryKey) ? BREATHING_WRITE : WRITE);
    const vehicles = new Map((await this.organization.vehicles({ includeRetired: true })).map((v) => [v.id, v.radioCallSign || v.designation]));
    // The weekly e-mail lists the deadlines of items by category and vehicle.
    const group = (categoryKey: string, vehicleId: string | null): LocalizedText => {
      const category = categories.get(categoryKey) ?? { de: categoryKey, en: categoryKey };
      const vehicle = vehicleId ? vehicles.get(vehicleId) : null;
      return vehicle ? { de: `${category.de} · ${vehicle}`, en: `${category.en || category.de} · ${vehicle}` } : { de: category.de, en: category.en || category.de };
    };
    const deadlines: DeadlineInput[] = [];
    for (const item of items) {
      for (const due of item.dues) {
        if (!due.dueOn) continue;
        deadlines.push({
          id: `inspection:${item.id}:${due.key}`,
          kind: 'equipment-inspection',
          title: { de: `Prüfung: ${due.name.de}`, en: `Inspection: ${due.name.en}` },
          subject: { type: 'equipment.item', id: item.id, label: `${item.inventoryNumber} ${item.name}` },
          dueOn: due.dueOn,
          leadDays: settings.inspectionLeadDays,
          departmentIds: [item.departmentId],
          permission: inspect(item.categoryKey),
          group: group(item.categoryKey, item.vehicleId),
          to: `/equipment/items/${item.id}?tab=inspections`,
        });
      }
      if (item.expiresOn) {
        deadlines.push({
          id: `expires:${item.id}`,
          kind: 'equipment-expires',
          title: { de: 'Gerät läuft ab (aussondern)', en: 'Item expires (retire)' },
          subject: { type: 'equipment.item', id: item.id, label: `${item.inventoryNumber} ${item.name}` },
          dueOn: item.expiresOn,
          leadDays: settings.expiryLeadDays,
          departmentIds: [item.departmentId],
          permission: write(item.categoryKey),
          group: group(item.categoryKey, item.vehicleId),
          to: `/equipment/items/${item.id}`,
        });
      }
    }
    for (const defect of await em.find(DefectEntity, { status: 'reported' }, { populate: ['item'] })) {
      deadlines.push({
        id: `defect:${defect.id}`,
        kind: 'equipment-defect',
        title: { de: 'Mangel bearbeiten', en: 'Handle defect' },
        // The label names the reported text; a finding of an inspection without notes only names the item.
        subject: { type: 'equipment.item', id: defect.item.id, label: [`${defect.item.inventoryNumber} ${defect.item.name}`, defect.description].filter(Boolean).join(': ') },
        dueOn: berlinDate(defect.reportedAt),
        leadDays: 0,
        departmentIds: [defect.item.departmentId],
        permission: write(defect.item.categoryKey),
        to: `/equipment/items/${defect.item.id}?tab=defects`,
      });
    }
    return deadlines;
  }

  async search(user: AuthenticatedUser, query: string): Promise<SearchHit[]> {
    const visible = this.items.visible(user);
    if (!visible) return [];
    const words = wordsWhere(query, ['name', 'inventoryNumber', 'serialNumber', 'barcode', 'location']);
    const found = await this.em.fork().find(EquipmentItemEntity, { $and: [visible, { $or: [...(words ? [words] : []), { rfid: { $ilike: `%${normalizeRfid(query) || query}%` } }] }] } as never, { limit: 6 });
    return found.map((i) => this.hit(i));
  }

  /**
   * Scanned code: label URL of f.orga, barcode, RFID chip, inventory or serial number (exact, ignoring case).
   * Readers open the inspections of the item; members who may only report defects get the item without details and
   * open "report a defect".
   */
  async code(user: AuthenticatedUser, code: string): Promise<SearchHit[]> {
    const readable = this.items.visible(user);
    const reportable = this.items.visible(user, REPORT_DEFECTS);
    const visible = readable && reportable ? { $or: [readable, reportable] } : (readable ?? reportable);
    if (!visible) return [];
    const label = /\/equipment\/items\/([0-9a-f-]{36})/i.exec(code);
    const exact = code.replace(/[\\%_]/g, '\\$&');
    const where = label
      ? { id: label[1].toLowerCase() }
      : { $or: [{ barcode: { $ilike: exact } }, { rfid: normalizeRfid(code) }, { inventoryNumber: { $ilike: exact } }, { serialNumber: { $ilike: exact } }] };
    const found = await this.em.fork().find(EquipmentItemEntity, { $and: [visible, where] } as never, { limit: 20, orderBy: { inventoryNumber: 'asc' } });
    return found.flatMap((i) => (user.can(READ, i.departmentId) ? [this.hit(i, `/equipment/items/${i.id}?tab=inspections`)] : i.status === 'retired' ? [] : [this.reportHit(i)]));
  }

  private hit(i: EquipmentItemEntity, to = `/equipment/items/${i.id}`): SearchHit {
    return { id: i.id, group: { de: 'Geräte', en: 'Equipment' }, title: `${i.inventoryNumber} ${i.name}`, description: i.serialNumber, to };
  }

  private reportHit(i: EquipmentItemEntity): SearchHit {
    return { id: i.id, group: { de: 'Mangel melden', en: 'Report a defect' }, title: `${i.inventoryNumber} ${i.name}`, description: '', to: `/equipment/items/${i.id}?report=defect` };
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const plain = async <T extends object>(entity: new () => T) => (await em.find(entity, {})).map((e) => wrap(e).toObject());
    return {
      categories: await plain(CategoryEntity),
      types: await plain(EquipmentTypeEntity),
      items: await plain(EquipmentItemEntity),
      inspections: await plain(InspectionEntity),
      defects: await plain(DefectEntity),
      usage: await plain(UsageEntity),
    };
  }

  /** Data access request: defects the person reported (with the accounts linked to the person) and inspections by the person. */
  async exportPerson(personId: string): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const userIds = (await em.find(User, { personId })).map((u) => u.id);
    const defects = userIds.length ? await em.find(DefectEntity, { reportedByUserId: { $in: userIds } }, { populate: ['item'], orderBy: { reportedAt: 'asc' } }) : [];
    const inspections = await em.find(InspectionEntity, { inspectorPersonId: personId }, { populate: ['item'], orderBy: { date: 'asc' } });
    const recent = userIds.length ? await em.find(RecentBulkCategoryEntity, { userId: { $in: userIds } }) : [];
    return {
      reportedDefects: defects.map((d) => ({ ...wrap(d).toObject(), item: itemReference(d.item) })),
      inspections: inspections.map((i) => ({ ...wrap(i).toObject(), item: itemReference(i.item) })),
      recentBulkCategories: recent.flatMap((row) => row.categoryKeys),
    };
  }

  /**
   * Access report: defects reported by the person's user accounts and inspections the person performed. The items are
   * named by inventory number and name; who recorded or resolved something is not named.
   */
  async describePerson(personId: string, ctx: DescribeContext): Promise<PersonDataSection[]> {
    const em = this.em.fork();
    const userIds = [...ctx.ownUserIds];
    const defects = userIds.length ? await em.find(DefectEntity, { reportedByUserId: { $in: userIds } }, { populate: ['item'], orderBy: { reportedAt: 'desc' } }) : [];
    const inspections = await em.find(InspectionEntity, { inspectorPersonId: personId }, { populate: ['item'], orderBy: { date: 'desc' } });
    if (!defects.length && !inspections.length) return [];
    const types = new Map((await em.find(EquipmentTypeEntity, {})).map((t) => [t.key, t]));
    const inspectionName = (i: InspectionEntity) => {
      const list = i.item.inspections ?? (i.item.typeKey ? types.get(i.item.typeKey)?.inspections : undefined) ?? [];
      const found = list.find((t) => t.key === i.inspectionKey);
      return found ? ctx.text(found.name) : ctx.t('Prüfung', 'Inspection');
    };
    const results: Record<string, string> = { passed: ctx.t('bestanden', 'passed'), 'passed-with-defects': ctx.t('bestanden mit Mängeln', 'passed with defects'), failed: ctx.t('nicht bestanden', 'failed') };
    const statuses: Record<string, string> = {
      reported: ctx.t('gemeldet', 'reported'),
      'in-progress': ctx.t('in Bearbeitung', 'in progress'),
      fixed: ctx.t('behoben', 'fixed'),
      retired: ctx.t('Gerät ausgesondert', 'item retired'),
      withdrawn: ctx.t('zurückgezogen', 'withdrawn'),
    };
    const blocks: PersonDataSection['blocks'] = [];
    if (defects.length) {
      blocks.push({
        kind: 'table',
        title: ctx.t('Von Ihnen gemeldete Mängel', 'Defects you reported'),
        columns: [ctx.t('Gemeldet', 'Reported'), ctx.t('Gerät', 'Item'), ctx.t('Beschreibung', 'Description'), ctx.t('Stand', 'Status'), ctx.t('Erledigt', 'Resolved')],
        rows: defects.map((d) => [ctx.date(d.reportedAt), itemLabel(d.item), ctx.value(d.description), statuses[d.status] ?? d.status, ctx.date(d.resolvedAt)]),
      });
    }
    if (inspections.length) {
      blocks.push({
        kind: 'table',
        title: ctx.t('Von Ihnen durchgeführte Prüfungen', 'Inspections you performed'),
        columns: [ctx.t('Datum', 'Date'), ctx.t('Gerät', 'Item'), ctx.t('Prüfung', 'Inspection'), ctx.t('Ergebnis', 'Result'), ctx.t('Nächste Prüfung', 'Next inspection'), ctx.t('Bemerkung', 'Remark')],
        rows: inspections.map((i) => [
          ctx.date(i.date),
          itemLabel(i.item),
          inspectionName(i),
          [results[i.result] ?? i.result, i.cancelled ? ctx.t('storniert', 'cancelled') : '', i.qualificationWarning ? ctx.t('Hinweis: Befähigung fehlte', 'note: qualification missing') : ''].filter(Boolean).join(', '),
          ctx.date(i.nextDueOn),
          [i.measurements, i.notes, i.changeReason].filter(Boolean).join('; ') || '–',
        ]),
      });
    }
    return [
      {
        key: 'equipment',
        title: ctx.t('Geräte', 'Equipment'),
        activity: 'equipment.inspections',
        categories: [ctx.t('Mängelmeldungen', 'Defect reports'), ctx.t('Durchgeführte Prüfungen', 'Inspections performed')],
        blocks,
        records: [
          { entity: 'equipment.defect', ids: defects.map((d) => d.id), label: ctx.t('Mangel', 'Defect') },
          { entity: 'equipment.inspection', ids: inspections.map((i) => i.id), label: ctx.t('Prüfung', 'Inspection') },
        ],
      },
    ];
  }
}
