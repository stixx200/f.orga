import {
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
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
  ChangePassword,
  Impersonate,
  Login,
  type OidcSettings,
  type Session as SessionDto,
  Setup,
  UpdateProfile,
} from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import { SettingsService } from '../settings/settings.js';
import { ZodPipe } from '../zod.pipe.js';
import { AuthService, ORIGINAL_SESSION_COOKIE, SESSION_COOKIE, sessionCookieOptions } from './auth.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CurrentUser, Public, RequirePermissions } from './decorators.js';
import { hashPassword, hashSecret, verifyPassword } from './password.js';
import { RoleTemplates } from './role-templates.js';
import { Role, RoleAssignment, Session, User } from './security.entities.js';

@Controller('core')
export class AuthController {
  constructor(
    private readonly em: EntityManager,
    private readonly auth: AuthService,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
    private readonly roleTemplates: RoleTemplates,
    @Inject(FORGA_CORE_OPTIONS) private readonly options: ForgaCoreOptions,
  ) {}

  /** Login page data: is a setup needed, and the brigade name if known. */
  @Public()
  @Get('setup')
  async setupState() {
    const brigade = await this.settings.get<{ name: string }>('brigade');
    const oidc = await this.settings.get<OidcSettings>('oidc');
    return {
      required: await this.auth.setupRequired(),
      brigadeName: brigade?.name ?? null,
      oidc: oidc?.enabled && oidc.issuer && oidc.clientId ? { label: oidc.buttonLabel } : null,
    };
  }

  /** First start only: creates the brigade settings, the standard roles and the first user (administrator). */
  @Public()
  @Post('setup')
  async setup(@Body(new ZodPipe(Setup)) input: Setup, @Res({ passthrough: true }) res: Response) {
    if (!(await this.auth.setupRequired())) throw new ConflictException({ code: 'setup.done' });

    const em = this.em.fork();
    const passwordHash = await hashPassword(input.password);
    // Serialized and checked again inside the transaction: two simultaneous requests cannot both create an administrator.
    const user = await em.transactional(async (tx) => {
      await tx.getConnection().execute('select pg_advisory_xact_lock(4711)', [], 'all', tx.getTransactionContext());
      if (await tx.count(User, { technical: false })) throw new ConflictException({ code: 'setup.done' });
      await this.roleTemplates.createMissing(tx, input.language ?? 'de');
      const role = await tx.findOneOrFail(Role, { templateKey: 'administrator' });
      const created = tx.create(User, { username: input.username, displayName: input.displayName, passwordHash, language: input.language ?? 'de' });
      tx.create(RoleAssignment, { user: created, role, departmentId: null });
      await tx.flush();
      return created;
    });
    await this.settings.set('brigade', { name: input.brigadeName });
    await this.audit.log('setup.completed', {}, user.id);

    this.setCookie(res, await this.auth.openSession(em, user));
    return { ok: true };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body(new ZodPipe(Login)) input: Login, @Res({ passthrough: true }) res: Response) {
    const result = await this.auth.login(input.username, input.password);
    if (result === 'locked') throw new HttpException({ code: 'auth.locked' }, HttpStatus.TOO_MANY_REQUESTS);
    if (!result) throw new UnauthorizedException({ code: 'auth.invalidCredentials' });
    this.setCookie(res, result.token);
    return { ok: true };
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
    const stored = await this.em.fork().findOneOrFail(User, user.id);
    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        personId: user.personId,
        language: user.language,
        email: stored.email ?? null,
        receiveDigest: stored.receiveDigest,
      },
      permissions: Object.fromEntries(user.grants),
      impersonator: user.impersonator && { id: user.impersonator.id, displayName: user.impersonator.displayName, endsAt: user.impersonator.endsAt.toISOString() },
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
    res.cookie(ORIGINAL_SESSION_COOKIE, own, this.cookieOptions());
    this.setCookie(res, token);
    return { ok: true };
  }

  @Post('impersonation/end')
  @HttpCode(200)
  async endImpersonation(@CurrentUser() user: AuthenticatedUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const cookies = (req.cookies as Record<string, string> | undefined) ?? {};
    await this.auth.endImpersonation(cookies[SESSION_COOKIE] ?? '', user);
    const original = cookies[ORIGINAL_SESSION_COOKIE];
    if (original) this.setCookie(res, original);
    else res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.clearCookie(ORIGINAL_SESSION_COOKIE, { path: '/' });
    return { ok: true };
  }

  @Put('profile')
  async updateProfile(@Body(new ZodPipe(UpdateProfile)) input: ReturnType<typeof UpdateProfile.parse>, @CurrentUser() current: AuthenticatedUser) {
    const em = this.em.fork();
    const user = await em.findOneOrFail(User, current.id);
    user.language = input.language;
    user.receiveDigest = input.receiveDigest;
    await em.flush();
    return { ok: true };
  }

  /** Changes the own password and ends all other sessions of the user. */
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
    user.passwordHash = await hashPassword(input.new);
    const own = (req.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE] ?? '';
    await em.nativeDelete(Session, { user, id: { $ne: hashSecret(own) } });
    await em.flush();
    await this.audit.log('auth.password-changed');
    return { ok: true };
  }

  private cookieOptions() {
    return sessionCookieOptions(this.options.secureCookies);
  }

  private setCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, this.cookieOptions());
  }
}
