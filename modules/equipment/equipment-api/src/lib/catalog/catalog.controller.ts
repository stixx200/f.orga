import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { z } from 'zod';
import { Attachments, RequirePermissions, ZodPipe } from '@forga/core-api';
import { type Category, CategoryInput, DGUV_CATEGORIES, DGUV_INSPECTIONS, DGUV_TYPES, type EquipmentType, EquipmentTypeInput, type InspectionCatalogEntry, InspectionType, TemplateOptions, vehicleTemplateType } from '@forga/equipment-contracts';
import { ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import { CategoryEntity, EquipmentItemEntity, EquipmentTypeEntity, InspectionTypeEntity } from '../equipment.entities.js';

type Parsed<T extends z.ZodType> = z.infer<T>;
const SETTINGS = 'equipment.settings.manage';
/** Attachments of an inspection type of the catalog: the test routine as a document. */
export const INSPECTION_TYPE_ATTACHMENTS = 'equipment.inspection-type';

const toCategory = (c: CategoryEntity): Category => ({ id: c.id, key: c.key, name: c.name, parentKey: c.parentKey ?? null, tracking: c.tracking, breathingApparatus: c.breathingApparatus, lockWhenOverdue: c.lockWhenOverdue, version: c.version });
const toInspectionType = (t: InspectionTypeEntity, inUse: number): InspectionCatalogEntry => ({
  id: t.id, key: t.key, name: t.name, intervalMonths: t.intervalMonths ?? null, trigger: t.trigger, inspector: t.inspector, checklist: t.checklist, form: t.form, version: t.version, inUse,
});
const toType = (t: EquipmentTypeEntity, inspections: Map<string, InspectionType>): EquipmentType => ({
  id: t.id, key: t.key, name: t.name, categoryKey: t.categoryKey, manufacturer: t.manufacturer, model: t.model, inspectionKeys: t.inspectionKeys,
  inspections: t.inspectionKeys.flatMap((key) => inspections.get(key) ?? []), properties: t.properties, version: t.version,
});
const toCatalogType = (t: InspectionTypeEntity): InspectionType => ({ key: t.key, name: t.name, intervalMonths: t.intervalMonths ?? null, trigger: t.trigger, inspector: t.inspector, checklist: t.checklist, form: t.form });

/** Categories, inspection types of the shared catalog, equipment types (with their inspection keys); DGUV 305-002 template; vehicles from the master data. */
@Controller('equipment')
export class CatalogController {
  constructor(
    private readonly em: EntityManager,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    private readonly attachments: Attachments,
  ) {}

  @Get('categories')
  async categories(): Promise<Category[]> {
    return (await this.em.fork().find(CategoryEntity, {}, { orderBy: { key: 'asc' } })).map(toCategory);
  }

  @Post('categories')
  @RequirePermissions(SETTINGS)
  async createCategory(@Body(new ZodPipe(CategoryInput)) input: Parsed<typeof CategoryInput>): Promise<Category> {
    const em = this.em.fork();
    if (await em.count(CategoryEntity, { key: input.key })) throw new BadRequestException({ code: 'equipment.keyTaken', key: input.key });
    const category = em.create(CategoryEntity, input);
    await em.flush();
    return toCategory(category);
  }

  @Put('categories/:id')
  @RequirePermissions(SETTINGS)
  async updateCategory(@Param('id') id: string, @Body(new ZodPipe(CategoryInput)) input: Parsed<typeof CategoryInput>): Promise<Category> {
    const em = this.em.fork();
    const category = await em.findOne(CategoryEntity, id);
    if (!category) throw new NotFoundException();
    Object.assign(category, { ...input, key: category.key });
    await em.flush();
    return toCategory(category);
  }

  /**
   * Deletes a category. Subcategories move up one level. Types of a subcategory fall back to its parent.
   * A top-level category that still has types stays (`equipment.categoryHasTypes`); items always block deletion
   * (`equipment.categoryInUse`).
   */
  @Delete('categories/:id')
  @HttpCode(204)
  @RequirePermissions(SETTINGS)
  async removeCategory(@Param('id') id: string): Promise<void> {
    const em = this.em.fork();
    const category = await em.findOne(CategoryEntity, id);
    if (!category) throw new NotFoundException();
    if (await em.count(EquipmentItemEntity, { categoryKey: category.key })) throw new BadRequestException({ code: 'equipment.categoryInUse' });
    const types = await em.find(EquipmentTypeEntity, { categoryKey: category.key });
    if (types.length && !category.parentKey) throw new BadRequestException({ code: 'equipment.categoryHasTypes' });
    for (const type of types) type.categoryKey = category.parentKey!;
    for (const child of await em.find(CategoryEntity, { parentKey: category.key })) child.parentKey = category.parentKey;
    await em.remove(category).flush();
  }

  // ----- Inspection types of the shared catalog ("Prüfarten") -----

  /** Keys of the catalog entries used by equipment types or items (own inspections). */
  private async usage(em: EntityManager): Promise<Map<string, number>> {
    const usage = new Map<string, number>();
    const count = (keys: string[] | null | undefined) => {
      for (const key of new Set(keys ?? [])) usage.set(key, (usage.get(key) ?? 0) + 1);
    };
    for (const type of await em.find(EquipmentTypeEntity, {}, { fields: ['inspectionKeys'] })) count(type.inspectionKeys);
    for (const item of await em.find(EquipmentItemEntity, { inspectionKeys: { $ne: null } }, { fields: ['inspectionKeys'] })) count(item.inspectionKeys);
    return usage;
  }

  @Get('inspection-types')
  async inspectionTypes(): Promise<InspectionCatalogEntry[]> {
    const em = this.em.fork();
    const usage = await this.usage(em);
    return (await em.find(InspectionTypeEntity, {}, { orderBy: { key: 'asc' } })).map((t) => toInspectionType(t, usage.get(t.key) ?? 0));
  }

  @Post('inspection-types')
  @RequirePermissions(SETTINGS)
  async createInspectionType(@Body(new ZodPipe(InspectionType)) input: Parsed<typeof InspectionType>): Promise<InspectionCatalogEntry> {
    const em = this.em.fork();
    if (await em.count(InspectionTypeEntity, { key: input.key })) throw new BadRequestException({ code: 'equipment.keyTaken', key: input.key });
    const entry = em.create(InspectionTypeEntity, input);
    await em.flush();
    return toInspectionType(entry, 0);
  }

  @Put('inspection-types/:id')
  @RequirePermissions(SETTINGS)
  async updateInspectionType(@Param('id') id: string, @Body(new ZodPipe(InspectionType)) input: Parsed<typeof InspectionType>): Promise<InspectionCatalogEntry> {
    const em = this.em.fork();
    const entry = await em.findOne(InspectionTypeEntity, id);
    if (!entry) throw new NotFoundException();
    // The key is the identity: items, types and recordings refer to it.
    Object.assign(entry, { ...input, key: entry.key });
    await em.flush();
    return toInspectionType(entry, (await this.usage(em)).get(entry.key) ?? 0);
  }

  /** Deletes an inspection type of the catalog with its attachments; referenced by an equipment type or an item it is refused (`equipment.inspectionInUse`). */
  @Delete('inspection-types/:id')
  @HttpCode(204)
  @RequirePermissions(SETTINGS)
  async removeInspectionType(@Param('id') id: string): Promise<void> {
    const em = this.em.fork();
    const entry = await em.findOne(InspectionTypeEntity, id);
    if (!entry) throw new NotFoundException();
    if ((await this.usage(em)).get(entry.key)) throw new BadRequestException({ code: 'equipment.inspectionInUse', key: entry.key });
    await this.attachments.removeAll(INSPECTION_TYPE_ATTACHMENTS, entry.id);
    await em.remove(entry).flush();
  }

  // ----- Equipment types -----

  @Get('types')
  async types(): Promise<EquipmentType[]> {
    const em = this.em.fork();
    const types = await em.find(EquipmentTypeEntity, {}, { orderBy: { categoryKey: 'asc', key: 'asc' } });
    const catalog = await this.catalogOf(em, types.flatMap((t) => t.inspectionKeys));
    return types.map((t) => toType(t, catalog));
  }

  /** Inspection types by key from the catalog (unknown keys are left out). */
  private async catalogOf(em: EntityManager, keys: string[]): Promise<Map<string, InspectionType>> {
    if (!keys.length) return new Map();
    const entries = await em.find(InspectionTypeEntity, { key: { $in: [...new Set(keys)] } });
    return new Map(entries.map((t) => [t.key, toCatalogType(t)]));
  }

  /** Every key must be in the catalog (`equipment.unknownInspection`). */
  private async checkKeys(em: EntityManager, keys: string[]): Promise<void> {
    for (const key of new Set(keys)) {
      if (!(await em.count(InspectionTypeEntity, { key }))) throw new BadRequestException({ code: 'equipment.unknownInspection', key });
    }
  }

  @Post('types')
  @RequirePermissions(SETTINGS)
  async createType(@Body(new ZodPipe(EquipmentTypeInput)) input: Parsed<typeof EquipmentTypeInput>): Promise<EquipmentType> {
    const em = this.em.fork();
    if (await em.count(EquipmentTypeEntity, { key: input.key })) throw new BadRequestException({ code: 'equipment.keyTaken', key: input.key });
    if (!(await em.count(CategoryEntity, { key: input.categoryKey }))) throw new BadRequestException({ code: 'equipment.unknownCategory', key: input.categoryKey });
    await this.checkKeys(em, input.inspectionKeys);
    const type = em.create(EquipmentTypeEntity, input);
    await em.flush();
    return toType(type, await this.catalogOf(em, type.inspectionKeys));
  }

  @Put('types/:id')
  @RequirePermissions(SETTINGS)
  async updateType(@Param('id') id: string, @Body(new ZodPipe(EquipmentTypeInput)) input: Parsed<typeof EquipmentTypeInput>): Promise<EquipmentType> {
    const em = this.em.fork();
    const type = await em.findOne(EquipmentTypeEntity, id);
    if (!type) throw new NotFoundException();
    await this.checkKeys(em, input.inspectionKeys);
    Object.assign(type, { ...input, key: type.key });
    await em.flush();
    return toType(type, await this.catalogOf(em, type.inspectionKeys));
  }

  /** Deletes an equipment type; items of the type block it (`equipment.typeInUse`). Inspection types stay in the catalog. */
  @Delete('types/:id')
  @HttpCode(204)
  @RequirePermissions(SETTINGS)
  async removeType(@Param('id') id: string): Promise<void> {
    const em = this.em.fork();
    const type = await em.findOne(EquipmentTypeEntity, id);
    if (!type) throw new NotFoundException();
    if (await em.count(EquipmentItemEntity, { typeKey: type.key })) throw new BadRequestException({ code: 'equipment.typeInUse' });
    await em.remove(type).flush();
  }

  /**
   * Adds missing categories, inspection types and types of the DGUV Grundsatz 305-002 template; hoses as single items or as stock.
   * Inspection types are catalog entries, created once per key and referenced by the types.
   */
  @Post('templates/dguv')
  @RequirePermissions(SETTINGS)
  async template(@Body(new ZodPipe(TemplateOptions)) options: Parsed<typeof TemplateOptions>): Promise<{ categories: number; inspections: number; types: number }> {
    const em = this.em.fork();
    const categories = new Set((await em.find(CategoryEntity, {})).map((c) => c.key));
    const inspections = new Set((await em.find(InspectionTypeEntity, {})).map((t) => t.key));
    const types = new Set((await em.find(EquipmentTypeEntity, {})).map((t) => t.key));
    const newCategories = DGUV_CATEGORIES.map((c) => CategoryInput.parse(c.key === 'hoses' ? { ...c, tracking: options.hoseTracking } : c)).filter((c) => !categories.has(c.key));
    const newInspections = DGUV_INSPECTIONS.map((x) => InspectionType.parse(x)).filter((x) => !inspections.has(x.key));
    const newTypes = DGUV_TYPES.map((t) => EquipmentTypeInput.parse(t)).filter((t) => !types.has(t.key));
    for (const c of newCategories) em.create(CategoryEntity, c);
    for (const x of newInspections) em.create(InspectionTypeEntity, x);
    for (const t of newTypes) em.create(EquipmentTypeEntity, t);
    await em.flush();
    return { categories: newCategories.length, inspections: newInspections.length, types: newTypes.length };
  }

  /**
   * Creates an item for every vehicle of the master data that has none, so its inspections are tracked, with the
   * template type of its weight class (`vehicleTemplateType`; a missing class falls back to `fire-vehicle`). The items
   * have no dates yet: their periodic inspections are "not recorded yet" until the last inspections are entered.
   */
  @Post('vehicles/sync')
  @HttpCode(200)
  @RequirePermissions(SETTINGS)
  async syncVehicles(): Promise<{ created: number }> {
    const em = this.em.fork();
    const types = new Map((await em.find(EquipmentTypeEntity, { key: { $in: ['fire-vehicle', 'fire-vehicle-medium', 'fire-vehicle-light'] } })).map((t) => [t.key, t]));
    const heavy = types.get('fire-vehicle');
    if (!heavy) throw new BadRequestException({ code: 'equipment.vehicleTypeMissing' });
    const existing = new Set((await em.find(EquipmentItemEntity, { forVehicleId: { $ne: null } })).map((i) => i.forVehicleId));
    const vehicles = (await this.organization.vehicles()).filter((v) => !existing.has(v.id));
    for (const v of vehicles) {
      const type = types.get(vehicleTemplateType(v.vehicleType)) ?? heavy;
      em.create(EquipmentItemEntity, {
        inventoryNumber: `FZ-${v.radioCallSign || v.designation}`.replaceAll(' ', '-'),
        name: [v.designation, v.radioCallSign].filter(Boolean).join(' · '),
        typeKey: type.key,
        categoryKey: type.categoryKey,
        departmentId: v.departmentId,
        stationId: v.stationId ?? null,
        forVehicleId: v.id,
        status: 'ready',
      });
    }
    await em.flush();
    return { created: vehicles.length };
  }
}
