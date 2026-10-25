import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { defineEntity, EntityManager, type FilterQuery, p, raw } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { RequirePermissions } from '../security/decorators.js';
import { User } from '../security/security.entities.js';
import { likeWord, searchWords } from '../data/search-words.js';
import { berlinDayAfter, berlinDayStart } from '../imports/parse.js';
import { UserContext } from '../user-context.js';

/** Security-relevant events: logins, permission changes, tokens, imports, exports. */
export const AuditEntrySchema = defineEntity({
  name: 'AuditEntry',
  schema: 'core',
  tableName: 'audit',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    timestamp: p.datetime().index(),
    userId: p.string().nullable(),
    /** Administrator who acted as `userId` (impersonation). */
    impersonatorId: p.string().nullable(),
    action: p.string(),
    details: p.json<Record<string, unknown>>(),
  },
});
export class AuditEntry extends AuditEntrySchema.class {}
AuditEntrySchema.setClass(AuditEntry);

export interface AuditEntryDto {
  id: string;
  timestamp: string;
  userId: string | null;
  /** Display name of the user, resolved by the server (readers of the log need not manage users). */
  userName: string | null;
  impersonatorId: string | null;
  impersonatorName: string | null;
  action: string;
  details: Record<string, unknown>;
}

export interface AuditFilters {
  /** All actions in the log, for the filter. */
  actions: string[];
  /** Users appearing in the log. */
  users: { id: string; name: string }[];
}

@Injectable()
export class Audit {
  constructor(private readonly em: EntityManager) {}

  /** Writes immediately, independent of the caller's transaction. */
  async log(action: string, details: Record<string, unknown> = {}, userId?: string | null): Promise<void> {
    const em = this.em.fork();
    em.create(AuditEntry, {
      timestamp: new Date(),
      userId: userId === undefined ? UserContext.userId() : userId,
      impersonatorId: UserContext.impersonatorId(),
      action,
      details,
    });
    await em.flush();
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

@Controller('core/audit')
@RequirePermissions('core.audit.read')
export class AuditController {
  constructor(private readonly em: EntityManager) {}

  /**
   * Entries newest first, filtered on the server: period (`from`/`to`, days in Europe/Berlin, inclusive),
   * user, action (exact or prefix ending in `.`), words in action or details; at most 1000.
   */
  @Get()
  async list(
    @Query('limit') limit = '200',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('userId') userId?: string,
    @Query('action') action?: string,
    @Query('q') q?: string,
  ): Promise<AuditEntryDto[]> {
    const em = this.em.fork();
    const where: FilterQuery<AuditEntry>[] = [];
    if (from && DATE.test(from)) where.push({ timestamp: { $gte: berlinDayStart(from) } });
    if (to && DATE.test(to)) where.push({ timestamp: { $lt: berlinDayAfter(to) } });
    if (userId) where.push({ $or: [{ userId }, { impersonatorId: userId }] });
    if (action) where.push(action.endsWith('.') ? { action: { $like: `${action.replace(/[\\%_]/g, '\\$&')}%` } } : { action });
    for (const word of searchWords(q ?? '')) {
      const like = likeWord(word);
      where.push({ $or: [{ action: { $ilike: like } }, { [raw((alias) => `${alias}.details::text`)]: { $ilike: like } }] });
    }
    const entries = await em.find(AuditEntry, where.length ? { $and: where } : {}, {
      orderBy: { timestamp: 'desc' },
      limit: Math.min(Math.max(Number(limit) || 200, 1), 1000),
    });
    const names = await this.names(em, entries.flatMap((e) => [e.userId, e.impersonatorId]));
    return entries.map((e) => ({
      id: e.id,
      timestamp: e.timestamp.toISOString(),
      userId: e.userId ?? null,
      userName: e.userId ? (names.get(e.userId) ?? null) : null,
      impersonatorId: e.impersonatorId ?? null,
      impersonatorName: e.impersonatorId ? (names.get(e.impersonatorId) ?? null) : null,
      action: e.action,
      details: e.details,
    }));
  }

  /** Values for the filters of the audit page. */
  @Get('filters')
  async filters(): Promise<AuditFilters> {
    const em = this.em.fork();
    const connection = em.getConnection();
    const actionRows: { action: string }[] = await connection.execute('select distinct "action" from "core"."audit" order by "action"');
    const userRows: { id: string }[] = await connection.execute('select distinct "user_id" as "id" from "core"."audit" where "user_id" is not null');
    const actions = actionRows.map((r) => r.action);
    const ids = userRows.map((r) => r.id);
    const names = await this.names(em, ids);
    return { actions, users: [...names].map(([id, name]) => ({ id, name })).toSorted((a, b) => a.name.localeCompare(b.name)) };
  }

  private async names(em: EntityManager, ids: (string | null | undefined)[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
    if (!unique.length) return new Map();
    const users = await em.find(User, { id: { $in: unique.filter((id) => /^[0-9a-f-]{36}$/i.test(id)) } }, { fields: ['id', 'displayName'] });
    return new Map(users.map((u) => [u.id, u.displayName]));
  }
}
