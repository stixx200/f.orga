import type { EntityManager } from '@mikro-orm/core';
import type { AuditReferenceRegistry } from '@forga/core-api';
import { NoticeEntity } from '../cost-recovery.entities.js';

/** Notices in audit entries: their number. */
export function registerAuditReferences(registry: AuditReferenceRegistry, em: EntityManager): void {
  registry.register('cost-recovery.notice', {
    keys: ['noticeId'],
    resolve: async (ids, user) => {
      const notices = await em.fork().find(NoticeEntity, { id: { $in: [...ids] } }, { fields: ['id', 'number', 'dispatchNumber'] });
      return new Map(
        notices.map((n) => [n.id, { label: n.number || n.dispatchNumber, to: user.can('cost-recovery.read') ? `/cost-recovery/notices/${n.id}` : undefined }]),
      );
    },
  });
}
