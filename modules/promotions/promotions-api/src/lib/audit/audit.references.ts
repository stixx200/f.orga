import type { EntityManager } from '@mikro-orm/core';
import type { AuditReferenceRegistry } from '@forga/core-api';
import { PromotionListEntity } from '../promotions.entities.js';

/** Promotion lists in audit entries: their title. */
export function registerAuditReferences(registry: AuditReferenceRegistry, em: EntityManager): void {
  registry.register('promotions.list', {
    keys: ['listId'],
    actions: ['promotions.'],
    resolve: async (ids, user) => {
      const lists = await em.fork().find(PromotionListEntity, { id: { $in: [...ids] } }, { fields: ['id', 'title'] });
      return new Map(lists.map((l) => [l.id, { label: l.title, to: user.can('promotions.read') ? `/promotions/lists/${l.id}` : undefined }]));
    },
  });
}
