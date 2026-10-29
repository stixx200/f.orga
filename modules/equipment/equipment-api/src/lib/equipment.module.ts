import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Attachments, AuditReferenceRegistry, CodeRegistry, DeadlineRegistry, defineModule, ExportRegistry, HistoryAccessRegistry, ImportRegistry, ListRegistry, PersonDataRegistry, RetentionRegistry, SearchRegistry } from '@forga/core-api';
import { EQUIPMENT_MANIFEST, EQUIPMENT_SETTINGS, EQUIPMENT_USAGE } from '@forga/equipment-contracts';
import { CATALOG_REFERENCES, type CatalogReferences, ORGANIZATION_REFERENCES, type OrganizationReferences } from '@forga/masterdata-contracts';
import { EQUIPMENT_MIGRATIONS } from '../migrations/index.js';
import { registerAuditReferences } from './audit/audit.references.js';
import { CatalogController } from './catalog/catalog.controller.js';
import { EquipmentData } from './data/equipment.data.js';
import { EquipmentRetention } from './data/equipment.retention.js';
import { CategoryEntity, DefectEntity, EquipmentItemEntity, EquipmentTypeEntity, InspectionEntity, UsageEntity } from './equipment.entities.js';
import { InventoryImport } from './imports/inventory.import.js';
import { ItemsController } from './items/items.controller.js';
import { INSPECTOR_QUALIFICATIONS, ItemsService, READ } from './items/items.service.js';
import { EquipmentLists } from './lists/equipment.lists.js';

/** Global, so other modules can inject `EQUIPMENT_USAGE` (consumables of an incident report). */
@Global()
@Module({
  controllers: [CatalogController, ItemsController],
  providers: [ItemsService, EquipmentLists, EquipmentData, EquipmentRetention, InventoryImport, { provide: EQUIPMENT_USAGE, useExisting: ItemsService }],
  exports: [EQUIPMENT_USAGE],
})
export class EquipmentModule implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly lists: ListRegistry,
    private readonly moduleLists: EquipmentLists,
    private readonly deadlines: DeadlineRegistry,
    private readonly search: SearchRegistry,
    private readonly codes: CodeRegistry,
    private readonly exports: ExportRegistry,
    private readonly imports: ImportRegistry,
    private readonly historyAccess: HistoryAccessRegistry,
    private readonly data: EquipmentData,
    private readonly inventory: InventoryImport,
    private readonly attachments: Attachments,
    private readonly items: ItemsService,
    @Inject(ORGANIZATION_REFERENCES) private readonly references: OrganizationReferences,
    @Inject(CATALOG_REFERENCES) private readonly catalogReferences: CatalogReferences,
    private readonly auditReferences: AuditReferenceRegistry,
    private readonly retention: RetentionRegistry,
    private readonly retentionCategory: EquipmentRetention,
    private readonly personData: PersonDataRegistry,
  ) {}

  onModuleInit(): void {
    registerAuditReferences(this.auditReferences, this.em);
    for (const definition of this.moduleLists.definitions()) this.lists.register('equipment', definition);
    this.deadlines.register(this.data);
    this.search.register('equipment', (user, query) => this.data.search(user, query));
    this.codes.register('equipment', (user, code) => this.data.code(user, code));
    this.exports.register('equipment', {
      all: () => this.data.exportAll(),
      person: (id) => this.data.exportPerson(id),
      describePerson: (id, ctx) => this.data.describePerson(id, ctx),
    });
    this.imports.register('equipment', this.inventory.profile());
    this.retentionCategory.register(this.retention);
    this.personData.register('equipment', { anonymize: (ids) => this.retentionCategory.anonymize(ids) });
    // Inspections by a competent person are checked against these qualifications.
    for (const key of Object.values(INSPECTOR_QUALIFICATIONS)) this.catalogReferences.require('equipment', 'qualification', key);
    this.historyAccess.register('equipment.item', async (user, id) => {
      const item = await this.em.fork().findOne(EquipmentItemEntity, id);
      return { allowed: Boolean(item) && user.can(READ, item!.departmentId) };
    });
    this.historyAccess.registerPermission('equipment.category', 'equipment.settings.manage');
    // Protocols and photos of inspections: like the inspection itself.
    const inspection = (id: string) => this.em.fork().findOne(InspectionEntity, id, { populate: ['item'] });
    const breathing = async (categoryKey: string) => (await this.items.breathingCategories()).has(categoryKey);
    this.attachments.register('equipment.inspection', {
      read: async (user, id) => {
        const i = await inspection(id);
        return Boolean(i) && user.can(READ, i!.item.departmentId);
      },
      write: async (user, id) => {
        const i = await inspection(id);
        return Boolean(i) && this.items.may(user, 'inspect', i!.item, await breathing(i!.item.categoryKey));
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
        return Boolean(d) && (this.items.may(user, 'write', d!.item, await breathing(d!.item.categoryKey)) || (d!.reportedByUserId === user.id && d!.status === 'reported'));
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
  settings: EQUIPMENT_SETTINGS,
});
