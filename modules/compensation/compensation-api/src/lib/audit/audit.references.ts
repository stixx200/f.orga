import type { EntityManager } from '@mikro-orm/core';
import type { AuditReferenceRegistry } from '@forga/core-api';
import { RunEntity } from '../compensation.entities.js';

/** Payout runs in audit entries: their number. */
export function registerAuditReferences(registry: AuditReferenceRegistry, em: EntityManager): void {
  registry.register('compensation.run', {
    keys: ['runId'],
    actions: ['compensation.'],
    resolve: async (ids, user) => {
      const runs = await em.fork().find(RunEntity, { id: { $in: [...ids] } }, { fields: ['id', 'number'] });
      return new Map(runs.map((r) => [r.id, { label: r.number, to: user.can('compensation.runs.read') ? `/compensation/runs/${r.id}` : undefined }]));
    },
  });
}
