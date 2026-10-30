import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Request, Response } from 'express';
import {
  type BrigadeSettings,
  ChangePassword,
  Impersonate,
  Login,
  type OidcSettings,
  type Session as SessionDto,
  Setup,
  UpdateProfile,
} from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { forgaStage } from '../stage.js';
import { SettingsService } from '../settings/settings.js';
import { ZodPipe } from '../zod.pipe.js';
import { AuthService, ORIGINAL_SESSION_COOKIE, SESSION_COOKIE, sessionCookieOptions } from './auth.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CookiePolicy } from './cookie-policy.js';
import { CurrentUser, Public, RequirePermissions } from './decorators.js';
import { assertEmailFree, sameEmail } from './emails.js';
import { hashPassword, hashSecret, verifyPassword } from './password.js';
import { assertPasswordAllowed } from './password-policy.js';
import { PasswordResetService } from './password-reset.js';
import { RoleTemplates } from './role-templates.js';
import { MfaService } from './mfa.js';
import { PermissionRegistry } from './permission-registry.js';
import { Role, RoleAssignment, Session, User } from './security.entities.js';
import { serverKey } from './server-key.js';
import { Impersonations } from './impersonations.js';

@Controller('core')
export class AuthController {
  constructor(
    private readonly em: EntityManager,
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
    private readonly roleTemplates: RoleTemplates,
    private readonly resets: PasswordResetService,
    private readonly cookies: CookiePolicy,
    private readonly mfa: MfaService,
    private readonly registry: PermissionRegistry,
    private readonly impersonations: Impersonations,
  ) {}

  /** Login page data: is a setup needed, the brigade name if known, and the stage of the installation. */
  @Public()
  @Get('setup')
  async setupState() {
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const oidc = await this.settings.get<OidcSettings>('oidc');
    // Without the public address the provider could not send the user back: no button then.
    const publicUrl = brigade?.publicUrl || process.env.FORGA_PUBLIC_URL;
    return {
      required: await this.auth.setupRequired(),
      brigadeName: brigade?.name ?? null,
      oidc: oidc?.enabled && oidc.issuer && oidc.clientId && publicUrl ? { label: oidc.buttonLabel } : null,
      // The test system shows the band "Testsystem – nur Demodaten" on every page, also before the sign-in.
      stage: forgaStage(),
      rememberAllowed: (await this.auth.securitySettings()).allowRemember,
    };
  }

  /**
   * First start only: creates the brigade settings, the standard roles and the first user (administrator).
   * Needs the setup token from the server log or `FORGA_SETUP_TOKEN`.
   */
  @Public()
  @Post('setup')
  async setup(@Body(new ZodPipe(Setup)) input: ReturnType<typeof Setup.parse>, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!(await this.auth.setupRequired())) throw new ConflictException({ code: 'setup.done' });
    if (!this.auth.isSetupToken(input.setupToken)) {
      await this.audit.log('setup.invalid-token', {}, null);
      throw new ForbiddenException({ code: 'setup.invalidToken' });
    }

    assertPasswordAllowed(input.password, [input.username, input.displayName, input.email]);
    const em = this.em.fork();
    const passwordHash = await hashPassword(input.password);
    // Serialized and checked again inside the transaction: two simultaneous requests cannot both create an administrator.
    const user = await em.transactional(async (tx) => {
      await tx.getConnection().execute('select pg_advisory_xact_lock(4711)', [], 'all', tx.getTransactionContext());
      if (await tx.count(User, { technical: false })) throw new ConflictException({ code: 'setup.done' });
      await this.roleTemplates.createMissing(tx);
      const role = await tx.findOneOrFail(Role, { templateKey: 'administrator' });
      const created = tx.create(User, { username: input.username, displayName: input.displayName, email: input.email, passwordHash, language: input.language });
      tx.create(RoleAssignment, { user: created, role, departmentId: null });
      await tx.flush();
      return created;
    });
    await this.settings.set('brigade', { name: input.brigadeName });
    await this.audit.log('setup.completed', {}, user.id);

