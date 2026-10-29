import { Injectable, type OnModuleInit } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import type { Language, LocalizedText } from '@forga/core-contracts';
import { AUDIT_LABELS } from '../access-report/audit-labels.js';
import { AuditEntry } from '../audit/audit.js';
import { berlinDayAfter, berlinDayStart } from '../imports/parse.js';
import { User } from '../security/security.entities.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** At most this many rows per protocol in one export. */
export const MAX_PROTOCOL_ROWS = 50_000;

/** Day and time in Europe/Berlin, e.g. „12.10.2026, 14:05“. */
export function berlinDateTime(instant: Date, language: Language): string {
  return new Intl.DateTimeFormat(language === 'de' ? 'de-DE' : 'en-GB', { timeZone: 'Europe/Berlin', day: '2-digit', month: language === 'de' ? '2-digit' : 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(instant);
}

/** Filter of a protocol export: days in Europe/Berlin (inclusive) and optionally one user (also as impersonator). */
export interface ProtocolFilter {
  from: string;
  to: string;
  userId: string | null;
}

/**
 * A protocol that can be exported for a period and a user to investigate a data breach (module `privacy`), one sheet
 * per protocol: the audit log of the core, the read log of the module `privacy`; further protocols register the same way.
 */
export interface ProtocolSource {
  key: string;
  title: LocalizedText;
  columns: LocalizedText[];
  /** Column widths in characters. */
  widths?: number[];
  rows(filter: ProtocolFilter, language: Language): Promise<(string | number | null)[][]>;
}

@Injectable()
export class ProtocolRegistry {
  private readonly sources = new Map<string, ProtocolSource>();

  register(source: ProtocolSource): void {
    if (this.sources.has(source.key)) throw new Error(`Protocol "${source.key}" is already registered.`);
    this.sources.set(source.key, source);
  }

  list(): ProtocolSource[] {
    return [...this.sources.values()];
  }
}

/** Readable name of an audit action, e.g. for the protocol export. */
export const auditLabel = (action: string): LocalizedText => AUDIT_LABELS[action] ?? { de: action, en: action };

/**
 * Devices with their own keys outside the sessions (e.g. the info terminals), blocked by „Alle Sitzungen beenden“ in a
 * data breach. A handler blocks the keys of its module and returns how many devices it blocked.
 */
@Injectable()
export class LockdownRegistry {
  private readonly handlers: { module: string; block: () => Promise<number> }[] = [];

  register(module: string, block: () => Promise<number>): void {
    this.handlers.push({ module, block });
  }

  /** Blocks the devices of all modules (also inactive ones: their keys would work again on activation). */
  async blockAll(): Promise<number> {
    let count = 0;
    for (const handler of this.handlers) count += await handler.block();
    return count;
  }
}

/** The audit log as protocol of the core, filtered by period and user (also as impersonator). */
@Injectable()
export class CoreProtocols implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly protocols: ProtocolRegistry,
  ) {}

  onModuleInit(): void {
    this.protocols.register({
      key: 'core.audit',
      title: { de: 'Audit-Log', en: 'Audit log' },
      columns: [
        { de: 'Zeitpunkt', en: 'Time' },
        { de: 'Benutzer', en: 'User' },
        { de: 'Angemeldet als durch', en: 'Impersonated by' },
        { de: 'Vorgang', en: 'Action' },
        { de: 'Code', en: 'Code' },
        { de: 'Details', en: 'Details' },
      ],
      widths: [18, 22, 22, 34, 30, 80],
      rows: (filter, language) => this.auditRows(filter, language),
    });
  }

  private async auditRows(filter: ProtocolFilter, language: Language): Promise<(string | number | null)[][]> {
    const entries = await this.em.fork().find(AuditEntry, auditWhere(filter), { orderBy: { timestamp: 'asc' }, limit: MAX_PROTOCOL_ROWS });
    const ids = [...new Set(entries.flatMap((e) => [e.userId, e.impersonatorId]).filter((id): id is string => Boolean(id && UUID.test(id))))];
    const names = new Map(ids.length ? (await this.em.fork().find(User, { id: { $in: ids } }, { fields: ['id', 'displayName'] })).map((u) => [u.id, u.displayName]) : []);
    return entries.map((e) => [
      berlinDateTime(e.timestamp, language),
      e.userId ? (names.get(e.userId) ?? e.userId) : '',
      e.impersonatorId ? (names.get(e.impersonatorId) ?? e.impersonatorId) : '',
      auditLabel(e.action)[language],
      e.action,
      JSON.stringify(e.details),
    ]);
  }
}

/** Audit entries of the period, of the user or done by the user as impersonator. */
export function auditWhere(filter: ProtocolFilter): FilterQuery<AuditEntry> {
  return {
    timestamp: { $gte: berlinDayStart(filter.from), $lt: berlinDayAfter(filter.to) },
    ...(filter.userId ? { $or: [{ userId: filter.userId }, { impersonatorId: filter.userId }] } : {}),
  };
}
