import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { berlinDate } from '@forga/core-api';
import type { LocalizedText } from '@forga/core-contracts';
import type { DefectStatus, InspectionResult, InspectionType, ItemStatus, Tracking } from '@forga/equipment-contracts';

const berlinToday = () => berlinDate();

export const CategorySchema = defineEntity({
  name: 'CategoryEntity',
  schema: 'equipment',
  tableName: 'category',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    key: p.string().unique(),
    name: p.json<LocalizedText>(),
    parentKey: p.string().nullable(),
    tracking: p.string().$type<Tracking>().default('item'),
    breathingApparatus: p.boolean().default(false),
    lockWhenOverdue: p.boolean().default(false),
    version: p.integer().version(),
  },
});
export class CategoryEntity extends CategorySchema.class {}
CategorySchema.setClass(CategoryEntity);

export const EquipmentTypeSchema = defineEntity({
  name: 'EquipmentTypeEntity',
  schema: 'equipment',
  tableName: 'equipment_type',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    key: p.string().unique(),
    name: p.json<LocalizedText>(),
    categoryKey: p.string(),
    manufacturer: p.string().default(''),
    model: p.string().default(''),
    inspections: p.json<InspectionType[]>().defaultRaw("'[]'::jsonb"),
    properties: p.json<string[]>().defaultRaw("'[]'::jsonb"),
    version: p.integer().version(),
  },
});
export class EquipmentTypeEntity extends EquipmentTypeSchema.class {}
EquipmentTypeSchema.setClass(EquipmentTypeEntity);

export const ItemSchema = defineEntity({
  name: 'EquipmentItemEntity',
  schema: 'equipment',
  tableName: 'item',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    inventoryNumber: p.string().unique(),
    name: p.string(),
    typeKey: p.string().nullable(),
    categoryKey: p.string().index(),
    serialNumber: p.string().default(''),
    /** Unique where set; several items may have none. */
    barcode: p.string().nullable().unique(),
    rfid: p.string().nullable().unique(),
    manufacturer: p.string().default(''),
    yearBuilt: p.integer().nullable(),
    purchasedOn: p.string().length(10).nullable(),
    price: p.double().nullable(),
    properties: p.json<Record<string, string>>().defaultRaw("'{}'::jsonb"),
    departmentId: p.string().index(),
    vehicleId: p.string().nullable().index(),
    stationId: p.string().nullable(),
    loadingPlace: p.string().default(''),
    quantity: p.integer().default(1),
    expiresOn: p.string().length(10).nullable(),
    /** `null` = inspections of the type. */
    inspections: p.json<InspectionType[]>().nullable(),
    /** Inspection key → own interval in months. */
    intervalOverrides: p.json<Record<string, number>>().defaultRaw("'{}'::jsonb"),
    status: p.string().$type<ItemStatus>().default('ready'),
    /** Inspection key → date it became due (after use, incident, washing). */
    triggered: p.json<Record<string, string>>().defaultRaw("'{}'::jsonb"),
    retirement: p.json<{ date: string; reason: string; disposition: string }>().nullable(),
    forVehicleId: p.string().nullable().unique(),
    labelPrintedAt: p.datetime().nullable(),
    notes: p.text().default(''),
    /** Day the item was recorded (Europe/Berlin); items never inspected are due from then, unless purchased earlier. */
    createdOn: p.string().length(10).onCreate(() => berlinToday()),
    version: p.integer().version(),
  },
});
export class EquipmentItemEntity extends ItemSchema.class {}
ItemSchema.setClass(EquipmentItemEntity);

export const InspectionSchema = defineEntity({
  name: 'InspectionEntity',
  schema: 'equipment',
  tableName: 'inspection',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    item: () => p.manyToOne(EquipmentItemEntity).deleteRule('cascade'),
    inspectionKey: p.string(),
    date: p.string().length(10).index(),
    inspectorPersonId: p.string().nullable(),
    inspectorCompany: p.string().default(''),
    result: p.string().$type<InspectionResult>(),
    checklist: p.json<{ point: string; state: string; value: string }[]>().defaultRaw("'[]'::jsonb"),
    measurements: p.text().default(''),
    nextDueOn: p.string().length(10).nullable(),
    notes: p.text().default(''),
    recordedBy: p.string(),
    qualificationWarning: p.boolean().default(false),
    /** Cancelled inspections do not count for the due dates. */
    cancelled: p.boolean().default(false),
    /** Reason of the last correction or of the cancellation (the history keeps earlier ones). */
    changeReason: p.text().default(''),
    /** Date of the trigger ("after use", "after washing" …) this inspection settled; restored when it is cancelled. */
    clearedTrigger: p.string().length(10).nullable(),
  },
});
export class InspectionEntity extends InspectionSchema.class {}
InspectionSchema.setClass(InspectionEntity);

export const DefectSchema = defineEntity({
  name: 'DefectEntity',
  schema: 'equipment',
  tableName: 'defect',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    item: () => p.manyToOne(EquipmentItemEntity).deleteRule('cascade'),
    /** Text of the reporter; for a finding of an inspection its notes (may be empty). */
    description: p.text(),
    /** Finding of an inspection (failed or with defects): the inspection, the name of its type and the result. */
    inspectionId: p.string().nullable().index(),
    findingName: p.json<LocalizedText>().nullable(),
    findingResult: p.string().$type<InspectionResult>().nullable(),
    status: p.string().$type<DefectStatus>().default('reported'),
    resolution: p.text().default(''),
    reportedBy: p.string(),
    /** User who reported it, for "My area". */
    reportedByUserId: p.string().nullable().index(),
    reportedAt: p.datetime().onCreate(() => new Date()),
    resolvedAt: p.datetime().nullable(),
    version: p.integer().version(),
  },
});
export class DefectEntity extends DefectSchema.class {}
DefectSchema.setClass(DefectEntity);

/** Equipment used in an incident report or a training session (`reportId` holds the ID of either). */
export const UsageSchema = defineEntity({
  name: 'UsageEntity',
  schema: 'equipment',
  tableName: 'usage',
  uniques: [{ properties: ['reportId', 'item'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    reportId: p.string().index(),
    source: p.string().$type<'incidents' | 'training'>().default('incidents'),
    item: () => p.manyToOne(EquipmentItemEntity).deleteRule('cascade'),
    quantity: p.integer().default(1),
    inspectAfter: p.boolean().default(false),
  },
});
export class UsageEntity extends UsageSchema.class {}
UsageSchema.setClass(UsageEntity);
