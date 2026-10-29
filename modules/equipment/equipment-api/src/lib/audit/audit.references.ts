import type { EntityManager } from '@mikro-orm/core';
import type { AuditReferenceRegistry } from '@forga/core-api';
import { DefectEntity, EquipmentItemEntity } from '../equipment.entities.js';

const READ = 'equipment.read';

/** Items („Inventarnummer Name“) and their defects in audit entries. */
export function registerAuditReferences(registry: AuditReferenceRegistry, em: EntityManager): void {
  registry.register('equipment.item', {
    keys: ['itemId'],
    resolve: async (ids, user) => {
      const items = await em.fork().find(EquipmentItemEntity, { id: { $in: [...ids] } }, { fields: ['id', 'inventoryNumber', 'name'] });
      return new Map(items.map((i) => [i.id, { label: `${i.inventoryNumber} ${i.name}`, to: user.can(READ) ? `/equipment/items/${i.id}` : undefined }]));
    },
  });
  registry.register('equipment.defect', {
    keys: ['defectId'],
    resolve: async (ids, user) => {
      const defects = await em.fork().find(DefectEntity, { id: { $in: [...ids] } }, { populate: ['item'] });
      return new Map(
        defects.map((d) => {
          const item = `${d.item.inventoryNumber} ${d.item.name}`;
          return [d.id, { label: { de: `Mangel an ${item}`, en: `Defect of ${item}` }, to: user.can(READ) ? `/equipment/items/${d.item.id}?tab=defects` : undefined }];
        }),
      );
    },
  });
}
