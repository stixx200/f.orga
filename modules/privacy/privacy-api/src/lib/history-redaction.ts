import { BadRequestException, Body, ConflictException, Controller, HttpCode, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Audit, type AuthenticatedUser, CurrentUser, HistoryAccessRegistry, HistoryEntry, RequirePermissions, ZodPipe } from '@forga/core-api';
import { HistoryRedactionInput, PRIVACY_PERMISSION } from '@forga/privacy-contracts';

@Controller('privacy/history')
export class HistoryRedactionController {
  constructor(
    private readonly em: EntityManager,
    private readonly access: HistoryAccessRegistry,
    private readonly audit: Audit,
  ) {}

  /**
   * "Wert in der Historie unkenntlich machen" (L12, Art. 16): removes a wrong or unlawfully recorded value from one
   * entry of the history of the core. The entry stays and shows "berichtigt, Wert entfernt am …"; the audit log names
   * field and reason, not the value.
   */
  @Post(':id/redact')
  @HttpCode(200)
  @RequirePermissions(PRIVACY_PERMISSION)
  async redact(@Param('id', ParseUUIDPipe) id: string, @Body(new ZodPipe(HistoryRedactionInput)) input: HistoryRedactionInput, @CurrentUser() user: AuthenticatedUser): Promise<void> {
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
}
