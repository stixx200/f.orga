import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { FieldChange, HistoryAction } from '@forga/core-contracts';

export const HistoryEntrySchema = defineEntity({
  name: 'HistoryEntry',
  schema: 'core',
  tableName: 'history',
  indexes: [{ properties: ['entity', 'entityId'] }, { properties: ['parentEntity', 'parentId'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    entity: p.string(),
    entityId: p.string(),
    /** Record whose history also shows this entry, e.g. the person of a membership. */
    parentEntity: p.string().nullable(),
    parentId: p.string().nullable(),
    action: p.string().$type<HistoryAction>(),
    changes: p.json<Record<string, FieldChange>>(),
    userId: p.string().nullable(),
    /** Administrator who acted as `userId` (impersonation). */
    impersonatorId: p.string().nullable(),
    timestamp: p.datetime(),
    /**
     * Values removed as wrong or unlawfully recorded ("Wert in der Historie unkenntlich machen", L12), per field and side:
     * when, by whom (user ID) and why. The value itself is replaced by `null` in `changes`.
     */
    redactions: p.json<Record<string, Partial<Record<'old' | 'new', HistoryRedaction>>>>().nullable(),
  },
});

export interface HistoryRedaction {
  at: string;
  by: string;
  reason: string;
}

export class HistoryEntry extends HistoryEntrySchema.class {}
HistoryEntrySchema.setClass(HistoryEntry);
