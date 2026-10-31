import { Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { ANONYMIZED_NAME, Attachments, type ErasureArea, type ErasureAreaInput, type ErasureContext, HistoryEntry, type RetentionCandidate, type RetentionExportRecord, type RetentionQuery, RetentionRegistry, User } from '@forga/core-api';
import { DefectEntity, EquipmentItemEntity, InspectionEntity, UsageEntity } from '../equipment.entities.js';
import { equipmentGroupKey } from '../items/item-group.js';

const cutoffDay = (query: RetentionQuery) => query.cutoff.toISOString().slice(0, 10);

/** Retention of retired equipment with inspections, defects and their attachments; usage in reports and sessions follows those. */
@Injectable()
export class EquipmentRetention {
  constructor(
    private readonly em: EntityManager,
    private readonly attachments: Attachments,
  ) {}

  register(registry: RetentionRegistry): void {
    registry.registerCategory({
      key: 'equipment.retired',
      module: 'equipment',
      name: { de: 'Ausgesonderte Geräte', en: 'Retired equipment' },
      description: { de: 'mit Prüfungen, Mängeln und Anhängen; Freiwillige Feuerwehr (Zuordnung mit dem Hauptamt klären)', en: 'with inspections, defects and attachments; volunteer fire brigade (assignment to be agreed with the municipality)' },
      event: { de: 'Aussonderung', en: 'Retirement' },
      actions: ['offer-archive', 'delete', 'none'],
      candidates: (query) => this.candidates(query),
      export: (ids) => this.export(ids),
      execute: (ids) => this.delete(ids),
    });
    // Equipment used in a report or session: the usage goes with the report or session.
    const usage = { execute: async (records: readonly { id: string; children: string[] }[], action: string) => {
      if (action !== 'delete') return;
      const ids = records.flatMap((r) => [r.id, ...r.children]);
      if (ids.length) await this.em.fork().nativeDelete(UsageEntity, { reportId: { $in: ids } });
    } };
    registry.registerDependent('incidents.incidents', 'equipment', usage);
    registry.registerDependent('training.sessions', 'equipment', usage);
  }

  private async candidates(query: RetentionQuery): Promise<RetentionCandidate[]> {
    const em = this.em.fork();
    const items = (await em.find(EquipmentItemEntity, { status: 'retired' }, { orderBy: { inventoryNumber: 'asc' } })).filter((i) => i.retirement?.date && i.retirement.date < cutoffDay(query));
    const owners = await this.owners(em, items.map((i) => i.id));
    return items.map((i) => ({
      id: i.id,
      label: `${i.inventoryNumber} · ${i.name}`,
      neutralLabel: `${i.inventoryNumber} · ${i.name}`,
      eventDate: i.retirement!.date,
      attachments: owners.counts.get(i.id) ?? 0,
    }));
  }

  /** Inspections and defects of the items, with the number of their attachments per item. */
  private async owners(em: EntityManager, itemIds: string[]) {
    const inspections = await em.find(InspectionEntity, { item: { $in: itemIds } }, { fields: ['id', 'item'] });
    const defects = await em.find(DefectEntity, { item: { $in: itemIds } }, { fields: ['id', 'item'] });
    const items = await em.find(EquipmentItemEntity, { id: { $in: itemIds } }, { fields: ['id', 'categoryKey', 'typeKey', 'name'] });
    const groupOf = new Map(items.map((item) => [item.id, equipmentGroupKey(item)]));
    const [a, b, photos, documents] = await Promise.all([
      this.attachments.count('equipment.inspection', inspections.map((i) => i.id)),
      this.attachments.count('equipment.defect', defects.map((d) => d.id)),
      this.attachments.count('equipment.item', [...new Set(groupOf.values())]),
      this.attachments.count('equipment.item-document', [...new Set(groupOf.values())]),
    ]);
    const counts = new Map<string, number>();
    for (const [id, key] of groupOf) counts.set(id, (photos.get(key) ?? 0) + (documents.get(key) ?? 0));
    for (const i of inspections) counts.set(i.item.id, (counts.get(i.item.id) ?? 0) + (a.get(i.id) ?? 0));
    for (const d of defects) counts.set(d.item.id, (counts.get(d.item.id) ?? 0) + (b.get(d.id) ?? 0));
    return { inspections, defects, counts };
  }

  private async export(ids: readonly string[]): Promise<RetentionExportRecord[]> {
    const em = this.em.fork();
    const items = await em.find(EquipmentItemEntity, { id: { $in: [...ids] } });
    const inspections = await em.find(InspectionEntity, { item: { $in: [...ids] } }, { orderBy: { date: 'asc' } });
    const defects = await em.find(DefectEntity, { item: { $in: [...ids] } }, { orderBy: { reportedAt: 'asc' } });
    return items.map((i) => {
      const own = inspections.filter((x) => x.item.id === i.id);
      const found = defects.filter((d) => d.item.id === i.id);
      return {
        id: i.id,
        title: `${i.inventoryNumber} · ${i.name}`,
        fields: [
          { label: { de: 'Inventarnummer', en: 'Inventory number' }, value: i.inventoryNumber },
          { label: { de: 'Bezeichnung', en: 'Name' }, value: i.name },
          { label: { de: 'Hersteller', en: 'Manufacturer' }, value: i.manufacturer },
          { label: { de: 'Seriennummer', en: 'Serial number' }, value: i.serialNumber },
          { label: { de: 'Ausgesondert', en: 'Retired' }, value: i.retirement ? `${i.retirement.date} ${i.retirement.reason}`.trim() : '' },
          { label: { de: 'Prüfungen', en: 'Inspections' }, value: String(own.length) },
          { label: { de: 'Mängel', en: 'Defects' }, value: String(found.length) },
        ],
        data: { item: wrap(i).toObject(), inspections: own.map((x) => ({ ...wrap(x).toObject(), item: i.id })), defects: found.map((d) => ({ ...wrap(d).toObject(), item: i.id })) },
        attachments: [{ ownerType: 'equipment.item', ownerId: equipmentGroupKey(i) }, { ownerType: 'equipment.item-document', ownerId: equipmentGroupKey(i) }, ...own.map((x) => ({ ownerType: 'equipment.inspection', ownerId: x.id })), ...found.map((d) => ({ ownerType: 'equipment.defect', ownerId: d.id }))],
      };
    });
  }

  private async delete(ids: readonly string[]): Promise<number> {
    const em = this.em.fork();
    const { inspections, defects } = await this.owners(em, [...ids]);
    const going = await em.find(EquipmentItemEntity, { id: { $in: [...ids] } }, { fields: ['categoryKey', 'typeKey', 'name'] });
    const staying = await em.find(EquipmentItemEntity, { id: { $nin: [...ids] } }, { fields: ['categoryKey', 'typeKey', 'name'] });
    const kept = new Set(staying.map((item) => equipmentGroupKey(item)));
    const orphaned = [...new Set(going.map((item) => equipmentGroupKey(item)))].filter((key) => !kept.has(key));
    await this.attachments.removeFor('equipment.item', orphaned);
    await this.attachments.removeFor('equipment.item-document', orphaned);
    await this.attachments.removeFor('equipment.inspection', inspections.map((i) => i.id));
    await this.attachments.removeFor('equipment.defect', defects.map((d) => d.id));
    await em.nativeDelete(HistoryEntry, { $or: [{ entity: 'equipment.item', entityId: { $in: [...ids] } }, { parentEntity: 'equipment.item', parentId: { $in: [...ids] } }] });
    // Inspections, defects and usage go with the item (foreign keys with cascade).
    return em.nativeDelete(EquipmentItemEntity, { id: { $in: [...ids] }, status: 'retired' });
  }

  /**
   * Anonymised persons: defects they reported keep the defect, not the name of the reporter (the linked user account is
   * anonymised by the core).
   */
  async anonymize(personIds: readonly string[]): Promise<void> {
    const em = this.em.fork();
    const defects = await this.reportedDefects(em, personIds);
    if (!defects.length) return;
    await em.nativeUpdate(DefectEntity, { id: { $in: defects } }, { reportedBy: ANONYMIZED_NAME });
    await em.nativeDelete(HistoryEntry, { entity: 'equipment.defect', entityId: { $in: defects } });
  }

  private async reportedDefects(em: EntityManager, personIds: readonly string[]): Promise<string[]> {
    const users = await em.find(User, { personId: { $in: [...personIds] } }, { fields: ['id'] });
    if (!users.length) return [];
    return (await em.find(DefectEntity, { reportedByUserId: { $in: users.map((u) => u.id) } }, { fields: ['id'] })).map((d) => d.id);
  }

  /**
   * Erasure check: reported defects stay without the name of the reporter; inspections the person performed are the
   * proof of the inspection and stay with the item, after its retirement for the period of retired equipment.
   */
  async erasure(personId: string, ctx: ErasureContext): Promise<ErasureAreaInput[]> {
    const em = this.em.fork();
    const areas: ErasureAreaInput[] = [];
    const defects = await this.reportedDefects(em, [personId]);
    if (defects.length) {
      areas.push({
        key: 'equipment.defects',
        title: { de: 'Geräte', en: 'Equipment' },
        data: { de: `${defects.length} ${defects.length === 1 ? 'gemeldeter Mangel' : 'gemeldete Mängel'}`, en: `${defects.length} reported ${defects.length === 1 ? 'defect' : 'defects'}` },
        count: defects.length,
        outcome: 'anonymize',
        keepUntil: null,
        reason: { de: 'Mangel bleibt, Meldender „N. N.“', en: 'Defect stays, reporter "N. N."' },
      });
    }
    const inspections = await em.find(InspectionEntity, { inspectorPersonId: personId }, { populate: ['item'] });
    if (inspections.length) {
      const items = [...new Map(inspections.map((i) => [i.item.id, i.item])).values()];
      const holds = items.map((item) => ctx.retain('equipment.retired', item.status === 'retired' ? (item.retirement?.date ?? null) : null));
      const kept = holds.filter((h) => h !== null);
      const hold = kept.find((h) => h.until === null) ?? kept.toSorted((a, b) => (a.until! < b.until! ? 1 : -1))[0];
      areas.push({
        key: 'equipment.inspections',
        title: { de: 'Geräte', en: 'Equipment' },
        data: { de: `${inspections.length} ${inspections.length === 1 ? 'durchgeführte Prüfung' : 'durchgeführte Prüfungen'}`, en: `${inspections.length} ${inspections.length === 1 ? 'inspection' : 'inspections'} performed` },
        count: inspections.length,
        outcome: hold ? 'keep' : 'anonymize',
        keepUntil: hold?.until ?? null,
        reason: hold
          ? { de: `Prüfnachweis des Geräts; ${hold.reason.de}`, en: `Proof of inspection of the item; ${hold.reason.en}` }
          : { de: 'Prüfung bleibt ohne Prüfer', en: 'Inspection stays without inspector' },
      });
    }
    return areas;
  }

  async erase(personId: string, areas: readonly ErasureArea[]): Promise<void> {
    const keys = new Set(areas.map((a) => a.key));
    if (keys.has('equipment.defects')) await this.anonymize([personId]);
    if (keys.has('equipment.inspections')) {
      const em = this.em.fork();
      const inspections = await em.find(InspectionEntity, { inspectorPersonId: personId }, { fields: ['id'] });
      if (!inspections.length) return;
      await em.nativeUpdate(InspectionEntity, { inspectorPersonId: personId }, { inspectorPersonId: null });
      await em.nativeDelete(HistoryEntry, { entity: 'equipment.inspection', entityId: { $in: inspections.map((i) => i.id) } });
    }
  }
}
