import { BadRequestException, Body, ConflictException, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, Put, Query } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { type AuthenticatedUser, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import { type DepartmentGroup as DepartmentGroupDto, DepartmentGroupInput } from '@forga/masterdata-contracts';
import { Department, Person } from '../masterdata.entities.js';
import { activeMemberships, READ } from '../persons/persons.service.js';
import { requireDepartment } from '../shared/access.js';
import { DepartmentGroup } from './group.entities.js';

const MANAGE = 'masterdata.organization.manage';
type ParsedGroup = ReturnType<typeof DepartmentGroupInput.parse>;

const toDto = (g: DepartmentGroup): DepartmentGroupDto => ({
  id: g.id,
  departmentId: g.department.id,
  name: g.name,
  leaderId: g.leader?.id ?? null,
  memberIds: g.memberIds,
  version: g.version,
});

/**
 * Groups within a department ("Gruppe als Einheit"). Who may read persons of the department sees its groups,
 * a group leader also sees the own group; department commanders (`masterdata.organization.manage`) maintain them.
 */
@Controller('masterdata/groups')
export class GroupsController {
  constructor(private readonly em: EntityManager) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser, @Query('departmentId') departmentId?: string): Promise<DepartmentGroupDto[]> {
    const grant = user.grant(READ);
    const visible: FilterQuery<DepartmentGroup>[] = [];
    if (grant === 'brigade') visible.push({});
    else if (grant?.length) visible.push({ department: { $in: grant } });
    if (user.personId) visible.push({ leader: user.personId });
    if (!visible.length) return [];
    const where: FilterQuery<DepartmentGroup> = { $and: [{ $or: visible }, ...(departmentId ? [{ department: departmentId }] : [])] };
    const groups = await this.em.fork().find(DepartmentGroup, where, { orderBy: { name: 'asc' } });
    return groups.map(toDto);
  }

  /** The groups the user leads ("Meine Gruppe"). */
  @Get('mine')
  async mine(@CurrentUser() user: AuthenticatedUser): Promise<DepartmentGroupDto[]> {
    if (!user.personId) return [];
    const groups = await this.em.fork().find(DepartmentGroup, { leader: user.personId }, { orderBy: { name: 'asc' } });
    return groups.map(toDto);
  }

  @Post()
  @RequirePermissions(MANAGE)
  async create(@Body(new ZodPipe(DepartmentGroupInput)) input: ParsedGroup, @CurrentUser() user: AuthenticatedUser): Promise<DepartmentGroupDto> {
    requireDepartment(user, MANAGE, input.departmentId);
    const em = this.em.fork();
    const group = em.create(DepartmentGroup, await this.fields(em, input, null));
    await em.flush();
    return toDto(group);
  }

  @Put(':id')
  @RequirePermissions(MANAGE)
  async update(@Param('id') id: string, @Body(new ZodPipe(DepartmentGroupInput)) input: ParsedGroup, @CurrentUser() user: AuthenticatedUser): Promise<DepartmentGroupDto> {
    const em = this.em.fork();
    const group = await em.findOne(DepartmentGroup, id);
    if (!group) throw new NotFoundException();
    requireDepartment(user, MANAGE, group.department.id);
    if (input.departmentId !== group.department.id) throw new BadRequestException({ code: 'masterdata.groupDepartmentImmutable' });
    em.assign(group, await this.fields(em, input, id));
    await em.flush();
    return toDto(group);
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(MANAGE)
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const em = this.em.fork();
    const group = await em.findOne(DepartmentGroup, id);
    if (!group) throw new NotFoundException();
    requireDepartment(user, MANAGE, group.department.id);
    await em.remove(group).flush();
  }

  /** Leader and members must be current members of the department; the name is unique within it. */
  private async fields(em: EntityManager, input: ParsedGroup, ownId: string | null) {
    const department = await em.findOne(Department, input.departmentId);
    if (!department) throw new BadRequestException({ code: 'masterdata.unknownDepartment' });
    const taken = await em.findOne(DepartmentGroup, { department, name: { $ilike: input.name } });
    if (taken && taken.id !== ownId) throw new ConflictException({ code: 'masterdata.groupNameTaken', name: input.name });
    const memberIds = [...new Set(input.memberIds)];
    const ids = [...new Set([...memberIds, ...(input.leaderId ? [input.leaderId] : [])])];
    const persons = await em.find(Person, { id: { $in: ids } }, { populate: ['memberships.department'] });
    const outside = ids.filter((id) => !persons.find((p) => p.id === id && activeMemberships(p).some((m) => m.department.id === department.id)));
    if (outside.length) throw new BadRequestException({ code: 'masterdata.groupMemberNotInDepartment', count: outside.length });
    return {
      department,
      name: input.name,
      leader: input.leaderId ? em.getReference(Person, input.leaderId) : null,
      memberIds,
    };
  }
}
