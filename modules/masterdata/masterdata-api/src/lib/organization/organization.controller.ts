import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Audit, type AuthenticatedUser, CurrentUser, RequirePermissions, SettingsService, ZodPipe } from '@forga/core-api';
import {
  type Department as DepartmentDto,
  DepartmentInput,
  STATISTICS_RELEVANT_TYPES,
  type Station as StationDto,
  StationInput,
  type Vehicle as VehicleDto,
  VehicleInput,
  type MembershipSettings,
} from '@forga/masterdata-contracts';
import { CatalogService } from '../catalog/catalog.js';
import { Department, Membership, OfficeAssignment, Person, Station, Vehicle } from '../masterdata.entities.js';
import { OrganizationReferenceRegistry } from './references.js';
import { requireBrigade, requireDepartment } from '../shared/access.js';

const MANAGE = 'masterdata.organization.manage';
/** Moving a department changes which departments the department-scoped roles of the parents reach (sub-departments inherit). */
const ROLES_MANAGE = 'core.roles.manage';
const sorted = (values: readonly string[]) => JSON.stringify([...values].toSorted());

type ParsedDepartment = ReturnType<typeof DepartmentInput.parse>;
type ParsedStation = ReturnType<typeof StationInput.parse>;
type ParsedVehicle = ReturnType<typeof VehicleInput.parse>;

export function toDepartmentDto(d: Department): DepartmentDto {
  return {
    id: d.id,
    name: d.name,
    shortName: d.shortName,
    type: d.type,
    parentId: d.parent?.id ?? null,
    specialTasks: d.specialTasks,
    commanderId: d.commander?.id ?? null,
    deputyIds: d.deputyIds,
    statisticsRelevant: d.statisticsRelevant ?? STATISTICS_RELEVANT_TYPES.includes(d.type),
    population: d.population ?? null,
    version: d.version,
  };
}

export function toStationDto(s: Station): StationDto {
  return {
    id: s.id,
    name: s.name,
    departmentId: s.department.id,
    street: s.street,
    postalCode: s.postalCode,
    city: s.city,
    permanentlyStaffed: s.permanentlyStaffed,
    notes: s.notes,
    version: s.version,
  };
}

export function toVehicleDto(v: Vehicle): VehicleDto {
  return {
    id: v.id,
    designation: v.designation,
    radioCallSign: v.radioCallSign,
    licensePlate: v.licensePlate,
    vehicleType: v.vehicleType,
    departmentId: v.department.id,
    stationId: v.station?.id ?? null,
    seats: v.seats,
    yearBuilt: v.yearBuilt ?? null,
    commissionedOn: v.commissionedOn ?? null,
    decommissionedOn: v.decommissionedOn ?? null,
    costRecoveryCategory: v.costRecoveryCategory ?? null,
    statisticsCategory: v.statisticsCategory,
    status: v.status,
    notes: v.notes,
    version: v.version,
  };
}

/** The organization structure is visible to every authenticated user; changes need `masterdata.organization.manage`. */
@Controller('masterdata')
export class OrganizationController {
  constructor(
    private readonly em: EntityManager,
    private readonly catalogs: CatalogService,
    private readonly references: OrganizationReferenceRegistry,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
  ) {}

  @Get('departments')
  async departments(): Promise<DepartmentDto[]> {
    const list = await this.em.fork().find(Department, {}, { orderBy: { name: 'asc' } });
    return list.map(toDepartmentDto);
  }

