import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type User as UserDto, UserInput } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { ZodPipe } from '../zod.pipe.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CurrentUser, RequirePermissions } from './decorators.js';
import { hashPassword } from './password.js';
import { Role, RoleAssignment, Session, User } from './security.entities.js';
import { computeGrants, widerThan } from './authenticated-user.js';
import { PermissionRegistry } from './permission-registry.js';

type ParsedUserInput = ReturnType<typeof UserInput.parse>;

export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email ?? null,
    personId: user.personId ?? null,
    language: user.language,
    receiveDigest: user.receiveDigest,
    active: user.active,
    technical: user.technical,
    lastLogin: user.lastLogin?.toISOString() ?? null,
    oidcLinked: Boolean(user.oidcSubject),
    roles: user.roles.getItems().map((a) => ({ roleId: a.role.id, departmentId: a.departmentId ?? null })),
    version: user.version,
  };
}

@Controller('core/users')
@RequirePermissions('core.users.manage')
export class UsersController {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: Audit,
    private readonly permissions: PermissionRegistry,
  ) {}

  @Get()
  async list(): Promise<UserDto[]> {
    const users = await this.em
      .fork()
      .find(User, { technical: false }, { populate: ['roles.role'], orderBy: { displayName: 'asc' } });
    return users.map(toUserDto);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<UserDto> {
    const user = await this.em.fork().findOne(User, { id, technical: false }, { populate: ['roles.role'] });
    if (!user) throw new NotFoundException();
    return toUserDto(user);
  }

  @Post()
  async create(@Body(new ZodPipe(UserInput)) input: ParsedUserInput, @CurrentUser() current: AuthenticatedUser): Promise<UserDto> {
    if (!input.password) throw new BadRequestException({ code: 'users.passwordRequired' });
    const em = this.em.fork();
    await this.assertNotWider(em, current, input.roles);
    if (await em.count(User, { username: input.username })) {
      throw new ConflictException({ code: 'users.usernameTaken' });
    }
    const user = em.create(User, {
      username: input.username,
      displayName: input.displayName,
      email: input.email,
      personId: input.personId,
      language: input.language,
      receiveDigest: input.receiveDigest,
      active: input.active,
      passwordHash: await hashPassword(input.password),
    });
    await this.assignRoles(em, user, input.roles);
    await em.flush();
    await this.audit.log('users.created', { userId: user.id, roles: input.roles });
    return toUserDto(user);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodPipe(UserInput)) input: ParsedUserInput,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<UserDto> {
    const em = this.em.fork();
    const user = await em.findOne(User, { id, technical: false }, { populate: ['roles.role'] });
    if (!user) throw new NotFoundException();
    if (user.id === current.id && !input.active) throw new BadRequestException({ code: 'users.cannotDeactivateSelf' });
    const existing = new Set(user.roles.getItems().map((a) => `${a.role.id}|${a.departmentId ?? ''}`));
    await this.assertNotWider(em, current, input.roles.filter((r) => !existing.has(`${r.roleId}|${r.departmentId ?? ''}`)));
    if (input.username !== user.username && (await em.count(User, { username: input.username }))) {
      throw new ConflictException({ code: 'users.usernameTaken' });
    }

    em.assign(user, {
      username: input.username,
      displayName: input.displayName,
      email: input.email,
      personId: input.personId,
      language: input.language,
      receiveDigest: input.receiveDigest,
      active: input.active,
    });
    if (input.password) user.passwordHash = await hashPassword(input.password);
    // A new password or locking ends all sessions of the user.
    if (input.password || !input.active) await em.nativeDelete(Session, { user });
    user.roles.removeAll();
    await this.assignRoles(em, user, input.roles);
    await em.flush();
    await this.audit.log('users.updated', {
      userId: user.id,
      roles: input.roles,
      passwordReset: Boolean(input.password),
    });
    return toUserDto(user);
  }

  /**
   * Whoever manages users may only hand out roles whose permissions they hold themselves (in the same area),
   * so `core.users.manage` cannot be used to make oneself or others administrator.
   */
  private async assertNotWider(em: EntityManager, current: AuthenticatedUser, added: ParsedUserInput['roles']): Promise<void> {
    if (!added.length) return;
    const roles = new Map((await em.find(Role, { id: { $in: added.map((r) => r.roleId) } })).map((r) => [r.id, r]));
    const grants = computeGrants(
      this.permissions.all,
      added.flatMap(({ roleId, departmentId }) => {
        const role = roles.get(roleId);
        return role ? [{ patterns: role.permissions, departmentId: departmentId ?? null }, { patterns: role.permissionsAllDepartments ?? [], departmentId: null }] : [];
      }),
    );
    const wider = widerThan(current, grants);
    if (wider.length) throw new ForbiddenException({ code: 'users.roleWider', permissions: wider });
  }

  private async assignRoles(em: EntityManager, user: User, roles: ParsedUserInput['roles']): Promise<void> {
    for (const { roleId, departmentId } of roles) {
      const role = await em.findOne(Role, roleId);
      if (!role) throw new BadRequestException({ code: 'users.unknownRole', roleId });
      user.roles.add(em.create(RoleAssignment, { user, role, departmentId }));
    }
  }
}
