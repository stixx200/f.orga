import type { EntityManager } from '@mikro-orm/core';
import type { AuditReferenceRegistry } from '@forga/core-api';
import { INFO_TERMINAL_READ } from '@forga/info-terminal-contracts';
import { TerminalEntity } from '../info-terminal.entities.js';

/** Info terminals in audit entries: their name. */
export function registerAuditReferences(registry: AuditReferenceRegistry, em: EntityManager): void {
  registry.register('info-terminal.terminal', {
    keys: ['terminalId'],
    resolve: async (ids, user) => {
      const terminals = await em.fork().find(TerminalEntity, { id: { $in: [...ids] } }, { fields: ['id', 'name'] });
      const to = user.can(INFO_TERMINAL_READ) ? '/info-terminal/terminals' : undefined;
      return new Map(terminals.map((t) => [t.id, { label: t.name, to }]));
    },
  });
}
