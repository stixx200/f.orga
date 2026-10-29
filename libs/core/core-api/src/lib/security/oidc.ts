import {
  BadGatewayException,
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Injectable,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Request, Response } from 'express';
import * as client from 'openid-client';
import type { BrigadeSettings, Grant, OidcSettings } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { SettingsService } from '../settings/settings.js';
import { AuthService, SESSION_COOKIE, sessionCookieOptions } from './auth.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { CookiePolicy } from './cookie-policy.js';
import { CurrentUser, Public, RequirePermissions } from './decorators.js';
import { generateSecret } from './password.js';
import { User } from './security.entities.js';

const PENDING_COOKIE = 'forga_oidc';
const PENDING_MS = 10 * 60_000;
const MAX_PENDING = 1000;

interface Pending {
  state: string;
  nonce: string;
  verifier: string;
  expiresAt: number;
  /** Set when a logged-in user links his own account (manual linking). */
  linkUserId?: string;
}

/** The provider's discovery document could not be loaded (wrong issuer, provider unreachable). */
export class OidcDiscoveryError extends Error {}

/** Plain-HTTP issuers are accepted only on the local machine (development, tests). */
const isLocal = (url: URL) => url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

/**
 * Accounts that are only linked manually: administration of f.orga (`*`, `core.*`) and brigade-wide management of a
 * module (`….manage`), counting deactivated modules as well.
 */
export function isPrivileged(grants: ReadonlyMap<string, Grant>): boolean {
  return [...grants].some(([permission, grant]) => permission.startsWith('core.') || (permission.endsWith('.manage') && grant === 'brigade'));
}

/**
 * Sign-in with an OpenID Connect provider: authorization code flow with PKCE, state and nonce.
 * Only existing, active users can sign in. The first sign-in links the account by verified e-mail address, except for
 * privileged accounts (`isPrivileged`) and with `matchBy: username`: these accounts are linked manually from the profile.
 */
