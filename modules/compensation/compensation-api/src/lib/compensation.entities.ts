import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { ItemKind, ItemSource, RunStatus } from '@forga/compensation-contracts';

export const RunSchema = defineEntity({
  name: 'RunEntity',
  schema: 'compensation',
  tableName: 'run',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    number: p.string().unique(),
    from: p.string().length(10),
    to: p.string().length(10),
    status: p.string().$type<RunStatus>().default('draft'),
    closedAt: p.datetime().nullable(),
    closedBy: p.string().nullable(),
    handedOverAt: p.datetime().nullable(),
    paidAt: p.datetime().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
    items: () => p.oneToMany(ItemEntity).mappedBy('run'),
    version: p.integer().version(),
  },
});
export class RunEntity extends RunSchema.class {}
RunSchema.setClass(RunEntity);

/** One amount for one person: from an incident report, a training session, a function allowance or by hand. */
export const ItemSchema = defineEntity({
  name: 'ItemEntity',
  schema: 'compensation',
  tableName: 'item',
  indexes: [{ properties: ['source', 'sourceId'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    personId: p.string().index(),
    departmentId: p.string().nullable(),
    source: p.string().$type<ItemSource>(),
    sourceId: p.string().nullable(),
    label: p.string().default(''),
    kind: p.string().$type<ItemKind>(),
    date: p.string().length(10).index(),
    from: p.datetime().nullable(),
    to: p.datetime().nullable(),
    hours: p.double().nullable(),
    rate: p.decimal('number').precision(10).scale(2).nullable(),
    amount: p.decimal('number').precision(10).scale(2).nullable(),
    workingHours: p.boolean().default(false),
    correction: p.boolean().default(false),
    reason: p.text().default(''),
    run: () => p.manyToOne(RunEntity).nullable().deleteRule('set null'),
    createdAt: p.datetime().onCreate(() => new Date()),
    version: p.integer().version(),
  },
});
export class ItemEntity extends ItemSchema.class {}
ItemSchema.setClass(ItemEntity);

/** Holder of a function with an annual allowance, with period. */
export const FunctionHolderSchema = defineEntity({
  name: 'FunctionHolderEntity',
  schema: 'compensation',
  tableName: 'function_holder',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    personId: p.string().index(),
    functionKey: p.string(),
    from: p.string().length(10),
    to: p.string().length(10).nullable(),
    version: p.integer().version(),
  },
});
export class FunctionHolderEntity extends FunctionHolderSchema.class {}
FunctionHolderSchema.setClass(FunctionHolderEntity);
