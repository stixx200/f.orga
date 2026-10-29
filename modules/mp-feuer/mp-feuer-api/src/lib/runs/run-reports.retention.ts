import { Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { HistoryEntry, type RetentionQuery, RetentionRegistry } from '@forga/core-api';
import { RUNNING } from '@forga/mp-feuer-contracts';
import { MpFeuerRunDatasetEntity, MpFeuerRunEntity } from '../mp-feuer.entities.js';

export const RUN_REPORTS_RETENTION = 'mp-feuer.run-reports';

const day = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Retention of the run reports of the data transfers (L29): runs with their counts and the rows with messages, which
 * name persons from MP-Feuer. The rows read from the transfer files go after 7 days anyway (`mp-feuer.rows`).
 */
@Injectable()
export class RunReportsRetention {
  constructor(private readonly em: EntityManager) {}

  private due(query: Pick<RetentionQuery, 'cutoff'>) {
    // The period runs from the end of the run; runs that never ended count from their start.
    return { status: { $nin: [...RUNNING] }, $or: [{ finishedAt: { $lt: query.cutoff } }, { finishedAt: null, createdAt: { $lt: query.cutoff } }] };
  }

  register(registry: RetentionRegistry): void {
    registry.registerCategory({
      key: RUN_REPORTS_RETENTION,
      module: 'mp-feuer',
      name: { de: 'Laufberichte der Datenübernahme aus MP-Feuer', en: 'Run reports of the data transfer from MP-Feuer' },
      description: {
        de: 'Läufe mit Zählern und den Zeilen mit Meldungen (mit Namen aus MP-Feuer); die gelesenen Zeilen gehen schon nach 7 Tagen',
        en: 'Runs with counts and the rows with messages (with names from MP-Feuer); the rows read go after 7 days already',
      },
      event: { de: 'Ende des Laufs', en: 'End of the run' },
      actions: ['delete', 'none'],
      defaultRule: { years: 1, action: 'delete' },
      candidates: async (query) =>
        (await this.em.fork().find(MpFeuerRunEntity, this.due(query), { orderBy: { createdAt: 'asc' } })).map((r) => ({
          id: r.id,
          label: `${day(r.createdAt)} · ${r.files.length}`,
          neutralLabel: day(r.createdAt),
          eventDate: day(r.finishedAt ?? r.createdAt),
        })),
      export: async (ids) => {
        const em = this.em.fork();
        const runs = await em.find(MpFeuerRunEntity, { id: { $in: [...ids] } });
        return Promise.all(
          runs.map(async (r) => ({
            id: r.id,
            title: day(r.createdAt),
            fields: [
              { label: { de: 'Gestartet', en: 'Started' }, value: r.createdAt.toISOString() },
              { label: { de: 'Stand', en: 'State' }, value: r.status },
            ],
            data: { run: wrap(r).toObject(), datasets: (await em.find(MpFeuerRunDatasetEntity, { run: r.id }, { populate: ['results'] })).map((d) => ({ ...wrap(d).toObject(), rows: undefined })) },
            attachments: [],
          })),
        );
      },
      execute: (ids) => this.delete(ids),
      bulk: {
        count: (query) => this.em.fork().count(MpFeuerRunEntity, this.due(query)),
        run: async (query) => this.delete((await this.em.fork().find(MpFeuerRunEntity, this.due(query), { fields: ['id'] })).map((r) => r.id)),
      },
    });
  }

  /** Runs with their datasets (foreign key with cascade) and their history. */
  private async delete(ids: readonly string[]): Promise<number> {
    if (!ids.length) return 0;
    const em = this.em.fork();
    await em.nativeDelete(HistoryEntry, { entity: 'mp_feuer.run', entityId: { $in: [...ids] } });
    return em.nativeDelete(MpFeuerRunEntity, { id: { $in: [...ids] }, status: { $nin: [...RUNNING] } });
  }
}
