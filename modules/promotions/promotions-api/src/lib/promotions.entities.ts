import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { ListEntry, ListStatus } from '@forga/promotions-contracts';

/** A promotion list: candidates on a reference date, the decisions on them and their execution. */
export const PromotionListSchema = defineEntity({
  name: 'PromotionListEntity',
  schema: 'promotions',
  tableName: 'promotion_list',
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => uuidv7()),
    title: p.string(),
    referenceDate: p.string().length(10),
    effectiveDate: p.string().length(10),
    status: p.string().$type<ListStatus>().default('draft'),
    entries: p.json<ListEntry[]>().defaultRaw("'[]'::jsonb"),
    notes: p.text().default(''),
    decidedOn: p.string().length(10).nullable(),
    decidedBy: p.string().nullable(),
    executedAt: p.datetime().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
    version: p.integer().version(),
  },
});
export class PromotionListEntity extends PromotionListSchema.class {}
PromotionListSchema.setClass(PromotionListEntity);

/** Exclusion of a person from promotions for a period. */
export const ExclusionSchema = defineEntity({
  name: 'ExclusionEntity',
  schema: 'promotions',
  tableName: 'exclusion',
  properties: {
    id: p
      .uuid()
      .primary()
      .onCreate(() => uuidv7()),
    personId: p.string().index(),
    from: p.string().length(10),
    until: p.string().length(10).nullable(),
    /** Only promotions to this rank; `null` = all. */
    targetRank: p.string().nullable(),
    reason: p.text(),
    createdBy: p.string(),
    createdAt: p.datetime().onCreate(() => new Date()),
    version: p.integer().version(),
  },
});
export class ExclusionEntity extends ExclusionSchema.class {}
ExclusionSchema.setClass(ExclusionEntity);