@Injectable()
export class OidcService {
  private readonly logger = new Logger('Oidc');
  /** Started sign-ins by the random value in the pending cookie (one server instance). */
  private readonly pending = new Map<string, Pending>();
  private cached: { key: string; config: client.Configuration } | null = null;

  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
    private readonly auth: AuthService,
  ) {}

  /** `null` if sign-in is switched off or incomplete; throws `OidcDiscoveryError` if the provider cannot be reached. */
  async config(): Promise<{ settings: OidcSettings; config: client.Configuration; baseUrl: string } | null> {
    const settings = await this.settings.get<OidcSettings>('oidc');
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    // The redirect address comes from the configuration, never from request headers.
    const baseUrl = (brigade?.publicUrl || process.env['FORGA_PUBLIC_URL'] || '').replace(/\/$/, '');
    if (!settings?.enabled || !settings.issuer || !settings.clientId || !baseUrl) return null;
    return { settings, config: await this.discover(settings), baseUrl };
  }

  private async discover(settings: OidcSettings): Promise<client.Configuration> {
    const key = JSON.stringify([settings.issuer, settings.clientId, settings.clientSecret ?? '']);
    if (this.cached?.key !== key) {
      try {
        const issuer = new URL(settings.issuer);
        const config = await client.discovery(issuer, settings.clientId, undefined, settings.clientSecret ? client.ClientSecretPost(settings.clientSecret) : client.None(), {
          execute: isLocal(issuer) ? [client.allowInsecureRequests] : [],
          timeout: 10,
        });
        this.cached = { key, config };
      } catch (error) {
        this.logger.warn(`OIDC discovery failed: ${error instanceof Error ? error.message : String(error)}`);
        throw new OidcDiscoveryError();
      }
    }
    return this.cached.config;
  }

  /** For the test button of the settings: loads the provider's configuration with the stored settings. */
  async test(): Promise<{ issuer: string; redirectUri: string }> {
    const settings = await this.settings.get<OidcSettings>('oidc');
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const baseUrl = (brigade?.publicUrl || process.env['FORGA_PUBLIC_URL'] || '').replace(/\/$/, '');
    if (!settings?.issuer || !settings.clientId) throw new BadRequestException({ code: 'auth.oidcIncomplete' });
    if (!baseUrl) throw new BadRequestException({ code: 'auth.oidcNoPublicUrl' });
    try {
      const config = await this.discover(settings);
      return { issuer: config.serverMetadata().issuer, redirectUri: `${baseUrl}/api/core/oidc/callback` };
    } catch {
      throw new BadGatewayException({ code: 'auth.oidcDiscoveryFailed' });
    }
  }

  /** Starts a sign-in (or, with `linkUserId`, the linking of a logged-in user): returns the provider URL and the value of the pending cookie. */
  async start(linkUserId?: string): Promise<{ url: string; id: string } | null> {
    const setup = await this.config();
    if (!setup) return null;
    const now = Date.now();
    for (const [id, p] of this.pending) if (p.expiresAt < now) this.pending.delete(id);
    if (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.keys().next().value!);
    const pending: Pending = { state: client.randomState(), nonce: client.randomNonce(), verifier: client.randomPKCECodeVerifier(), expiresAt: now + PENDING_MS, linkUserId };
    const id = generateSecret();
    this.pending.set(id, pending);
    const url = client.buildAuthorizationUrl(setup.config, {
      redirect_uri: `${setup.baseUrl}/api/core/oidc/callback`,
      scope: setup.settings.scopes,
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: await client.calculatePKCECodeChallenge(pending.verifier),
      code_challenge_method: 'S256',
    });
    return { url: url.href, id };
  }

  /** Completes a sign-in; returns the user or an error code. */
  async complete(id: string | undefined, query: string): Promise<{ user: User; linked: boolean } | { error: string }> {
    const pending = id ? this.pending.get(id) : undefined;
    if (id) this.pending.delete(id);
    if (!pending || pending.expiresAt < Date.now()) return { error: 'auth.oidcExpired' };
    const setup = await this.config().catch(() => 'discovery' as const);
    if (setup === 'discovery') return { error: 'auth.oidcDiscoveryFailed' };
    if (!setup) return { error: 'auth.oidcDisabled' };
    let claims: client.IDToken | undefined;
    try {
      const tokens = await client.authorizationCodeGrant(setup.config, new URL(`${setup.baseUrl}/api/core/oidc/callback${query}`), {
        pkceCodeVerifier: pending.verifier,
        expectedState: pending.state,
        expectedNonce: pending.nonce,
        idTokenExpected: true,
      });
      claims = tokens.claims();
    } catch (error) {
      this.logger.warn(`OIDC sign-in failed: ${error instanceof Error ? error.message : String(error)}`);
      return { error: 'auth.oidcFailed' };
    }
    if (!claims) return { error: 'auth.oidcFailed' };
    const subject = `${claims.iss}|${claims.sub}`;
    const em = this.em.fork();
    let user = await em.findOne(User, { oidcSubject: subject });
    if (pending.linkUserId) {
      // Manual linking by the logged-in user: the provider account must not belong to someone else.
      if (user && user.id !== pending.linkUserId) return { error: 'auth.oidcLinkedElsewhere' };
      const own = await em.findOne(User, { id: pending.linkUserId, active: true, technical: false });
      if (!own) return { error: 'auth.oidcUnknownUser' };
      own.oidcSubject = subject;
      await em.flush();
      return { user: own, linked: true };
    }
    if (!user) {
      // The username at the provider (`preferred_username`) is neither unique nor verified: with `matchBy: username`
      // accounts are only linked manually from the profile.
      if (setup.settings.matchBy !== 'email') return { error: 'auth.oidcLinkManually' };
      // Only addresses the provider has verified, otherwise anybody could claim the address of an f.orga user.
      const email = typeof claims['email'] === 'string' && claims['email_verified'] === true ? claims['email'].toLowerCase() : null;
      const candidates = email ? (await em.find(User, { oidcSubject: null, technical: false })).filter((u) => u.email?.toLowerCase() === email) : [];
      // Ambiguous e-mail addresses are not linked.
      if (candidates.length !== 1) return { error: 'auth.oidcUnknownUser' };
      const candidate = candidates[0];
      if (!candidate.active) return { error: 'auth.oidcUnknownUser' };
      // Privileged accounts are never linked automatically: a matching e-mail address at the provider must not be
      // enough to take them over. Their owners link them from the profile.
      if (isPrivileged(await this.auth.allGrantsOfUser(em, candidate))) return { error: 'auth.oidcLinkManually' };
      user = candidate;
      user.oidcSubject = subject;
      await em.flush();
    }
    if (!user.active || user.technical) return { error: 'auth.oidcUnknownUser' };
    return { user, linked: false };
  }
}

