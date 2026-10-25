import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, NotFoundException, Param, Post, Put } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { z } from 'zod';
import { RequirePermissions, ZodPipe } from '@forga/core-api';
import { type Category, CategoryInput, DGUV_CATEGORIES, DGUV_TYPES, type EquipmentType, EquipmentTypeInput, LIGHT_VEHICLE_TYPES, TemplateOptions } from '@forga/equipment-contracts';
import { ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import { CategoryEntity, EquipmentItemEntity, EquipmentTypeEntity } from '../equipment.entities.js';

type Parsed<T extends z.ZodType> = z.infer<T>;
const SETTINGS = 'equipment.settings.manage';

const toCategory = (c: CategoryEntity): Category => ({ id: c.id, key: c.key, name: c.name, parentKey: c.parentKey ?? null, tracking: c.tracking, breathingApparatus: c.breathingApparatus, lockWhenOverdue: c.lockWhenOverdue, version: c.version });
const toType = (t: EquipmentTypeEntity): EquipmentType => ({ id: t.id, key: t.key, name: t.name, categoryKey: t.categoryKey, manufacturer: t.manufacturer, model: t.model, inspections: t.inspections, properties: t.properties, version: t.version });

/** Categories and equipment types (with inspection types); DGUV 305-002 template; vehicles from the master data. */
@Controller('equipment')
export class CatalogController {
  constructor(
    private readonly em: EntityManager,
    @Inject(ORGANIZATION) private readonly organization: Organization,
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

  @Delete('categories/:id')
  @HttpCode(204)
  @RequirePermissions(SETTINGS)
  async removeCategory(@Param('id') id: string): Promise<void> {
    const em = this.em.fork();
    const category = await em.findOne(CategoryEntity, id);
    if (!category) throw new NotFoundException();
    if (await em.count(EquipmentItemEntity, { categoryKey: category.key })) throw new BadRequestException({ code: 'equipment.categoryInUse' });
    await em.remove(category).flush();
  }

  @Get('types')
  async types(): Promise<EquipmentType[]> {
    return (await this.em.fork().find(EquipmentTypeEntity, {}, { orderBy: { categoryKey: 'asc', key: 'asc' } })).map(toType);
  }

  @Post('types')
  @RequirePermissions(SETTINGS)
  async createType(@Body(new ZodPipe(EquipmentTypeInput)) input: Parsed<typeof EquipmentTypeInput>): Promise<EquipmentType> {
    const em = this.em.fork();
    if (await em.count(EquipmentTypeEntity, { key: input.key })) throw new BadRequestException({ code: 'equipment.keyTaken', key: input.key });
    if (!(await em.count(CategoryEntity, { key: input.categoryKey }))) throw new BadRequestException({ code: 'equipment.unknownCategory', key: input.categoryKey });
    const type = em.create(EquipmentTypeEntity, input);
    await em.flush();
    return toType(type);
  }

  @Put('types/:id')
  @RequirePermissions(SETTINGS)
  async updateType(@Param('id') id: string, @Body(new ZodPipe(EquipmentTypeInput)) input: Parsed<typeof EquipmentTypeInput>): Promise<EquipmentType> {
    const em = this.em.fork();
    const type = await em.findOne(EquipmentTypeEntity, id);
    if (!type) throw new NotFoundException();
    Object.assign(type, { ...input, key: type.key });
    await em.flush();
    return toType(type);
  }

  /** Adds missing categories and types of the DGUV Grundsatz 305-002 template; hoses as single items or as stock. */
  @Post('templates/dguv')
  @RequirePermissions(SETTINGS)
  async template(@Body(new ZodPipe(TemplateOptions)) options: Parsed<typeof TemplateOptions>): Promise<{ categories: number; types: number }> {
    const em = this.em.fork();
    const categories = new Set((await em.find(CategoryEntity, {})).map((c) => c.key));
    const types = new Set((await em.find(EquipmentTypeEntity, {})).map((t) => t.key));
    const newCategories = DGUV_CATEGORIES.map((c) => CategoryInput.parse(c.key === 'hoses' ? { ...c, tracking: options.hoseTracking } : c)).filter((c) => !categories.has(c.key));
    const newTypes = DGUV_TYPES.map((t) => EquipmentTypeInput.parse(t)).filter((t) => !types.has(t.key));
    for (const c of newCategories) em.create(CategoryEntity, c);
    for (const t of newTypes) em.create(EquipmentTypeEntity, t);
    await em.flush();
    return { categories: newCategories.length, types: newTypes.length };
  }

  /**
   * Creates an item of type "fire vehicle" for every vehicle of the master data that has none, so its inspections are
   * tracked; command cars and crew vans (`LIGHT_VEHICLE_TYPES`) get the type for vehicles up to 3.5 t, if it exists.
   */
  @Post('vehicles/sync')
  @HttpCode(200)
  @RequirePermissions(SETTINGS)
  async syncVehicles(): Promise<{ created: number }> {
    const em = this.em.fork();
    const heavy = await em.findOne(EquipmentTypeEntity, { key: 'fire-vehicle' });
    if (!heavy) throw new BadRequestException({ code: 'equipment.vehicleTypeMissing' });
    const light = (await em.findOne(EquipmentTypeEntity, { key: 'fire-vehicle-light' })) ?? heavy;
    const existing = new Set((await em.find(EquipmentItemEntity, { forVehicleId: { $ne: null } })).map((i) => i.forVehicleId));
    const vehicles = (await this.organization.vehicles()).filter((v) => !existing.has(v.id));
    for (const v of vehicles) {
      const type = LIGHT_VEHICLE_TYPES.includes(v.vehicleType) ? light : heavy;
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