  /** New departments can only be created brigade-wide. */
  @Post('departments')
  @RequirePermissions(MANAGE)
  async createDepartment(
    @Body(new ZodPipe(DepartmentInput)) input: ParsedDepartment,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DepartmentDto> {
    requireBrigade(user, MANAGE);
    const em = this.em.fork();
    const department = em.create(Department, await this.departmentFields(em, input, null));
    await em.flush();
    return toDepartmentDto(department);
  }

  @Put('departments/:id')
  @RequirePermissions(MANAGE)
  async updateDepartment(
    @Param('id') id: string,
    @Body(new ZodPipe(DepartmentInput)) input: ParsedDepartment,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<DepartmentDto> {
    requireDepartment(user, MANAGE, id);
    const em = this.em.fork();
    const department = await em.findOne(Department, id);
    if (!department) throw new NotFoundException();
    // Structure and statistics are a matter of the whole brigade: with the permission for the own department only,
    // name, short name, commander and deputies may change.
    let fields = input;
    if (user.grant(MANAGE) !== 'brigade') {
      const stored = {
        type: department.type,
        parentId: department.parent?.id ?? null,
        specialTasks: department.specialTasks,
        statisticsRelevant: department.statisticsRelevant ?? null,
        population: department.population ?? null,
      };
      const relevant = (value: boolean | null) => value ?? STATISTICS_RELEVANT_TYPES.includes(department.type);
      const changed = [
        input.type !== stored.type && 'type',
        input.parentId !== stored.parentId && 'parentId',
        sorted(input.specialTasks) !== sorted(stored.specialTasks) && 'specialTasks',
        relevant(input.statisticsRelevant) !== relevant(stored.statisticsRelevant) && 'statisticsRelevant',
        input.population !== stored.population && 'population',
      ].filter((field): field is string => Boolean(field));
      if (changed.length) throw new ForbiddenException({ code: 'masterdata.departmentFieldsBrigadeOnly', fields: changed, permissions: [MANAGE] });
      fields = { ...input, ...stored };
    }
    // Sub-departments inherit the department-scoped roles of their parents: another parent widens or narrows them,
    // also for rights the user does not hold. So it needs the right to manage roles as well and is logged.
    const previousParent = department.parent?.id ?? null;
    const moved = fields.parentId !== previousParent;
    if (moved && user.needsStepUp(ROLES_MANAGE)) throw user.stepUpRequired();
    if (moved && !user.can(ROLES_MANAGE)) throw new ForbiddenException({ code: 'masterdata.departmentMoveNeedsRoles', permissions: [MANAGE, ROLES_MANAGE] });
    em.assign(department, await this.departmentFields(em, fields, id));
    await em.flush();
    if (moved) await this.audit.log('masterdata.department-moved', { departmentId: id, name: department.name, from: previousParent, to: fields.parentId });
    return toDepartmentDto(department);
  }

  /**
   * Deletes an unused department: no sub-departments, no memberships (also past ones), no stations and vehicles,
   * no references in other modules (reports, role assignments). Otherwise `409` with the reason.
   */
  @Delete('departments/:id')
  @HttpCode(204)
  @RequirePermissions(MANAGE)
  async deleteDepartment(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    requireBrigade(user, MANAGE);
    const em = this.em.fork();
    const department = await em.findOne(Department, id);
    if (!department) throw new NotFoundException();
    const blockers: [string, number][] = [
      ['masterdata.departmentHasChildren', await em.count(Department, { parent: department })],
      ['masterdata.departmentHasMembers', await em.count(Membership, { department })],
      ['masterdata.departmentHasStations', await em.count(Station, { department })],
      ['masterdata.departmentHasVehicles', await em.count(Vehicle, { department })],
      ['masterdata.departmentHasOffices', await em.count(OfficeAssignment, { departmentId: id })],
    ];
    const blocker = blockers.find(([, count]) => count > 0);
    if (blocker) throw new ConflictException({ code: blocker[0], count: blocker[1] });
    await this.references.assertUnused('department', id);
    await em.remove(department).flush();
  }

  @Get('stations')
  async stations(@Query('departmentId') departmentId?: string): Promise<StationDto[]> {
    const list = await this.em
      .fork()
      .find(Station, departmentId ? { department: departmentId } : {}, { orderBy: { name: 'asc' } });
    return list.map(toStationDto);
  }

  @Post('stations')
  @RequirePermissions(MANAGE)
  async createStation(
    @Body(new ZodPipe(StationInput)) input: ParsedStation,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StationDto> {
    requireDepartment(user, MANAGE, input.departmentId);
    const em = this.em.fork();
    const { departmentId, ...rest } = input;
    const station = em.create(Station, { ...rest, department: await this.department(em, departmentId) });
    await em.flush();
    return toStationDto(station);
  }

  @Put('stations/:id')
  @RequirePermissions(MANAGE)
  async updateStation(
    @Param('id') id: string,
    @Body(new ZodPipe(StationInput)) input: ParsedStation,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StationDto> {
    const em = this.em.fork();
    const station = await em.findOne(Station, id);
    if (!station) throw new NotFoundException();
    requireDepartment(user, MANAGE, station.department.id);
    requireDepartment(user, MANAGE, input.departmentId);
    const { departmentId, ...rest } = input;
    em.assign(station, { ...rest, department: await this.department(em, departmentId) });
    await em.flush();
    return toStationDto(station);
  }

  /** Deletes a station nobody refers to; vehicles of the station block the deletion. */
  @Delete('stations/:id')
  @HttpCode(204)
  @RequirePermissions(MANAGE)
  async deleteStation(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const em = this.em.fork();
    const station = await em.findOne(Station, id);
    if (!station) throw new NotFoundException();
    requireDepartment(user, MANAGE, station.department.id);
    const vehicles = await em.count(Vehicle, { station });
    if (vehicles) throw new ConflictException({ code: 'masterdata.stationHasVehicles', count: vehicles });
    await this.references.assertUnused('station', id);
    await em.remove(station).flush();
  }

  @Get('vehicles')
  async vehicles(
    @Query('departmentId') departmentId?: string,
    @Query('includeRetired') includeRetired?: string,
  ): Promise<VehicleDto[]> {
    const where = {
      ...(departmentId ? { department: departmentId } : {}),
      ...(includeRetired === 'true' ? {} : { status: { $ne: 'retired' as const } }),
    };
    const list = await this.em.fork().find(Vehicle, where, { orderBy: { designation: 'asc' } });
    return list.map(toVehicleDto);
  }

  @Post('vehicles')
  @RequirePermissions(MANAGE)
  async createVehicle(
    @Body(new ZodPipe(VehicleInput)) input: ParsedVehicle,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VehicleDto> {
    requireDepartment(user, MANAGE, input.departmentId);
    const em = this.em.fork();
    const vehicle = em.create(Vehicle, await this.vehicleFields(em, input));
    await em.flush();
    return toVehicleDto(vehicle);
  }

  @Put('vehicles/:id')
  @RequirePermissions(MANAGE)
  async updateVehicle(
    @Param('id') id: string,
    @Body(new ZodPipe(VehicleInput)) input: ParsedVehicle,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<VehicleDto> {
    const em = this.em.fork();
    const vehicle = await em.findOne(Vehicle, id);
    if (!vehicle) throw new NotFoundException();
    requireDepartment(user, MANAGE, vehicle.department.id);
    requireDepartment(user, MANAGE, input.departmentId);
    em.assign(vehicle, await this.vehicleFields(em, input));
    await em.flush();
    return toVehicleDto(vehicle);
  }

  /** Deletes a vehicle that was never used; a used vehicle is retired instead (`status: retired`). */
  @Delete('vehicles/:id')
  @HttpCode(204)
  @RequirePermissions(MANAGE)
  async deleteVehicle(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const em = this.em.fork();
    const vehicle = await em.findOne(Vehicle, id);
    if (!vehicle) throw new NotFoundException();
    requireDepartment(user, MANAGE, vehicle.department.id);
    await this.references.assertUnused('vehicle', id);
    await em.remove(vehicle).flush();
  }

  private async department(em: EntityManager, id: string): Promise<Department> {
    const department = await em.findOne(Department, id);
    if (!department) throw new BadRequestException({ code: 'masterdata.unknownDepartment', departmentId: id });
    return department;
  }

  private async departmentFields(em: EntityManager, input: ParsedDepartment, ownId: string | null) {
    const { parentId, commanderId, deputyIds, ...rest } = input;
    if (parentId && parentId === ownId) throw new BadRequestException({ code: 'masterdata.departmentOwnParent' });
    if (parentId && ownId) await this.assertNoCycle(em, ownId, parentId);
    // Short names appear wherever space is short (lists, badges), so they must tell the departments apart.
    const sameShortName = await em.findOne(Department, { shortName: { $ilike: input.shortName }, ...(ownId ? { id: { $ne: ownId } } : {}) });
    const own = ownId ? await em.findOne(Department, ownId) : null;
    if (sameShortName && own?.shortName.toLowerCase() !== input.shortName.toLowerCase()) {
      throw new ConflictException({ code: 'masterdata.shortNameTaken', shortName: input.shortName, department: sameShortName.name });
    }
    const rules = (await this.settings.get<MembershipSettings>('masterdata.membership')) as MembershipSettings;
    if (deputyIds.length > rules.maxDeputies) throw new BadRequestException({ code: 'masterdata.tooManyDeputies', max: rules.maxDeputies });
    const personIds = [...(commanderId ? [commanderId] : []), ...deputyIds];
    if (personIds.length && (await em.count(Person, { id: { $in: personIds } })) !== new Set(personIds).size) {
      throw new BadRequestException({ code: 'masterdata.unknownPerson' });
    }
    return {
      ...rest,
      deputyIds,
      parent: parentId ? await this.department(em, parentId) : null,
      commander: commanderId ? em.getReference(Person, commanderId) : null,
    };
  }

  /** Refuses a parent that lies below the department (directly or further down), which would form a cycle. */
  private async assertNoCycle(em: EntityManager, ownId: string, parentId: string): Promise<void> {
    const parents = new Map((await em.find(Department, {}, { fields: ['id', 'parent'] })).map((d) => [d.id, d.parent?.id ?? null]));
    const seen = new Set<string>();
    for (let current: string | null = parentId; current; current = parents.get(current) ?? null) {
      if (current === ownId || seen.has(current)) throw new BadRequestException({ code: 'masterdata.departmentCycle' });
      seen.add(current);
    }
  }

  /** Seats and statistics category default to the values of the vehicle type. */
  private async vehicleFields(em: EntityManager, input: ParsedVehicle) {
    const type = await this.catalogs.requireKey('vehicle-type', input.vehicleType, em);
    const statisticsCategory = input.statisticsCategory ?? (type.attributes['statisticsCategory'] as string | null);
    if (!statisticsCategory) throw new BadRequestException({ code: 'masterdata.statisticsCategoryRequired' });
    const { departmentId, stationId, ...rest } = input;
    const station = stationId ? await em.findOne(Station, stationId) : null;
    if (stationId && !station) throw new BadRequestException({ code: 'masterdata.unknownStation', stationId });
    return {
      ...rest,
      seats: input.seats ?? Number(type.attributes['seats'] ?? 0),
      statisticsCategory,
      department: await this.department(em, departmentId),
      station,
    };
  }
}