@Controller('core')
export class OidcController {
  constructor(
    private readonly oidc: OidcService,
    private readonly auth: AuthService,
    private readonly em: EntityManager,
    private readonly audit: Audit,
    private readonly cookies: CookiePolicy,
  ) {}

  /** Redirects to the provider. */
  @Public()
  @Get('oidc/start')
  async start(@Req() req: Request, @Res() res: Response): Promise<void> {
    const started = await this.oidc.start().catch((error: unknown) => (error instanceof OidcDiscoveryError ? ('discovery' as const) : null));
    if (started === 'discovery') return res.redirect(302, '/?oidcError=auth.oidcDiscoveryFailed');
    if (!started) return res.redirect(302, '/?oidcError=auth.oidcDisabled');
    await this.setPending(req, res, started.id);
    res.redirect(302, started.url);
  }

  /**
   * Links the own account with the provider account (needed for administrative accounts, which are never linked
   * automatically). A POST with the CSRF header, so no other site can start it; the UI then opens the returned URL.
   */
  @Post('oidc/link')
  @HttpCode(200)
  async link(@CurrentUser() user: AuthenticatedUser, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ url: string }> {
    if (user.via !== 'session' || user.impersonator) throw new ForbiddenException({ code: 'auth.impersonationNotAllowed' });
    const started = await this.oidc.start(user.id).catch((error: unknown) => {
      throw error instanceof OidcDiscoveryError ? new BadGatewayException({ code: 'auth.oidcDiscoveryFailed' }) : error;
    });
    if (!started) throw new BadRequestException({ code: 'auth.oidcDisabled' });
    await this.setPending(req, res, started.id);
    return { url: started.url };
  }

  /** Checks the stored settings against the provider (discovery), for the settings page. */
  @Post('settings/oidc/test')
  @HttpCode(200)
  @RequirePermissions('core.settings.manage')
  test(): Promise<{ issuer: string; redirectUri: string }> {
    return this.oidc.test();
  }

  private async setPending(req: Request, res: Response, id: string): Promise<void> {
    res.cookie(PENDING_COOKIE, id, { httpOnly: true, sameSite: 'lax', secure: await this.cookies.secure(req), path: '/api/core/oidc', maxAge: PENDING_MS });
  }

  /** The provider returns here; on success the session cookie is set and the app opens. */
  @Public()
  @Get('oidc/callback')
  async callback(@Req() req: Request, @Res() res: Response): Promise<void> {
    const id = (req.cookies as Record<string, string> | undefined)?.[PENDING_COOKIE];
    res.clearCookie(PENDING_COOKIE, { path: '/api/core/oidc' });
    const query = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    const result = await this.oidc.complete(id, query);
    if ('error' in result) {
      await this.audit.log('auth.oidc-failed', { code: result.error }, null);
      return res.redirect(302, `/?oidcError=${encodeURIComponent(result.error)}`);
    }
    if (result.linked) {
      await this.audit.log('users.oidc-linked', { userId: result.user.id }, result.user.id);
      return res.redirect(302, '/profile?oidcLinked=1');
    }
    const em = this.em.fork();
    const user = await em.findOneOrFail(User, result.user.id);
    res.cookie(SESSION_COOKIE, await this.auth.openSession(em, user), sessionCookieOptions(await this.cookies.secure(req)));
    await this.audit.log('auth.login', { via: 'oidc' }, user.id);
    res.redirect(302, '/');
  }

  /** Removes the link to the OIDC account, e.g. after a change of the e-mail address. */
  @Delete('users/:id/oidc')
  @HttpCode(204)
  @RequirePermissions('core.users.manage')
  async unlink(@Param('id') id: string, @CurrentUser() current: AuthenticatedUser): Promise<void> {
    const em = this.em.fork();
    const user = await em.findOne(User, id, { populate: ['roles.role'] });
    if (!user) throw new NotFoundException();
    await this.auth.assertMayManage(current, user);
    user.oidcSubject = null;
    await em.flush();
    await this.audit.log('users.oidc-unlinked', { userId: id });
  }
}
