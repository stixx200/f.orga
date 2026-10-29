import { Injectable, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { PrivacySettings } from '@forga/core-contracts';
import { AuditEntry } from '../audit/audit.js';
import { HistoryEntry } from '../history/history.entity.js';
import { SettingsService } from '../settings/settings.js';
import type { RetentionCandidate, RetentionCategoryDefinition, RetentionQuery } from './retention-registry.js';
import { RetentionRegistry } from './retention-registry.js';

type Log = typeof AuditEntry | typeof HistoryEntry;

const older = (cutoff: Date) => ({ timestamp: { $lt: cutoff } });

/**
 * The audit log and the history of the core: many small entries, processed in bulk. With „Sonderfall prüfen“ the entries
 * of each year become one case.
 */
@Injectable()
export class CoreRetentionCategories implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly registry: RetentionRegistry,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    this.registry.registerCategory({
      ...this.log('core.audit', AuditEntry),
      name: { de: 'Audit-Log', en: 'Audit log' },
      description: { de: 'Datenerfassungsprotokolle: Anmeldungen, Rechte, Exporte, Importe', en: 'Data recording logs: logins, permissions, exports, imports' },
      actions: ['delete'],
      defaultRule: { years: 2, action: 'delete' },
    });
    this.registry.registerCategory({
      ...this.log('core.history', HistoryEntry),
      name: { de: 'Historie und Versionen', en: 'History and versions' },
      description: {
        de: 'Änderungen aller Datensätze; ältere Stände lassen sich danach nicht mehr wiederherstellen, der aktuelle Stand bleibt',
        en: 'Changes of all records; older states can no longer be restored afterwards, the current state stays',
      },
      actions: ['delete', 'none'],
    });
  }

  private log(key: 'core.audit' | 'core.history', entity: Log): Omit<RetentionCategoryDefinition, 'name' | 'actions'> {
    return {
      key,
      module: 'core',
      event: { de: 'Eintrag', en: 'Entry' },
      candidates: (query) => this.years(entity, query),
      export: async (ids) =>
        Promise.all(
          ids.map(async (year) => {
            const entries = await this.em.fork().find(entity as typeof HistoryEntry, { timestamp: this.yearRange(year, await this.cutoff(key)) }, { orderBy: { timestamp: 'asc' } });
            return { id: year, title: year, fields: [{ label: { de: 'Einträge', en: 'Entries' }, value: String(entries.length) }], data: { entries }, attachments: [] };
          }),
        ),
      // The entries of a year as far as they are due now.
      execute: async (ids) => {
        const cutoff = await this.cutoff(key);
        let count = 0;
        for (const year of ids) count += await this.em.fork().nativeDelete(entity as typeof HistoryEntry, { timestamp: this.yearRange(year, cutoff) });
        return count;
      },
      bulk: {
        count: (query) => this.em.fork().count(entity as typeof HistoryEntry, older(query.cutoff)),
        run: (query) => this.em.fork().nativeDelete(entity as typeof HistoryEntry, older(query.cutoff)),
      },
    };
  }

  /** Due entries grouped by year: one case per year. */
  private async years(entity: Log, query: RetentionQuery): Promise<RetentionCandidate[]> {
    const table = entity === AuditEntry ? '"core"."audit"' : '"core"."history"';
    const rows: { year: number; first: Date | string }[] = await this.em
      .fork()
      .getConnection()
      .execute(`select extract(year from "timestamp")::int as "year", min("timestamp") as "first" from ${table} where "timestamp" < ? group by 1 order by 1`, [query.cutoff]);
    return rows.map((r) => {
      const year = String(r.year);
      return { id: year, label: year, neutralLabel: year, eventDate: new Date(r.first).toISOString().slice(0, 10) };
    });
  }

  private yearRange(year: string, cutoff: Date) {
    const end = new Date(Date.UTC(Number(year) + 1, 0, 1));
    return { $gte: new Date(Date.UTC(Number(year), 0, 1)), $lt: end < cutoff ? end : cutoff };
  }

  /** The current period of the stored rule (a case is executed later than it was created). */
  private async cutoff(key: string): Promise<Date> {
    const rule = (await this.settings.get<PrivacySettings>('privacy'))?.retention[key];
    const years = rule?.years ?? (key === 'core.audit' ? 2 : null);
    const cutoff = new Date();
    if (years === null) return new Date(0);
    cutoff.setFullYear(cutoff.getFullYear() - years);
    return cutoff;
  }
}
