import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Attachments, DeadlineRegistry, defineModule, ExportRegistry, HistoryAccessRegistry, ImportRegistry, ListRegistry, SearchRegistry } from '@forga/core-api';
import { EQUIPMENT_MANIFEST, EQUIPMENT_USAGE } from '@forga/equipment-contracts';
import { ORGANIZATION_REFERENCES, type OrganizationReferences } from '@forga/masterdata-contracts';
import { EQUIPMENT_MIGRATIONS } from '../migrations/index.js';
import { CatalogController } from './catalog/catalog.controller.js';
import { EquipmentData } from './data/equipment.data.js';
import { CategoryEntity, DefectEntity, EquipmentItemEntity, EquipmentTypeEntity, InspectionEntity, UsageEntity } from './equipment.entities.js';
import { InventoryImport } from './imports/inventory.import.js';
import { ItemsController } from './items/items.controller.js';
import { INSPECT, ItemsService, READ, WRITE } from './items/items.service.js';
import { EquipmentLists } from './lists/equipment.lists.js';

/** Global, so other modules can inject `EQUIPMENT_USAGE` (consumables of an incident report). */
@Global()
@Module({
  controllers: [CatalogController, ItemsController],
  providers: [ItemsService, EquipmentLists, EquipmentData, InventoryImport, { provide: EQUIPMENT_USAGE, useExisting: ItemsService }],
  exports: [EQUIPMENT_USAGE],
})
export class EquipmentModule implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly lists: ListRegistry,
    private readonly moduleLists: EquipmentLists,
    private readonly deadlines: DeadlineRegistry,
    private readonly search: SearchRegistry,
    private readonly exports: ExportRegistry,
    private readonly imports: ImportRegistry,
    private readonly historyAccess: HistoryAccessRegistry,
    private readonly data: EquipmentData,
    private readonly inventory: InventoryImport,
    private readonly attachments: Attachments,
    @Inject(ORGANIZATION_REFERENCES) private readonly references: OrganizationReferences,
  ) {}

  onModuleInit(): void {
    for (const definition of this.moduleLists.definitions()) this.lists.register('equipment', definition);
    this.deadlines.register(this.data);
    this.search.register('equipment', (user, query) => this.data.search(user, query));
    this.exports.register('equipment', { all: () => this.data.exportAll() });
    this.imports.register('equipment', this.inventory.profile());
    this.historyAccess.register('equipment.item', async (user, id) => {
      const item = await this.em.fork().findOne(EquipmentItemEntity, id);
      return { allowed: Boolean(item) && user.can(READ, item!.departmentId) };
    });
    this.historyAccess.registerPermission('equipment.category', 'equipment.settings.manage');
    // Protocols and photos of inspections: like the inspection itself.
    const inspection = (id: string) => this.em.fork().findOne(InspectionEntity, id, { populate: ['item'] });
    this.attachments.register('equipment.inspection', {
      read: async (user, id) => {
        const i = await inspection(id);
        return Boolean(i) && user.can(READ, i!.item.departmentId);
      },
      write: async (user, id) => {
        const i = await inspection(id);
        return Boolean(i) && user.can(INSPECT, i!.item.departmentId);
      },
    });
    // Photos of defects: the reporter adds them while the defect is open, the equipment officer always.
    const defect = (id: string) => this.em.fork().findOne(DefectEntity, id, { populate: ['item'] });
    this.attachments.register('equipment.defect', {
      read: async (user, id) => {
        const d = await defect(id);
        return Boolean(d) && (user.can(READ, d!.item.departmentId) || d!.reportedByUserId === user.id);
      },
      write: async (user, id) => {
        const d = await defect(id);
        return Boolean(d) && (user.can(WRITE, d!.item.departmentId) || (d!.reportedByUserId === user.id && d!.status === 'reported'));
      },
    });
    this.historyAccess.registerPermission('equipment.equipment_type', 'equipment.settings.manage');
    // Departments, stations and vehicles with equipment cannot be deleted.
    this.references.register('equipment', (kind, id) => {
      const where = kind === 'department' ? { departmentId: id } : kind === 'station' ? { stationId: id } : { $or: [{ vehicleId: id }, { forVehicleId: id }] };
      return this.em.fork().count(EquipmentItemEntity, { ...where, status: { $ne: 'retired' } });
    });
  }
}

export const equipmentModule = defineModule({
  manifest: EQUIPMENT_MANIFEST,
  nestModule: EquipmentModule,
  entities: [CategoryEntity, EquipmentTypeEntity, EquipmentItemEntity, InspectionEntity, DefectEntity, UsageEntity],
  historized: [CategoryEntity, EquipmentTypeEntity, EquipmentItemEntity, { entity: InspectionEntity, parent: 'item' }, { entity: DefectEntity, parent: 'item' }],
  migrations: EQUIPMENT_MIGRATIONS,
});
