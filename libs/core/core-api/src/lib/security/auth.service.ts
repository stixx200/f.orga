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
import { ApiToken, type Role, Session, User } from './security.entities.js';

export const SESSION_COOKIE = 'forga_session';
/** Keeps the administrator's own session while an impersonation session is active. */
export const ORIGINAL_SESSION_COOKIE = 'forga_session_original';
const IMPERSONATION_MS = 60 * 60_000;
export const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
export const API_TOKEN_PREFIX = 'forga_';

/** Options of the session cookie (also used by the OIDC sign-in). */
export const sessionCookieOptions = (secure: boolean) => ({ httpOnly: true, sameSite: 'lax' as const, secure, path: '/', maxAge: SESSION_DURATION_MS });

const MAX_FAILURES = 5;
const MAX_TRACKED = 10_000;
const LOCK_MS = 60 * 1000;

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  /** Failed logins per username (insertion order = oldest first); after too many, the account is locked for a minute. */
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

  /** Checks the credentials and opens a session. Returns the cookie value, or `null`. */
  async login(username: string, password: string): Promise<{ token: string; user: User } | 'locked' | null> {
    const key = username.toLowerCase();
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

  async openSession(em: EntityManager, user: User): Promise<string> {
    const token = generateSecret();
    const now = new Date();
    em.create(Session, {
      id: hashSecret(token),
      user,
      createdAt: now,
      expiresAt: new Date(now.getTime() + SESSION_DURATION_MS),
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
    const user = await this.load(em, session.user, 'session');
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
    const targetUser = await this.load(em, target, 'session');
    const wider = widerThan(actor, targetUser.grants);
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
    // A token can do exactly what its scopes say, brigade-wide; like sessions, not in deactivated modules.
    const grants = computeGrants(await this.activePermissions(), [{ patterns: apiToken.scopes, departmentId: null }]);
    const user = apiToken.user;
    return new AuthenticatedUser(user.id, user.username, user.displayName, null, user.language, grants, 'token');
  }

  /** Permissions of deactivated modules do not count: their lists, imports, search hits and deadlines disappear too. */
  private async activePermissions(): Promise<Permission[]> {
    const inactive = await this.modules.inactiveIds();
    return this.registry.all.filter((p) => !inactive.has(p.id.slice(0, p.id.indexOf('.'))));
  }

  /**
   * Effective grants of role assignments, as a user holding them would get them:
   * without deactivated modules, and an assignment to a department covers the departments below it.
   */
  async grantsFor(assignments: readonly { role: Pick<Role, 'permissions' | 'permissionsAllDepartments'>; departmentId: string | null }[]): Promise<Map<string, Grant>> {
    return computeGrants(
      await this.activePermissions(),
      assignments.flatMap((a) => [
        { patterns: a.role.permissions, departmentId: a.departmentId },
        { patterns: a.role.permissionsAllDepartments ?? [], departmentId: null },
      ]),
      await this.organization.subDepartments(),
    );
  }

  /**
   * A user may only be changed (password, e-mail, lock, roles, OIDC link) by someone holding all of his permissions,
   * so `core.users.manage` cannot take over an administrator account. `user.roles.role` must be populated.
   */
  async assertMayManage(actor: AuthenticatedUser, user: User): Promise<void> {
    const grants = await this.grantsFor(user.roles.getItems().map((a) => ({ role: a.role, departmentId: a.departmentId ?? null })));
    const wider = widerThan(actor, grants);
    if (wider.length) throw new ForbiddenException({ code: 'users.targetWider', permissions: wider });
  }

  async load(em: EntityManager, user: User, via: 'session' | 'token'): Promise<AuthenticatedUser> {
    await em.populate(user, ['roles.role']);
    const grants = await this.grantsFor(user.roles.getItems().map((a) => ({ role: a.role, departmentId: a.departmentId ?? null })));
    return new AuthenticatedUser(
      user.id,
      user.username,
      user.displayName,
      user.personId ?? null,
      user.language,
      grants,
      via,
    );
  }
}
