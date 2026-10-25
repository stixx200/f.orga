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
  },
});

export class HistoryEntry extends HistoryEntrySchema.class {}
HistoryEntrySchema.setClass(HistoryEntry);
