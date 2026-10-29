import { timingSafeEqual } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Grant, Permission } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { AuthenticatedUser, computeGrants, widerThan } from './authenticated-user.js';
import { generateSecret, hashSecret, verifyPassword } from './password.js';
import { ModuleStateService } from '../module/modules.js';
import { OrganizationDirectory } from './organization-directory.js';
import { PermissionRegistry } from './permission-registry.js';
import { ApiToken, type Role, Session, User, UserMfa } from './security.entities.js';

export const SESSION_COOKIE = 'forga_session';
/** Keeps the administrator's own session while an impersonation session is active. */
export const ORIGINAL_SESSION_COOKIE = 'forga_session_original';
const IMPERSONATION_MS = 60 * 60_000;
export const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
export const API_TOKEN_PREFIX = 'forga_';

/** `active`: permissions of active modules (what a user may do); `all`: also those of deactivated modules. */
export type PermissionScope = 'active' | 'all';

/** A role assignment as far as grants are concerned. */
export interface RoleGrantInput {
  role: Pick<Role, 'permissions' | 'permissionsAllDepartments'>;
  departmentId: string | null;
}

/** Options of the session cookie (also used by the OIDC sign-in). */
export const sessionCookieOptions = (secure: boolean) => ({ httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: SESSION_DURATION_MS });

