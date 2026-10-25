import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import {
  BulkUserInvitation,
  type BulkUserInvitationResult,
  type User as UserDto,
  UserInput,
  UserInvitation,
} from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { ZodPipe } from '../zod.pipe.js';
import { assertAdministratorRemains } from './administrators.js';
import { AuthService } from './auth.service.js';
import { type AuthenticatedUser, widerThan } from './authenticated-user.js';
import { CurrentUser, RequirePermissions } from './decorators.js';
import { OrganizationDirectory, type PersonSummary } from './organization-directory.js';
import { hashPassword } from './password.js';
import { PasswordResetService } from './password-reset.js';
import { Role, RoleAssignment, Session, User } from './security.entities.js';

type ParsedUserInput = ReturnType<typeof UserInput.parse>;
type Assignments = ParsedUserInput['roles'];

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
    passwordSet: Boolean(user.passwordHash),
    roles: user.roles.getItems().map((a) => ({ roleId: a.role.id, departmentId: a.departmentId ?? null })),
    version: user.version,
  };
}

const displayNameOf = (person: PersonSummary) => `${person.firstName} ${person.lastName}`.trim();

/** Username for an invited person: the local part of the e-mail address, made unique with a number. */
function usernameCandidates(person: PersonSummary): string[] {
  const base = (person.email.split('@')[0] || `${person.firstName}.${person.lastName}`)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9._-]/g, '')
    .padEnd(3, '0');
  return [base, ...Array.from({ length: 98 }, (_, i) => `${base}${i + 2}`)];
}

