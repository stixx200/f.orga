import type { EntityManager } from '@mikro-orm/core';
import type { AuditReferenceRegistry } from '@forga/core-api';
import { SessionEntity } from '../training.entities.js';

const day = (date: Date, locale: string) => date.toLocaleDateString(locale, { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });

/** Training sessions in audit entries: title and day. */
export function registerAuditReferences(registry: AuditReferenceRegistry, em: EntityManager): void {
  registry.register('training.session', {
    keys: ['sessionId'],
    resolve: async (ids, user) => {
      const sessions = await em.fork().find(SessionEntity, { id: { $in: [...ids] } }, { fields: ['id', 'title', 'startsAt'] });
      return new Map(
        sessions.map((s) => [
          s.id,
          { label: { de: `${s.title} (${day(s.startsAt, 'de-DE')})`, en: `${s.title} (${day(s.startsAt, 'en-GB')})` }, to: user.can('training.read') ? `/training/sessions/${s.id}` : undefined },
        ]),
      );
    },
  });
}