const MAX_FAILURES = 5;
const MAX_TRACKED = 10_000;
const LOCK_MS = 60 * 1000;

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  /** Failed logins per username and address (insertion order = oldest first); after too many, locked for a minute. */
  private readonly failures = new Map<string, { count: number; lockedUntil: number }>();
  private readonly logger = new Logger('Setup');
  private generatedSetupToken: string | null = null;

  constructor(
    private readonly em: EntityManager,
    private readonly registry: PermissionRegistry,
    private readonly audit: Audit,
    private readonly modules: ModuleStateService,
    private readonly organization: OrganizationDirectory,
  ) {}

  async setupRequired(): Promise<boolean> {
    return (await this.em.fork().count(User, { technical: false })) === 0;
  }

  /**
   * Until the first user exists, the setup needs a token, so nobody who reaches a fresh installation first
   * can make himself administrator: `FORGA_SETUP_TOKEN`, or a random token printed to the server log.
   */
  async onApplicationBootstrap(): Promise<void> {
    if (!(await this.setupRequired())) return;
    if (process.env.FORGA_SETUP_TOKEN) this.logger.log('Initial setup required; the setup token is the value of FORGA_SETUP_TOKEN.');
    else this.logger.warn(`Initial setup required. Setup token: ${this.setupToken()}`);
  }

  private setupToken(): string {
    return process.env.FORGA_SETUP_TOKEN || (this.generatedSetupToken ??= generateSecret());
  }

  /** Compares in constant time (both sides hashed to the same length). */
  isSetupToken(token: string): boolean {
    return timingSafeEqual(Buffer.from(hashSecret(token)), Buffer.from(hashSecret(this.setupToken())));
  }

  /**
   * Checks the credentials and opens a session. Returns the cookie value, or `null`. Failed attempts lock the username
   * for a minute only for the address they came from (`ip`, the client address behind a trusted proxy), so nobody
   * can lock others out of their account by guessing wrong passwords.
   */
  async login(username: string, password: string, ip: string): Promise<{ token: string; user: User } | 'locked' | null> {
    const key = `${username.toLowerCase()}|${ip}`;
    const failure = this.failures.get(key);
    if (failure && failure.lockedUntil > Date.now()) return 'locked';

    const em = this.em.fork();
    const user = await em.findOne(
      User,
      { username, active: true, technical: false },
      { populate: ['passwordHash'] },
    );
    if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      const count = (failure?.count ?? 0) + 1;
      // Bounded: guessing many different usernames must not grow the map without limit.
      if (this.failures.size >= MAX_TRACKED && !this.failures.has(key)) {
        for (const [name, f] of this.failures) if (f.lockedUntil < Date.now()) this.failures.delete(name);
        if (this.failures.size >= MAX_TRACKED) this.failures.delete(this.failures.keys().next().value!);
      }
      this.failures.set(key, { count, lockedUntil: count >= MAX_FAILURES ? Date.now() + LOCK_MS : 0 });
      await this.audit.log('auth.login-failed', { username }, null);
      return null;
    }

    this.failures.delete(key);
    const token = await this.openSession(em, user);
    await this.audit.log('auth.login', {}, user.id);
    return { token, user };
  }

  /** Opens a session; `elevatedUntil` e.g. after an OIDC sign-in with a second factor at the provider. */
  async openSession(em: EntityManager, user: User, elevatedUntil: Date | null = null): Promise<string> {
    const token = generateSecret();
    const now = new Date();
    em.create(Session, {
      id: hashSecret(token),
      user,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
      elevatedUntil,
    });
    user.lastLogin = now;
    await em.flush();
    return token;
  }

  async logout(token: string): Promise<void> {
    await this.em.fork().nativeDelete(Session, { id: hashSecret(token) });
  }

  async userFromSession(token: string): Promise<AuthenticatedUser | null> {
    const em = this.em.fork();
    const session = await em.findOne(Session, { id: hashSecret(token) }, { populate: ['user', 'impersonator'] });
    if (!session) return null;
    if (session.expiresAt < new Date() || !session.user.active || (session.impersonator && !session.impersonator.active)) {
      await em.nativeDelete(Session, { id: session.id });
      return null;
    }
    const elevatedUntil = session.elevatedUntil && session.elevatedUntil > new Date() ? session.elevatedUntil : null;
    const user = await this.load(em, session.user, 'session', elevatedUntil !== null);
    user.sessionId = session.id;
    user.elevatedUntil = elevatedUntil;
    // During an impersonation the administrator confirms with his own factor.
    const factorOwner = session.impersonator ?? session.user;
    user.mfaEnrolled = (await em.count(UserMfa, { user: factorOwner, confirmedAt: { $ne: null } })) > 0;
    if (session.impersonator) {
      user.impersonator = { id: session.impersonator.id, displayName: session.impersonator.displayName, endsAt: session.expiresAt };
    }
    return user;
  }

  /**
   * Opens a session in which `actor` acts as the target user, for at most an hour.
   * Only for active, non-technical other users whose permissions the actor holds as well,
   * so impersonation never widens what the actor may do. Not possible from an impersonated session.
   */
  async impersonate(actor: AuthenticatedUser, targetId: string, reason: string): Promise<string> {
    if (actor.impersonator) throw new ForbiddenException({ code: 'auth.impersonationNested' });
    if (actor.id === targetId) throw new BadRequestException({ code: 'auth.impersonationSelf' });
    const em = this.em.fork();
    const target = await em.findOne(User, { id: targetId, active: true, technical: false });
    if (!target) throw new NotFoundException({ code: 'auth.impersonationUnknownUser' });
    await em.populate(target, ['roles.role']);
    const wider = await this.widerThanActor(actor, target.roles.getItems().map((a) => ({ role: a.role, departmentId: a.departmentId ?? null })));
    if (wider.length) throw new ForbiddenException({ code: 'auth.impersonationWider', permissions: wider });

    const token = generateSecret();
    const now = new Date();
    em.create(Session, {
      id: hashSecret(token),
      user: target,
      createdAt: now,
      expiresAt: new Date(now.getTime() + IMPERSONATION_MS),
      impersonator: em.getReference(User, actor.id),
      impersonationReason: reason,
    });
    await em.flush();
    await this.audit.log('auth.impersonation-started', { targetId, targetName: target.displayName, reason }, actor.id);
    return token;
  }

  /** Ends an impersonation session; the administrator continues with the original session. */
  async endImpersonation(token: string, user: AuthenticatedUser): Promise<void> {
    if (!user.impersonator) throw new BadRequestException({ code: 'auth.notImpersonating' });
    await this.em.fork().nativeDelete(Session, { id: hashSecret(token) });
    await this.audit.log('auth.impersonation-ended', { targetId: user.id, targetName: user.displayName }, user.impersonator.id);
  }

  async userFromApiToken(token: string): Promise<AuthenticatedUser | null> {
    if (!token.startsWith(API_TOKEN_PREFIX)) return null;
    const em = this.em.fork();
    const apiToken = await em.findOne(ApiToken, { hash: hashSecret(token) }, { populate: ['user'] });
    const now = new Date();
    if (!apiToken || apiToken.revokedAt || (apiToken.expiresAt && apiToken.expiresAt < now) || !apiToken.user.active) {
      return null;
    }
    apiToken.lastUsedAt = now;
    await em.flush();
    // A token can do exactly what its scopes say, brigade-wide; like sessions, not in deactivated modules,
    // never privileged permissions (e.g. downloading and replacing the data with a backup) and never permissions that
    // need the second factor: a token cannot show one (`tokenForbidden`).
    const permissions = (await this.activePermissions()).filter((p) => !this.registry.tokenForbidden(p));
    const grants = computeGrants(permissions, [{ patterns: apiToken.scopes, departmentId: null }]);
    const user = apiToken.user;
    return new AuthenticatedUser(user.id, user.username, user.displayName, null, user.language, grants, 'token');
  }

  /**
   * Permissions of deactivated modules do not count for what a user may do: their lists, imports, search hits and
   * deadlines disappear too. Checks whether someone may hand out permissions use `all`, so permissions of a deactivated
   * module cannot be granted unnoticed and take effect when it is activated again.
   */
  private async permissions(scope: PermissionScope): Promise<readonly Permission[]> {
    if (scope === 'all') return this.registry.all;
    const inactive = await this.modules.inactiveIds();
    return this.registry.all.filter((p) => !inactive.has(p.id.slice(0, p.id.indexOf('.'))));
  }

  private activePermissions(): Promise<readonly Permission[]> {
    return this.permissions('active');
  }

  /**
   * Effective grants of role assignments, as a user holding them would get them: by default without deactivated
   * modules, and an assignment to a department covers the departments below it.
   */
  async grantsFor(assignments: readonly RoleGrantInput[], scope: PermissionScope = 'active'): Promise<Map<string, Grant>> {
    return computeGrants(
      await this.permissions(scope),
      assignments.flatMap((a) => [
        { patterns: a.role.permissions, departmentId: a.departmentId },
        { patterns: a.role.permissionsAllDepartments ?? [], departmentId: null },
      ]),
      await this.organization.subDepartments(),
    );
  }

  /**
   * Permissions of the assignments that `actor` does not hold to the same extent. Both sides count the permissions of
   * deactivated modules as well, so nobody can hand out (or take over) permissions of a module that is switched off.
   */
  async widerThanActor(actor: AuthenticatedUser, assignments: readonly RoleGrantInput[]): Promise<string[]> {
    return widerThan(await this.allGrantsOf(actor), await this.grantsFor(assignments, 'all'));
  }

  /** Does the actor hold the permission (counting deactivated modules) brigade-wide or in one of the departments? */
  async holds(actor: AuthenticatedUser, permission: string, departmentIds: readonly string[]): Promise<boolean> {
    const grant = (await this.allGrantsOf(actor)).grant(permission);
    return grant === 'brigade' || (Array.isArray(grant) && departmentIds.some((d) => grant.includes(d)));
  }

  /** Grants of a user's role assignments including deactivated modules. */
  async allGrantsOfUser(em: EntityManager, user: User): Promise<Map<string, Grant>> {
    await em.populate(user, ['roles.role']);
    return this.grantsFor(user.roles.getItems().map((a) => ({ role: a.role, departmentId: a.departmentId ?? null })), 'all');
  }

  /** The actor's grants including deactivated modules; tokens (no roles) keep their effective grants. */
  private async allGrantsOf(actor: AuthenticatedUser): Promise<Pick<AuthenticatedUser, 'grant'>> {
    if (actor.via === 'token') return actor;
    const user = await this.em.fork().findOne(User, actor.id, { populate: ['roles.role'] });
    if (!user) return actor;
    const grants = await this.grantsFor(user.roles.getItems().map((a) => ({ role: a.role, departmentId: a.departmentId ?? null })), 'all');
    return { grant: (permission) => grants.get(permission) ?? null };
  }

  /**
   * A user may only be changed (password, e-mail, lock, roles, OIDC link) by someone holding all of his permissions,
   * so `core.users.manage` cannot take over an administrator account. `user.roles.role` must be populated.
   */
  async assertMayManage(actor: AuthenticatedUser, user: User): Promise<void> {
    const wider = await this.widerThanActor(actor, user.roles.getItems().map((a) => ({ role: a.role, departmentId: a.departmentId ?? null })));
    if (wider.length) throw new ForbiddenException({ code: 'users.targetWider', permissions: wider });
  }

  /**
   * The user with the grants of his roles. Permissions with `stepUp` take effect only in a confirmed session
   * (`elevated`); otherwise they are kept apart as `locked`, so the guard can ask for the second factor.
   */
  async load(em: EntityManager, user: User, via: 'session' | 'token', elevated = false): Promise<AuthenticatedUser> {
    await em.populate(user, ['roles.role']);
    const held = await this.grantsFor(user.roles.getItems().map((a) => ({ role: a.role, departmentId: a.departmentId ?? null })));
    const grants = new Map<string, Grant>();
    const locked = new Map<string, Grant>();
    for (const [permission, grant] of held) {
      (elevated || !this.registry.stepUp.has(permission) ? grants : locked).set(permission, grant);
    }
    return new AuthenticatedUser(user.id, user.username, user.displayName, user.personId ?? null, user.language, grants, via, locked);
  }
}
