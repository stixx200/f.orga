import { Controller, Get, Injectable, Query } from '@nestjs/common';
import { defineEntity, EntityManager, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { RequirePermissions } from '../security/decorators.js';
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
  impersonatorId: string | null;
  action: string;
  details: Record<string, unknown>;
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

@Controller('core/audit')
export class AuditController {
  constructor(private readonly em: EntityManager) {}

  @Get()
  @RequirePermissions('core.audit.read')
  async list(@Query('limit') limit = '200'): Promise<AuditEntryDto[]> {
    const entries = await this.em
      .fork()
      .find(AuditEntry, {}, { orderBy: { timestamp: 'desc' }, limit: Math.min(Number(limit) || 200, 1000) });
    return entries.map((e) => ({
      id: e.id,
      timestamp: e.timestamp.toISOString(),
      userId: e.userId ?? null,
      impersonatorId: e.impersonatorId ?? null,
      action: e.action,
      details: e.details,
    }));
  }
}
