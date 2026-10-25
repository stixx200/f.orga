import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type Permission, type Role as RoleDto, RoleInput } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { ZodPipe } from '../zod.pipe.js';
import { assertAdministratorRemains } from './administrators.js';
import { AuthService } from './auth.service.js';
import { type AuthenticatedUser, widerThan } from './authenticated-user.js';
import { CurrentUser, RequirePermissions } from './decorators.js';
import { PermissionRegistry } from './permission-registry.js';
import { type MergedRoleTemplate, RoleTemplates } from './role-templates.js';
import { Role } from './security.entities.js';

type ParsedRoleInput = ReturnType<typeof RoleInput.parse>;

function toRoleDto(role: Role): RoleDto {
  return {
    id: role.id,
    templateKey: role.templateKey ?? null,
    name: role.name,
    description: role.description,
    permissions: role.permissions,
    permissionsAllDepartments: role.permissionsAllDepartments ?? [],
    version: role.version,
  };
}

@Controller('core')
export class RolesController {
  constructor(
    private readonly em: EntityManager,
    private readonly registry: PermissionRegistry,
    private readonly audit: Audit,
    private readonly templates: RoleTemplates,
    private readonly auth: AuthService,
  ) {}

  /** All permissions of core and installed modules, for the role editor and the scopes of API tokens. */
  @Get('permissions')
  permissions(@CurrentUser() user: AuthenticatedUser): readonly Permission[] {
    if (!user.can('core.roles.manage') && !user.can('core.tokens.manage')) {
      throw new ForbiddenException({ code: 'auth.forbidden', permissions: ['core.roles.manage', 'core.tokens.manage'] });
    }
    return this.registry.all;
  }

  /** Standard roles of core and modules, e.g. to show what a missing role would contain. */
  @Get('roles/templates')
  @RequirePermissions('core.roles.manage')
  roleTemplates(): MergedRoleTemplate[] {
    return this.templates.all;
  }

  /** Creates the standard roles that do not exist yet, e.g. after a module was added. */
  @Post('roles/templates')
  @RequirePermissions('core.roles.manage')
  async createTemplateRoles(@CurrentUser() user: AuthenticatedUser): Promise<{ created: string[]; skipped: string[] }> {
    const result = await this.templates.createMissing(this.em.fork(), user.language);
    await this.audit.log('roles.templates-created', result);
    return result;
  }

  /** Readable for role editing and for assigning roles to users. */
  @Get('roles')
  async list(): Promise<RoleDto[]> {
    const roles = await this.em.fork().find(Role, {}, { orderBy: { name: 'asc' } });
    return roles.map(toRoleDto);
  }

  @Post('roles')
  @RequirePermissions('core.roles.manage')
  async create(@Body(new ZodPipe(RoleInput)) input: ParsedRoleInput, @CurrentUser() current: AuthenticatedUser): Promise<RoleDto> {
    this.validate(input);
    await this.assertNotWider(current, input.permissions, input.permissionsAllDepartments);
    const em = this.em.fork();
    if (await em.count(Role, { name: input.name })) throw new ConflictException({ code: 'roles.nameTaken' });
    const role = em.create(Role, input);
    await em.flush();
    await this.audit.log('roles.created', { roleId: role.id, permissions: role.permissions, permissionsAllDepartments: role.permissionsAllDepartments });
    return toRoleDto(role);
  }

  @Put('roles/:id')
  @RequirePermissions('core.roles.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(RoleInput)) input: ParsedRoleInput, @CurrentUser() current: AuthenticatedUser): Promise<RoleDto> {
    this.validate(input);
    const role = await this.em.fork().transactional(async (em) => {
      const role = await em.findOne(Role, id);
      if (!role) throw new NotFoundException();
      await this.assertNotWider(
        current,
        input.permissions.filter((p) => !role.permissions.includes(p)),
        input.permissionsAllDepartments.filter((p) => !(role.permissionsAllDepartments ?? []).includes(p)),
      );
      if (input.name !== role.name && (await em.count(Role, { name: input.name }))) {
        throw new ConflictException({ code: 'roles.nameTaken' });
      }
      em.assign(role, input);
      await em.flush();
      // Taking `*` from the role of the last administrator would leave nobody to manage f.orga.
      await assertAdministratorRemains(em);
      return role;
    });
    await this.audit.log('roles.updated', { roleId: role.id, permissions: role.permissions, permissionsAllDepartments: role.permissionsAllDepartments });
    return toRoleDto(role);
  }

  /** Sets the permissions of a standard role back to its template (e.g. after an update brought new defaults). */
  @Post('roles/:id/apply-template')
  @HttpCode(200)
  @RequirePermissions('core.roles.manage')
  async applyTemplate(@Param('id') id: string, @CurrentUser() current: AuthenticatedUser): Promise<RoleDto> {
    const { role, template } = await this.em.fork().transactional(async (em) => {
      const role = await em.findOne(Role, id);
      if (!role) throw new NotFoundException();
      const template = this.templates.all.find((t) => t.key === role.templateKey);
      if (!template) throw new BadRequestException({ code: 'roles.noTemplate' });
      await this.assertNotWider(
        current,
        template.permissions.filter((p) => !role.permissions.includes(p)),
        template.permissionsAllDepartments.filter((p) => !(role.permissionsAllDepartments ?? []).includes(p)),
      );
      role.permissions = template.permissions;
      role.permissionsAllDepartments = template.permissionsAllDepartments;
      await em.flush();
      await assertAdministratorRemains(em);
      return { role, template };
    });
    await this.audit.log('roles.template-applied', { roleId: role.id, templateKey: template.key });
    return toRoleDto(role);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermissions('core.roles.manage')
  async remove(@Param('id') id: string, @CurrentUser() current: AuthenticatedUser): Promise<void> {
    const role = await this.em.fork().transactional(async (em) => {
      const role = await em.findOne(Role, id);
      if (!role) throw new NotFoundException();
      // Deleting a role takes its permissions from its users: only for roles within the own permissions.
      await this.assertNotWider(current, role.permissions, role.permissionsAllDepartments ?? []);
      await em.remove(role).flush();
      await assertAdministratorRemains(em);
      return role;
    });
    await this.audit.log('roles.deleted', { roleId: id, name: role.name });
  }

  /** Permissions added to a role must be held brigade-wide by whoever edits it (no self-promotion via roles). */
  private async assertNotWider(current: AuthenticatedUser, patterns: string[], allDepartments: string[]): Promise<void> {
    const grants = await this.auth.grantsFor([{ role: { permissions: [...patterns, ...allDepartments], permissionsAllDepartments: [] }, departmentId: null }]);
    const wider = widerThan(current, grants);
    if (wider.length) throw new ForbiddenException({ code: 'users.roleWider', permissions: wider });
  }

  private validate(input: ParsedRoleInput): void {
    const unknown = [...input.permissions, ...input.permissionsAllDepartments].filter((p) => !this.registry.isValidPattern(p));
    if (unknown.length) throw new BadRequestException({ code: 'roles.unknownPermissions', permissions: unknown });
  }
}
