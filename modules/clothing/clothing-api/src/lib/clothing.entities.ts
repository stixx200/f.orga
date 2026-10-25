import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { LocalizedText } from '@forga/core-contracts';
import type { ArticleKind, CareKind, IssueKind, ItemStatus } from '@forga/clothing-contracts';

/** Article of the catalog (e.g. turnout jacket, gloves). */
export const ArticleSchema = defineEntity({
  name: 'ArticleEntity',
  schema: 'clothing',
  tableName: 'article',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    key: p.string().unique(),
    name: p.json<LocalizedText>(),
    kind: p.string().$type<ArticleKind>(),
    sizes: p.json<string[]>().defaultRaw("'[]'::jsonb"),
    textile: p.boolean().default(false),
    impregnationMonths: p.integer().nullable(),
    inspectionMonths: p.integer().nullable(),
    active: p.boolean().default(true),
    sortOrder: p.integer().default(0),
    /** Minimum stock per size (`''` without sizes). */
    minimumStock: p.json<Record<string, number>>().defaultRaw("'{}'::jsonb"),
    version: p.integer().version(),
  },
});
export class ArticleEntity extends ArticleSchema.class {}
ArticleSchema.setClass(ArticleEntity);

/** A piece of an inventory article; `holderId` is the person while it is issued. */
export const ItemSchema = defineEntity({
  name: 'ClothingItemEntity',
  schema: 'clothing',
  tableName: 'item',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    articleKey: p.string().index(),
    inventoryNumber: p.string().unique(),
    size: p.string().default(''),
    serialNumber: p.string().default(''),
    /** Unique where set; several pieces may have none. */
    barcode: p.string().nullable().unique(),
    rfid: p.string().nullable().unique(),
    manufacturer: p.string().default(''),
    purchasedOn: p.string().length(10).nullable(),
    departmentId: p.string().index(),
    notes: p.text().default(''),
    status: p.string().$type<ItemStatus>().default('stock'),
    /** No foreign key: the person belongs to the master data module. */
    holderId: p.string().nullable().index(),
    issuedOn: p.string().length(10).nullable(),
    createdOn: p.string().length(10),
    version: p.integer().version(),
  },
});
export class ClothingItemEntity extends ItemSchema.class {}
ItemSchema.setClass(ClothingItemEntity);

/** Who recorded an entry and whether it was cancelled (wrong entries are cancelled with a reason, never deleted). */
const recorded = () => ({
  recordedBy: p.string(),
  recordedById: p.string().nullable(),
  cancelledAt: p.datetime().nullable(),
  cancelledBy: p.string().nullable(),
  cancelReason: p.text().default(''),
});

/** History of a person: consumables handed out, pieces issued and returned. */
export const IssueSchema = defineEntity({
  name: 'IssueEntity',
  schema: 'clothing',
  tableName: 'issue',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    personId: p.string().index(),
    kind: p.string().$type<IssueKind>(),
    articleKey: p.string(),
    itemId: p.string().nullable().index(),
    inventoryNumber: p.string().nullable(),
    size: p.string().default(''),
    quantity: p.integer().default(1),
    date: p.string().length(10),
    notes: p.text().default(''),
    /** Return: retired instead of into stock. */
    retire: p.boolean().default(false),
    /** Return: to be washed before the piece is issued again. */
    laundry: p.boolean().default(false),
    ...recorded(),
    recordedAt: p.datetime(),
  },
});
export class IssueEntity extends IssueSchema.class {}
IssueSchema.setClass(IssueEntity);

/** Washing or impregnation of a textile piece. */
export const CareSchema = defineEntity({
  name: 'CareEntity',
  schema: 'clothing',
  tableName: 'care',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    item: () => p.manyToOne(ClothingItemEntity).deleteRule('cascade'),
    kind: p.string().$type<CareKind>(),
    date: p.string().length(10),
    place: p.string().default(''),
    notes: p.text().default(''),
    ...recorded(),
  },
});
export class CareEntity extends CareSchema.class {}
CareSchema.setClass(CareEntity);

/** Inspection of a piece (e.g. yearly check of jacket, helmet, boots). */
export const ClothingInspectionSchema = defineEntity({
  name: 'ClothingInspectionEntity',
  schema: 'clothing',
  tableName: 'inspection',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    item: () => p.manyToOne(ClothingItemEntity).deleteRule('cascade'),
    date: p.string().length(10),
    passed: p.boolean(),
    inspector: p.string().default(''),
    notes: p.text().default(''),
    ...recorded(),
  },
});
export class ClothingInspectionEntity extends ClothingInspectionSchema.class {}
ClothingInspectionSchema.setClass(ClothingInspectionEntity);

/** Clothing sizes of a person by article key; preselects the stock when issuing. */
export const SizeProfileSchema = defineEntity({
  name: 'SizeProfileEntity',
  schema: 'clothing',
  tableName: 'size_profile',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    /** No foreign key: the person belongs to the master data module. */
    personId: p.string().unique(),
    sizes: p.json<Record<string, string>>().defaultRaw("'{}'::jsonb"),
    version: p.integer().version(),
  },
});
export class SizeProfileEntity extends SizeProfileSchema.class {}
SizeProfileSchema.setClass(SizeProfileEntity);

/** Consumables received into the store; the stock is the sum of the receipts minus what was handed out. */
export const ConsumableReceiptSchema = defineEntity({
  name: 'ConsumableReceiptEntity',
  schema: 'clothing',
  tableName: 'consumable_receipt',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    articleKey: p.string().index(),
    size: p.string().default(''),
    quantity: p.integer(),
    date: p.string().length(10),
    notes: p.text().default(''),
    recordedBy: p.string(),
    recordedAt: p.datetime(),
  },
});
export class ConsumableReceiptEntity extends ConsumableReceiptSchema.class {}
ConsumableReceiptSchema.setClass(ConsumableReceiptEntity);
