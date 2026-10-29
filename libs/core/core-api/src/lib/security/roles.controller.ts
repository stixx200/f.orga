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
import { type LocalizedText, type Permission, type Role as RoleDto, RoleInput } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { ZodPipe } from '../zod.pipe.js';
import { assertAdministratorRemains } from './administrators.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CurrentUser, RequirePermissions } from './decorators.js';
import { PermissionRegistry } from './permission-registry.js';
import { type MergedRoleTemplate, roleNames, RoleTemplates } from './role-templates.js';
import { Role } from './security.entities.js';

type ParsedRoleInput = ReturnType<typeof RoleInput.parse>;

function toRoleDto(role: Role): RoleDto {
  return {
    id: role.id,
    templateKey: role.templateKey ?? null,
    name: role.name,
    description: role.description ?? { de: '', en: '' },
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
    if (!user.can('core.roles.manage') && !user.can('core.tokens.manage')) throw user.denied(['core.roles.manage', 'core.tokens.manage']);
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
  async createTemplateRoles(): Promise<{ created: string[]; skipped: string[] }> {
    const result = await this.templates.createMissing(this.em.fork());
    await this.audit.log('roles.templates-created', result);
    return result;
  }

  /**
   * Readable for role editing and for assigning roles to users only: the roles with their permissions show who may do
   * what, which other users do not need to know.
   */
  @Get('roles')
  async list(@CurrentUser() user: AuthenticatedUser): Promise<RoleDto[]> {
    if (!user.can('core.roles.manage') && !user.can('core.users.manage')) throw user.denied(['core.roles.manage', 'core.users.manage']);
    const roles = await this.em.fork().find(Role, {});
    return roles.map(toRoleDto).toSorted((a, b) => a.name.de.localeCompare(b.name.de, 'de'));
  }

  @Post('roles')
  @RequirePermissions('core.roles.manage')
  async create(@Body(new ZodPipe(RoleInput)) input: ParsedRoleInput, @CurrentUser() current: AuthenticatedUser): Promise<RoleDto> {
    this.validate(input);
    await this.assertNotWider(current, input.permissions, input.permissionsAllDepartments);
    const em = this.em.fork();
    await this.assertNameFree(em, input.name, null);
    const role = em.create(Role, input);
    await em.flush();
    await this.audit.log('roles.created', { roleId: role.id, permissions: role.permissions, permissionsAllDepartments: role.permissionsAllDepartments });
    return toRoleDto(role);
  }

  @Put('roles/:id')
  @RequirePermissions('core.roles.manage')
  async update(@Param('id') id: string, @Body(new ZodPipe(RoleInput)) input: ParsedRoleInput, @CurrentUser() current: AuthenticatedUser): Promise<RoleDto> {
    this.validate(input);
    const saved = await this.em.fork().transactional(async (em) => {
      const role = await em.findOne(Role, id);
      if (!role) throw new NotFoundException();
      await this.assertNotWider(
        current,
        input.permissions.filter((p) => !role.permissions.includes(p)),
        input.permissionsAllDepartments.filter((p) => !(role.permissionsAllDepartments ?? []).includes(p)),
      );
      await this.assertNameFree(em, input.name, role.id);
      em.assign(role, input);
      await em.flush();
      // Taking `*` from the role of the last administrator would leave nobody to manage f.orga.
      await assertAdministratorRemains(em);
      return role;
    });
    await this.audit.log('roles.updated', { roleId: saved.id, permissions: saved.permissions, permissionsAllDepartments: saved.permissionsAllDepartments });
    return toRoleDto(saved);
  }

  /** Sets the permissions of a standard role back to its template (e.g. after an update brought new defaults). */
  @Post('roles/:id/apply-template')
  @HttpCode(200)
  @RequirePermissions('core.roles.manage')
  async applyTemplate(@Param('id') id: string, @CurrentUser() current: AuthenticatedUser): Promise<RoleDto> {
    const applied = await this.em.fork().transactional(async (em) => {
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
    await this.audit.log('roles.template-applied', { roleId: applied.role.id, templateKey: applied.template.key });
    return toRoleDto(applied.role);
  }

  @Delete('roles/:id')
  @HttpCode(204)
  @RequirePermissions('core.roles.manage')
  async remove(@Param('id') id: string, @CurrentUser() current: AuthenticatedUser): Promise<void> {
    const removed = await this.em.fork().transactional(async (em) => {
      const role = await em.findOne(Role, id);
      if (!role) throw new NotFoundException();
      // Deleting a role takes its permissions from its users: only for roles within the own permissions.
      await this.assertNotWider(current, role.permissions, role.permissionsAllDepartments ?? []);
      await em.remove(role).flush();
      await assertAdministratorRemains(em);
      return role;
    });
    await this.audit.log('roles.deleted', { roleId: id, name: removed.name });
  }

  /** Permissions added to a role must be held brigade-wide by whoever edits it (no self-promotion via roles). */
  private async assertNotWider(current: AuthenticatedUser, patterns: string[], allDepartments: string[]): Promise<void> {
    const wider = await this.auth.widerThanActor(current, [{ role: { permissions: [...patterns, ...allDepartments], permissionsAllDepartments: [] }, departmentId: null }]);
    if (wider.length) throw new ForbiddenException({ code: 'users.roleWider', permissions: wider });
  }

  /** A role name is unique in every language, ignoring case (users choose roles by name). */
  private async assertNameFree(em: EntityManager, name: LocalizedText, exceptId: string | null): Promise<void> {
    const wanted = roleNames(name);
    const others = await em.find(Role, exceptId ? { id: { $ne: exceptId } } : {});
    if (others.some((r) => roleNames(r.name).some((n) => wanted.includes(n)))) throw new ConflictException({ code: 'roles.nameTaken' });
  }

  private validate(input: ParsedRoleInput): void {
    const unknown = [...input.permissions, ...input.permissionsAllDepartments].filter((p) => !this.registry.isValidPattern(p));
    if (unknown.length) throw new BadRequestException({ code: 'roles.unknownPermissions', permissions: unknown });
  }
}
