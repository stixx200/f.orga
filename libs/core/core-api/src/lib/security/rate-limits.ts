import { createHash } from 'node:crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import { RetentionRegistry } from '../retention/retention-registry.js';

/**
 * A counter of the rate limits (login lock, password reset, info terminals). Stored in the database, so a restart or a
 * second server instance does not reset it. The key is stored as SHA-256 only (it contains usernames and addresses);
 * the retention run removes counters a day after their last use. Not historized.
 */
export const RateLimitSchema = defineEntity({
  name: 'RateLimitEntity',
  schema: 'core',
  tableName: 'rate_limit',
  properties: {
    /** SHA-256 of `<scope>:<key>`. */
    id: p.string().primary(),
    /** E.g. `login`, `password-reset.address`, `info-terminal.search`. */
    scope: p.string().index(),
    count: p.integer(),
    windowStart: p.datetime(),
    blockedUntil: p.datetime().nullable(),
    updatedAt: p.datetime().index(),
  },
});
export class RateLimitEntity extends RateLimitSchema.class {}
RateLimitSchema.setClass(RateLimitEntity);

/** At most `limit` events per `windowMs`; with `blockMs` the key is blocked that long once it went over the limit. */
export interface RateLimitRule {
  limit: number;
  windowMs: number;
  blockMs?: number;
}

const DAY_MS = 24 * 60 * 60_000;

/**
 * Rate limits in the database (L24): login lock, password reset, wrong device keys and requests of info terminals.
 * Modules use it for their own limits (`hit`, `blocked`, `reset`).
 */
@Injectable()
export class RateLimits implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly retention: RetentionRegistry,
  ) {}

  onModuleInit(): void {
    // Counters hold usernames and addresses (hashed); they are not needed after a day.
    this.retention.register('core.rate-limits', {
      run: async (_settings, dryRun) => {
        const where = { updatedAt: { $lt: new Date(Date.now() - DAY_MS) }, $or: [{ blockedUntil: null }, { blockedUntil: { $lt: new Date() } }] };
        return dryRun ? this.em.fork().count(RateLimitEntity, where) : this.em.fork().nativeDelete(RateLimitEntity, where);
      },
    });
  }

  private id(scope: string, key: string): string {
    return createHash('sha256').update(`${scope}:${key}`).digest('hex');
  }

  /** Is the key blocked right now (without counting)? */
  async blocked(scope: string, key: string, now = new Date()): Promise<boolean> {
    const entry = await this.em.fork().findOne(RateLimitEntity, this.id(scope, key));
    return Boolean(entry?.blockedUntil && entry.blockedUntil > now);
  }

  /**
   * Counts an event; `false` if the key is blocked or went over the limit with it (the event should be refused). One
   * statement, so parallel requests and several server instances count correctly.
   */
  async hit(scope: string, key: string, rule: RateLimitRule, now = new Date()): Promise<boolean> {
    const windowEnd = new Date(now.getTime() - rule.windowMs);
    const rows: { count: number; blocked_until: Date | string | null }[] = await this.em
      .fork()
      .getConnection()
      .execute(
        `insert into "core"."rate_limit" ("id", "scope", "count", "window_start", "blocked_until", "updated_at") values (?, ?, 1, ?, null, ?)
         on conflict ("id") do update set
           "count" = case when "rate_limit"."window_start" <= ? then 1 else "rate_limit"."count" + 1 end,
           "window_start" = case when "rate_limit"."window_start" <= ? then excluded."window_start" else "rate_limit"."window_start" end,
           "updated_at" = excluded."updated_at"
         returning "count", "blocked_until"`,
        [this.id(scope, key), scope, now, now, windowEnd, windowEnd],
      );
    const row = rows[0];
    const blockedUntil = row?.blocked_until ? new Date(row.blocked_until) : null;
    if (blockedUntil && blockedUntil > now) return false;
    if ((row?.count ?? 0) <= rule.limit) return true;
    if (rule.blockMs) await this.em.fork().nativeUpdate(RateLimitEntity, this.id(scope, key), { blockedUntil: new Date(now.getTime() + rule.blockMs) });
    return false;
  }

  /** Forgets the counter, e.g. after a successful login. */
  async reset(scope: string, key: string): Promise<void> {
    await this.em.fork().nativeDelete(RateLimitEntity, this.id(scope, key));
  }
}
