import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { FieldChange, HistoryEntry as HistoryEntryDto } from '@forga/core-contracts';
import { CurrentUser } from '../security/decorators.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { HistoryAccessRegistry } from './history-access.js';
import { User } from '../security/security.entities.js';
import { HistoryEntry } from './history.entity.js';

@Controller('core/history')
export class HistoryController {
  constructor(
    private readonly em: EntityManager,
    private readonly access: HistoryAccessRegistry,
  ) {}

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
