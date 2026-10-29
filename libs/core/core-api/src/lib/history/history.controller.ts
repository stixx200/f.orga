import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type FieldChange, type HistoryEntry as HistoryEntryDto, HistoryRedactionInput, PRIVACY_PERMISSION } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { CurrentUser, RequirePermissions } from '../security/decorators.js';
import { ZodPipe } from '../zod.pipe.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { HistoryAccessRegistry } from './history-access.js';
import { User } from '../security/security.entities.js';
import { HistoryEntry } from './history.entity.js';

@Controller('core/history')
export class HistoryController {
  constructor(
    private readonly em: EntityManager,
    private readonly access: HistoryAccessRegistry,
    private readonly audit: Audit,
  ) {}

  /**
   * "Wert in der Historie unkenntlich machen" (L12, Art. 16): removes a wrong or unlawfully recorded value from one
   * entry. The entry stays and shows "berichtigt, Wert entfernt am …"; the audit log names field and reason, not the value.
   */
  @Post('entries/:id/redact')
  @HttpCode(200)
  @RequirePermissions(PRIVACY_PERMISSION)
  async redact(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(HistoryRedactionInput)) input: HistoryRedactionInput,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    const em = this.em.fork();
    const entry = await em.findOne(HistoryEntry, id);
    if (!entry) throw new NotFoundException();
    const access = await this.access.check(user, entry.parentEntity ?? entry.entity, entry.parentId ?? entry.entityId);
    if (!access.allowed) throw new NotFoundException();
    const change = entry.changes[input.field];
    if (!change) throw new BadRequestException({ code: 'history.unknownField' });
    if (entry.redactions?.[input.field]?.[input.side]) throw new ConflictException({ code: 'history.alreadyRedacted' });
    if (change[input.side] === null || change[input.side] === undefined || change[input.side] === '') throw new BadRequestException({ code: 'history.nothingToRedact' });
    entry.changes = { ...entry.changes, [input.field]: { ...change, [input.side]: null } };
    entry.redactions = { ...entry.redactions, [input.field]: { ...entry.redactions?.[input.field], [input.side]: { at: new Date().toISOString(), by: user.id, reason: input.reason } } };
    await em.flush();
    await this.audit.log('privacy.history-redacted', { entity: entry.entity, entityId: entry.entityId, field: input.field, side: input.side, reason: input.reason });
  }

  /**
   * The history of a record including its child records (e.g. memberships of a person).
   * Who may read it is decided by the check the owning module registered (see `HistoryAccessRegistry`).
   */
  @Get(':entity/:id')
  async list(
    @Param('entity') entity: string,
    @Param('id') entityId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<(HistoryEntryDto & { userName: string | null; impersonatorName: string | null })[]> {
    const access = await this.access.check(user, entity, entityId);
    if (!access.allowed) throw new NotFoundException();
    const hidden = new Set(access.hiddenFields ?? []);

    const entries = await this.em
      .fork()
      .find(
        HistoryEntry,
        { $or: [{ entity, entityId }, { parentEntity: entity, parentId: entityId }] },
        { orderBy: { timestamp: 'desc', id: 'desc' } },
      );
    const userIds = [...new Set(entries.flatMap((e) => [e.userId, e.impersonatorId]).filter((id): id is string => Boolean(id)))];
    const names = new Map((await this.em.fork().find(User, { id: { $in: userIds } })).map((u) => [u.id, u.displayName]));
    return entries.map((e) => ({
      id: e.id,
      entity: e.entity,
      entityId: e.entityId,
      parentEntity: e.parentEntity ?? null,
      parentId: e.parentId ?? null,
      action: e.action,
      // Hidden are fields of the record itself, whole child records named by their history name (e.g.
      // `masterdata.rest_period`) and single fields of child records (e.g. `incidents.report_personnel.injured`).
      changes: Object.fromEntries(
        Object.entries(e.changes).map(([field, change]): [string, FieldChange] => {
          const redacted = e.redactions?.[field];
          const marks = { ...(redacted?.old ? { redactedOld: redacted.old.at } : {}), ...(redacted?.new ? { redactedNew: redacted.new.at } : {}) };
          const masked = (e.entity === entity && hidden.has(field)) || hidden.has(e.entity) || hidden.has(`${e.entity}.${field}`);
          return [field, masked ? { old: null, new: null, hidden: true, ...marks } : { ...change, ...marks }];
        }),
      ),
      userId: e.userId ?? null,
      userName: e.userId ? (names.get(e.userId) ?? null) : null,
      impersonatorName: e.impersonatorId ? (names.get(e.impersonatorId) ?? null) : null,
      timestamp: e.timestamp.toISOString(),
    }));
  }
}