    await this.setCookie(req, res, (await this.auth.openSession(em, user, null, this.origin(req))).token);
    return { ok: true };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(Login)) input: Login, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(input.username, input.password, { ...this.origin(req), remember: input.remember });
    if (result === 'locked') throw new HttpException({ code: 'auth.locked' }, HttpStatus.TOO_MANY_REQUESTS);
    if (!result) throw new UnauthorizedException({ code: 'auth.invalidCredentials' });
    await this.setCookie(req, res, result.token, result.persistent);
    return { ok: true, persistent: result.persistent };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Logging out during an impersonation ends the administrator's own session as well.
    const cookies = (req.cookies as Record<string, string> | undefined) ?? {};
    for (const name of [SESSION_COOKIE, ORIGINAL_SESSION_COOKIE]) {
      if (cookies[name]) await this.auth.logout(cookies[name]);
      res.clearCookie(name, { path: '/' });
    }
  }

  @Get('session')
  async session(@CurrentUser() user: AuthenticatedUser): Promise<SessionDto> {
    const em = this.em.fork();
    const stored = await em.findOneOrFail(User, user.id);
    // During an impersonation the administrator's factor confirms, and only his password matters for setting it up.
    const factorOwner = user.impersonator ? await em.findOneOrFail(User, user.impersonator.id, { populate: ['passwordHash'] }) : await em.findOneOrFail(User, user.id, { populate: ['passwordHash'] });
    const mfa = await this.mfa.status(factorOwner.id);
    const held = new Map([...user.locked, ...user.grants]);
    const oidc = await this.settings.get<OidcSettings>('oidc');
    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        personId: user.personId,
        language: user.language,
        email: stored.email ?? null,
        pendingEmail: await this.resets.pendingEmail(user.id),
        receiveDigest: stored.receiveDigest,
        hiddenTasks: stored.hiddenTasks ?? [],
      },
      permissions: Object.fromEntries(held),
      impersonator: user.impersonator && { id: user.impersonator.id, displayName: user.impersonator.displayName, endsAt: user.impersonator.endsAt.toISOString() },
      stepUpPermissions: [...held.keys()].filter((p) => this.registry.stepUp.has(p)),
      elevatedUntil: user.elevatedUntil?.toISOString() ?? null,
      mfa: {
        ...mfa,
        available: serverKey() !== null,
        passwordRequired: Boolean(factorOwner.passwordHash),
        viaProvider: Boolean(!user.impersonator && stored.oidcSubject && oidc?.enabled && oidc.stepUpViaProvider),
      },
      current: user.session ?? { persistent: false, idleMinutes: null },
    };
  }

  /** Acts as another user; the own session is kept in a second cookie and restored at the end. */
  @Post('users/:id/impersonate')
  @HttpCode(200)
  @RequirePermissions('core.users.impersonate')
  async impersonate(
    @Param('id') id: string,
    @Body(new ZodPipe(Impersonate)) input: Impersonate,
    @CurrentUser() user: AuthenticatedUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const own = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (!own) throw new ForbiddenException({ code: 'auth.impersonationNeedsSession' });
    const token = await this.auth.impersonate(user, id, input.reason);
    await this.impersonations.notify(id, user.displayName, input.reason);
    res.cookie(ORIGINAL_SESSION_COOKIE, own, await this.cookieOptions(req));
    await this.setCookie(req, res, token);
    return { ok: true };
  }

  @Post('impersonation/end')
  @HttpCode(200)
  async endImpersonation(@CurrentUser() user: AuthenticatedUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = (req.cookies as Record<string, string> | undefined) ?? {};
    await this.auth.endImpersonation(cookies[SESSION_COOKIE] ?? '', user);
    const original = cookies[ORIGINAL_SESSION_COOKIE];
    if (original) await this.setCookie(req, res, original);
    else res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.clearCookie(ORIGINAL_SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  /**
   * Language, weekly e-mail and hidden tasks take effect at once. Changing or removing the e-mail address needs the
   * current password (the address receives password reset links); a new address takes effect only once it is confirmed
   * with the link sent to it. Returns whether such a confirmation is pending.
   */
  @Put('profile')
  async updateProfile(@Body(new ZodPipe(UpdateProfile)) input: ReturnType<typeof UpdateProfile.parse>, @CurrentUser() current: AuthenticatedUser) {
    const em = this.em.fork();
    const user = await em.findOneOrFail(User, current.id, { populate: ['passwordHash'] });
    const emailChange = input.email !== undefined && !sameEmail(input.email, user.email) ? input.email : undefined;
    if (emailChange !== undefined) {
      // During an impersonation the address (and with it password resets) stays the user's own business.
      if (current.impersonator) throw new ForbiddenException({ code: 'auth.impersonationNotAllowed' });
      if (!input.currentPassword || !user.passwordHash || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
        throw new UnauthorizedException({ code: 'auth.passwordRequired' });
      }
      if (emailChange) await assertEmailFree(em, emailChange, user.id, 'auth.emailTaken');
    }
    user.language = input.language;
    user.receiveDigest = input.receiveDigest;
    if (input.hiddenTasks) user.hiddenTasks = [...new Set(input.hiddenTasks)];
    if (emailChange === null) {
      user.email = null;
      await this.resets.invalidateLinks(em, user.id);
      await this.audit.log('auth.email-changed', { removed: true });
    }
    await em.flush();
    if (emailChange) await this.resets.requestEmailChange(user, emailChange);
    return { ok: true, confirmationSent: Boolean(emailChange) };
  }

  /** Changes the own password, ends all other sessions of the user and the step-up of the own one. */
  @Put('password')
  async changePassword(
    @Body(new ZodPipe(ChangePassword)) input: ChangePassword,
    @CurrentUser() current: AuthenticatedUser,
    @Req() req: Request,
  ) {
    if (current.impersonator) throw new ForbiddenException({ code: 'auth.impersonationNotAllowed' });
    const em = this.em.fork();
    const user = await em.findOneOrFail(User, current.id, { populate: ['passwordHash'] });
    if (!user.passwordHash || !(await verifyPassword(input.current, user.passwordHash))) {
      throw new UnauthorizedException({ code: 'auth.invalidCredentials' });
    }
    assertPasswordAllowed(input.new, [user.username, user.displayName, user.email]);
    user.passwordHash = await hashPassword(input.new);
    const own = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE] ?? '';
    await em.nativeDelete(Session, { user, id: { $ne: hashSecret(own) } });
    // The confirmation with the second factor ends with the password change as well.
    await em.nativeUpdate(Session, { id: hashSecret(own) }, { elevatedUntil: null });
    await em.flush();
    // Open reset links would set another password behind the user's back.
    await this.resets.invalidateLinks(em, user.id);
    await this.audit.log('auth.password-changed');
    return { ok: true };
  }

  /** `Secure` with `FORGA_SECURE_COOKIES`, over HTTPS or with an `https://` address of f.orga. */
  private async cookieOptions(req: Request, persistent = false) {
    return sessionCookieOptions(await this.cookies.secure(req), persistent);
  }

  private async setCookie(req: Request, res: Response, token: string, persistent = false): Promise<void> {
    res.cookie(SESSION_COOKIE, token, await this.cookieOptions(req, persistent));
  }

  /** Address and browser of a new session („Angemeldete Geräte“). */
  private origin(req: Request) {
    return { ip: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
  }
}
