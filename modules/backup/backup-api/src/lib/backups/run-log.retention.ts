import { Injectable } from '@nestjs/common';
import { EntityManager, type FilterQuery, wrap } from '@mikro-orm/core';
import type { RetentionQuery, RetentionRegistry } from '@forga/core-api';
import { BackupRestore, BackupRun } from '../backup.entities.js';

export const RUN_LOG_RETENTION = 'backup.run-log';

const day = (date: Date) => date.toISOString().slice(0, 10);
/** Restores are prefixed, so one list of cases holds both kinds of records. */
const RESTORE = 'restore:';

/**
 * Retention of the protocol of the backup module (L29): records of deleted and failed backups and of finished restores,
 * with the user who started them. Records of existing backup files stay: they are the index of the target folder.
 */
@Injectable()
export class RunLogRetention {
  constructor(private readonly em: EntityManager) {}

  private runs(query: Pick<RetentionQuery, 'cutoff'>): FilterQuery<BackupRun> {
    return { $or: [{ status: 'deleted', deletedAt: { $lt: query.cutoff } }, { status: 'failed', startedAt: { $lt: query.cutoff } }] };
  }

  private restores(query: Pick<RetentionQuery, 'cutoff'>): FilterQuery<BackupRestore> {
    return { finishedAt: { $ne: null, $lt: query.cutoff } };
  }

  register(registry: RetentionRegistry): void {
    registry.registerCategory({
      key: RUN_LOG_RETENTION,
      module: 'backup',
      name: { de: 'Protokoll der Datensicherung', en: 'Protocol of the backup' },
      description: {
        de: 'Einträge gelöschter und fehlgeschlagener Sicherungen und abgeschlossener Wiederherstellungen mit dem auslösenden Benutzer; Einträge vorhandener Sicherungen bleiben',
        en: 'Records of deleted and failed backups and of finished restores with the user who started them; records of existing backups stay',
      },
      event: { de: 'Löschung bzw. Ende', en: 'Deletion or end' },
      actions: ['delete'],
      defaultRule: { years: 1, action: 'delete' },
      candidates: async (query) => {
        const em = this.em.fork();
        const runs = await em.find(BackupRun, this.runs(query), { orderBy: { startedAt: 'asc' } });
        const restores = await em.find(BackupRestore, this.restores(query), { orderBy: { startedAt: 'asc' } });
        return [
          ...runs.map((r) => ({ id: r.id, label: r.fileName ?? day(r.startedAt), neutralLabel: day(r.startedAt), eventDate: day(r.deletedAt ?? r.startedAt) })),
          ...restores.map((r) => ({ id: `${RESTORE}${r.id}`, label: r.fileName, neutralLabel: day(r.startedAt), eventDate: day(r.finishedAt ?? r.startedAt) })),
        ];
      },
      export: async (ids) => {
        const em = this.em.fork();
        const { runs, restores } = this.split(ids);
        return [
          ...(await em.find(BackupRun, { id: { $in: runs } })).map((r) => ({ id: r.id, title: r.fileName ?? day(r.startedAt), fields: [{ label: { de: 'Gestartet', en: 'Started' }, value: r.startedAt.toISOString() }], data: wrap(r).toObject(), attachments: [] })),
          ...(await em.find(BackupRestore, { id: { $in: restores } })).map((r) => ({ id: `${RESTORE}${r.id}`, title: r.fileName, fields: [{ label: { de: 'Gestartet', en: 'Started' }, value: r.startedAt.toISOString() }], data: wrap(r).toObject(), attachments: [] })),
        ];
      },
      execute: async (ids) => {
        const em = this.em.fork();
        const { runs, restores } = this.split(ids);
        // Only records that are still due: a backup restored meanwhile is no longer "deleted".
        return (
          (runs.length ? await em.nativeDelete(BackupRun, { id: { $in: runs }, status: { $in: ['deleted', 'failed'] } }) : 0) +
          (restores.length ? await em.nativeDelete(BackupRestore, { id: { $in: restores }, finishedAt: { $ne: null } }) : 0)
        );
      },
      bulk: {
        count: async (query) => (await this.em.fork().count(BackupRun, this.runs(query))) + (await this.em.fork().count(BackupRestore, this.restores(query))),
        run: async (query) => (await this.em.fork().nativeDelete(BackupRun, this.runs(query))) + (await this.em.fork().nativeDelete(BackupRestore, this.restores(query))),
      },
    });
  }

  private split(ids: readonly string[]): { runs: string[]; restores: string[] } {
    return { runs: ids.filter((id) => !id.startsWith(RESTORE)), restores: ids.filter((id) => id.startsWith(RESTORE)).map((id) => id.slice(RESTORE.length)) };
  }
}