@Controller('core/users')
@RequirePermissions('core.users.manage')
export class UsersController {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: Audit,
    private readonly auth: AuthService,
    private readonly organization: OrganizationDirectory,
    private readonly resets: PasswordResetService,
  ) {}

  @Get()
  async list(): Promise<UserDto[]> {
    const users = await this.em
      .fork()
      .find(User, { technical: false }, { populate: ['roles.role', 'passwordHash'], orderBy: { displayName: 'asc' } });
    return users.map(toUserDto);
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<UserDto> {
    const user = await this.em.fork().findOne(User, { id, technical: false }, { populate: ['roles.role', 'passwordHash'] });
    if (!user) throw new NotFoundException();
    return toUserDto(user);
  }

  @Post()
  async create(@Body(new ZodPipe(UserInput)) input: ParsedUserInput, @CurrentUser() current: AuthenticatedUser): Promise<UserDto> {
    if (!input.password) throw new BadRequestException({ code: 'users.passwordRequired' });
    const em = this.em.fork();
    await this.assertNotWider(em, current, input.roles);
    await this.validateReferences(em, input.roles, input.personId, null);
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
    return toUserDto(await em.findOneOrFail(User, user.id, { populate: ['roles.role', 'passwordHash'], refresh: true }));
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body(new ZodPipe(UserInput)) input: ParsedUserInput,
    @CurrentUser() current: AuthenticatedUser,
  ): Promise<UserDto> {
    const updated = await this.em.fork().transactional(async (em) => {
      const user = await em.findOne(User, { id, technical: false }, { populate: ['roles.role'] });
      if (!user) throw new NotFoundException();
      if (user.id === current.id && !input.active) throw new BadRequestException({ code: 'users.cannotDeactivateSelf' });
      // Password, e-mail, lock and roles of a user with more permissions than the own would take over his account.
      await this.assertMayManage(current, user);
      await this.assertNotWider(em, current, input.roles);
      await this.validateReferences(em, input.roles, input.personId, user.id);
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
      await assertAdministratorRemains(em);
      return user;
    });
    await this.audit.log('users.updated', {
      userId: updated.id,
      roles: input.roles,
      passwordReset: Boolean(input.password),
    });
    return toUserDto(await this.em.fork().findOneOrFail(User, updated.id, { populate: ['roles.role', 'passwordHash'] }));
  }

  /**
   * Creates a user for a person of the master data and sends an invitation with a link to set the password.
   * Name and e-mail address are taken from the person; nobody but the invited person knows the password.
   */
  @Post('invitations')
  async invite(@Body(new ZodPipe(UserInvitation)) input: UserInvitation, @CurrentUser() current: AuthenticatedUser): Promise<UserDto> {
    const em = this.em.fork();
    await this.resets.assertConfigured();
    await this.assertNotWider(em, current, input.roles);
    await this.validateReferences(em, input.roles, input.personId, null);
    const [person] = (await this.organization.persons([input.personId])) ?? [];
    if (!person) throw new BadRequestException({ code: 'users.unknownPerson' });
    if (!person.email) throw new BadRequestException({ code: 'users.personWithoutEmail' });
    const username = input.username ?? (await this.freeUsername(em, person));
    if (!username || (await em.count(User, { username }))) throw new ConflictException({ code: 'users.usernameTaken' });
    const user = em.create(User, { username, displayName: displayNameOf(person), email: person.email, personId: person.id, language: input.language });
    await this.assignRoles(em, user, input.roles);
    await em.flush();
    await this.audit.log('users.invited', { userId: user.id, personId: person.id, roles: input.roles });
    await this.resets.invite(user);
    return toUserDto(await em.findOneOrFail(User, user.id, { populate: ['roles.role', 'passwordHash'], refresh: true }));
  }

  /** Invites several persons at once with the same roles; persons without e-mail or with a user are skipped. */
  @Post('invitations/bulk')
  @HttpCode(200)
  async inviteMany(@Body(new ZodPipe(BulkUserInvitation)) input: BulkUserInvitation, @CurrentUser() current: AuthenticatedUser): Promise<BulkUserInvitationResult> {
    const em = this.em.fork();
    await this.resets.assertConfigured();
    await this.assertNotWider(em, current, input.roles);
    await this.validateReferences(em, input.roles, null, null);
    const persons = new Map(((await this.organization.persons(input.personIds)) ?? []).map((p) => [p.id, p]));
    const linked = new Set((await em.find(User, { personId: { $in: input.personIds } })).map((u) => u.personId));
    const result: BulkUserInvitationResult = { invited: [], skipped: [] };
    for (const personId of new Set(input.personIds)) {
      const person = persons.get(personId);
      if (!person) result.skipped.push({ personId, reason: 'unknownPerson' });
      else if (linked.has(personId)) result.skipped.push({ personId, reason: 'hasUser' });
      else if (!person.email) result.skipped.push({ personId, reason: 'noEmail' });
      else {
        const username = await this.freeUsername(em, person);
        if (!username) {
          result.skipped.push({ personId, reason: 'usernameTaken' });
          continue;
        }
        const user = em.create(User, { username, displayName: displayNameOf(person), email: person.email, personId, language: input.language });
        await this.assignRoles(em, user, input.roles);
        await em.flush();
        await this.audit.log('users.invited', { userId: user.id, personId, roles: input.roles });
        await this.resets.invite(user);
        result.invited.push(user.id);
      }
    }
    return result;
  }

  /** Sends the invitation again, e.g. after the link expired. Only for users without a password. */
  @Post(':id/invitation')
  @HttpCode(200)
  async resendInvitation(@Param('id') id: string, @CurrentUser() current: AuthenticatedUser): Promise<{ ok: true }> {
    const em = this.em.fork();
    const user = await em.findOne(User, { id, technical: false }, { populate: ['roles.role', 'passwordHash'] });
    if (!user) throw new NotFoundException();
    await this.assertMayManage(current, user);
    if (user.passwordHash) throw new BadRequestException({ code: 'users.alreadyActivated' });
    if (!user.email) throw new BadRequestException({ code: 'mail.noRecipient' });
    await this.resets.assertConfigured();
    await this.resets.invite(user);
    await this.audit.log('users.invited', { userId: user.id, resent: true });
    return { ok: true };
  }

  /** Only users whose permissions the manager holds himself may be changed (no takeover of administrator accounts). Roles must be populated. */
  private assertMayManage(current: AuthenticatedUser, user: User): Promise<void> {
    return this.auth.assertMayManage(current, user);
  }

  /**
   * Whoever manages users may only hand out roles whose permissions they hold themselves (in the same area),
   * so `core.users.manage` cannot be used to make oneself or others administrator.
   */
  private async assertNotWider(em: EntityManager, current: AuthenticatedUser, assignments: Assignments): Promise<void> {
    if (!assignments.length) return;
    const roles = new Map((await em.find(Role, { id: { $in: assignments.map((r) => r.roleId) } })).map((r) => [r.id, r]));
    const grants = await this.auth.grantsFor(
      assignments.flatMap(({ roleId, departmentId }) => {
        const role = roles.get(roleId);
        return role ? [{ role, departmentId: departmentId ?? null }] : [];
      }),
    );
    const wider = widerThan(current, grants);
    if (wider.length) throw new ForbiddenException({ code: 'users.roleWider', permissions: wider });
  }

  /** Departments of role assignments and the linked person must exist; a person belongs to at most one user. */
  private async validateReferences(em: EntityManager, assignments: Assignments, personId: string | null, userId: string | null): Promise<void> {
    const departments = [...new Set(assignments.flatMap((a) => (a.departmentId ? [a.departmentId] : [])))];
    const unknown = await this.organization.unknownDepartments(departments);
    if (unknown.length) throw new BadRequestException({ code: 'users.unknownDepartment', departments: unknown });
    if (!personId) return;
    const persons = await this.organization.persons([personId]);
    if (persons && !persons.length) throw new BadRequestException({ code: 'users.unknownPerson' });
    if (await em.count(User, { personId, ...(userId ? { id: { $ne: userId } } : {}) })) {
      throw new ConflictException({ code: 'users.personTaken' });
    }
  }

  private async freeUsername(em: EntityManager, person: PersonSummary): Promise<string | null> {
    const candidates = usernameCandidates(person);
    const taken = new Set((await em.find(User, { username: { $in: candidates } })).map((u) => u.username));
    return candidates.find((c) => !taken.has(c)) ?? null;
  }

  private async assignRoles(em: EntityManager, user: User, roles: Assignments): Promise<void> {
    for (const { roleId, departmentId } of roles) {
      const role = await em.findOne(Role, roleId);
      if (!role) throw new BadRequestException({ code: 'users.unknownRole', roleId });
      user.roles.add(em.create(RoleAssignment, { user, role, departmentId }));
    }
  }
}
