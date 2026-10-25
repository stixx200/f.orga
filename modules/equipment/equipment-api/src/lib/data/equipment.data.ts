import { Inject, Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { type AuthenticatedUser, berlinDate, type DeadlineInput, type DeadlineProvider, wordsWhere } from '@forga/core-api';
import { type LocalizedText, normalizeRfid, type SearchHit } from '@forga/core-contracts';
import { ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import { CategoryEntity, DefectEntity, EquipmentItemEntity, EquipmentTypeEntity, InspectionEntity, UsageEntity } from '../equipment.entities.js';
import { INSPECT, ItemsService, WRITE } from '../items/items.service.js';

/** Deadlines (inspections, expiry, open defects), search and export of the equipment module. */
@Injectable()
export class EquipmentData implements DeadlineProvider {
  readonly module = 'equipment';

  constructor(
    private readonly em: EntityManager,
    private readonly items: ItemsService,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  async deadlines(asOf: string): Promise<DeadlineInput[]> {
    const em = this.em.fork();
    const active = await em.find(EquipmentItemEntity, { status: { $ne: 'retired' } });
    const items = await this.items.toDtos(active, asOf);
    const categories = new Map((await em.find(CategoryEntity, {})).map((c) => [c.key, c.name]));
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
          leadDays: 30,
          departmentIds: [item.departmentId],
          permission: INSPECT,
          group: group(item.categoryKey, item.vehicleId),
        });
      }
      if (item.expiresOn) {
        deadlines.push({
          id: `expires:${item.id}`,
          kind: 'equipment-expires',
          title: { de: 'Gerät läuft ab (aussondern)', en: 'Item expires (retire)' },
          subject: { type: 'equipment.item', id: item.id, label: `${item.inventoryNumber} ${item.name}` },
          dueOn: item.expiresOn,
          leadDays: 60,
          departmentIds: [item.departmentId],
          permission: WRITE,
          group: group(item.categoryKey, item.vehicleId),
        });
      }
    }
    for (const defect of await em.find(DefectEntity, { status: 'reported' }, { populate: ['item'] })) {
      deadlines.push({
        id: `defect:${defect.id}`,
        kind: 'equipment-defect',
        title: { de: 'Mangel bearbeiten', en: 'Handle defect' },
        subject: { type: 'equipment.item', id: defect.item.id, label: `${defect.item.inventoryNumber} ${defect.item.name}: ${defect.description}` },
        dueOn: berlinDate(defect.reportedAt),
        leadDays: 0,
        departmentIds: [defect.item.departmentId],
        permission: WRITE,
      });
    }
    return deadlines;
  }

  async search(user: AuthenticatedUser, query: string): Promise<SearchHit[]> {
    const visible = this.items.visible(user);
    if (!visible) return [];
    const words = wordsWhere(query, ['name', 'inventoryNumber', 'serialNumber', 'barcode']);
    const found = await this.em.fork().find(EquipmentItemEntity, { $and: [visible, { $or: [...(words ? [words] : []), { rfid: { $ilike: `%${normalizeRfid(query) || query}%` } }] }] } as never, { limit: 6 });
    return found.map((i) => this.hit(i));
  }

  /** Scanned code: label URL of f.orga, barcode, RFID chip, inventory or serial number (exact, ignoring case). */
  async code(user: AuthenticatedUser, code: string): Promise<SearchHit[]> {
    const visible = this.items.visible(user);
    if (!visible) return [];
    const label = /\/equipment\/items\/([0-9a-f-]{36})/i.exec(code);
    const exact = code.replace(/[\\%_]/g, '\\$&');
    const where = label
      ? { id: label[1].toLowerCase() }
      : { $or: [{ barcode: { $ilike: exact } }, { rfid: normalizeRfid(code) }, { inventoryNumber: { $ilike: exact } }, { serialNumber: { $ilike: exact } }] };
    const found = await this.em.fork().find(EquipmentItemEntity, { $and: [visible, where] } as never, { limit: 20, orderBy: { inventoryNumber: 'asc' } });
    return found.map((i) => this.hit(i));
  }

  private hit(i: EquipmentItemEntity): SearchHit {
    return { id: i.id, group: { de: 'Geräte', en: 'Equipment' }, title: `${i.inventoryNumber} ${i.name}`, description: i.serialNumber, to: `/equipment/items/${i.id}` };
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
}
