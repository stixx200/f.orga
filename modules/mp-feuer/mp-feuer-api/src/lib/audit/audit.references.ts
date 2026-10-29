import type { EntityManager } from '@mikro-orm/core';
import type { AuditReferenceRegistry } from '@forga/core-api';
import { MP_FEUER_READ } from '@forga/mp-feuer-contracts';
import { MpFeuerRunEntity } from '../mp-feuer.entities.js';

const time = (date: Date, locale: string) =>
  date.toLocaleString(locale, { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Data transfers in audit entries: when they were started. */
export function registerAuditReferences(registry: AuditReferenceRegistry, em: EntityManager): void {
  registry.register('mp-feuer.run', {
    keys: ['runId'],
    // `imports.applied` names the transfer in its source (`{ module: 'mp-feuer', runId }`).
    actions: ['mp-feuer.', 'imports.applied'],
    resolve: async (ids, user) => {
      const runs = await em.fork().find(MpFeuerRunEntity, { id: { $in: [...ids] } }, { fields: ['id', 'createdAt'] });
      return new Map(
        runs.map((r) => [
          r.id,
          {
            label: { de: `Übertragung vom ${time(r.createdAt, 'de-DE')}`, en: `Transfer of ${time(r.createdAt, 'en-GB')}` },
            to: user.can(MP_FEUER_READ) ? `/mp-feuer/runs/${r.id}` : undefined,
          },
        ]),
      );
    },
  });
}
