import type { EntityManager } from '@mikro-orm/core';
import type { AuditReferenceRegistry } from '@forga/core-api';
import { BACKUP_MANAGE } from '@forga/backup-contracts';
import { BackupRun } from '../backup.entities.js';

/** Backups in audit entries: their file name (or the start time of a failed one). */
export function registerAuditReferences(registry: AuditReferenceRegistry, em: EntityManager): void {
  registry.register('backup.run', {
    keys: ['backupId'],
    resolve: async (ids, user) => {
      const runs = await em.fork().find(BackupRun, { id: { $in: [...ids] } }, { fields: ['id', 'fileName', 'startedAt'] });
      const to = user.can(BACKUP_MANAGE) ? '/backup/backups' : undefined;
      return new Map(runs.map((run) => [run.id, { label: run.fileName ?? run.startedAt.toISOString(), to }]));
    },
  });
}
