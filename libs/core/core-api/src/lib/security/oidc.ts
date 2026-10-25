import { Controller, Delete, Get, HttpCode, Inject, Injectable, Logger, NotFoundException, Param, Req, Res } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Request, Response } from 'express';
import * as client from 'openid-client';
import type { BrigadeSettings, OidcSettings } from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from '../options.js';
import { SettingsService } from '../settings/settings.js';
import { AuthService, SESSION_COOKIE, sessionCookieOptions } from './auth.service.js';
import { Public, RequirePermissions } from './decorators.js';
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
}

/** Plain-HTTP issuers are accepted only on the local machine (development, tests). */
const isLocal = (url: URL) => url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);

/**
 * Sign-in with an OpenID Connect provider: authorization code flow with PKCE, state and nonce.
 * Only existing, active users can sign in; the first sign-in links the account by e-mail or username.
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
  ) {}

  async config(): Promise<{ settings: OidcSettings; config: client.Configuration; baseUrl: string } | null> {
    const settings = await this.settings.get<OidcSettings>('oidc');
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    // The redirect address comes from the configuration, never from request headers.
    const baseUrl = (brigade?.publicUrl || process.env['FORGA_PUBLIC_URL'] || '').replace(/\/$/, '');
    if (!settings?.enabled || !settings.issuer || !settings.clientId || !baseUrl) return null;
    const key = JSON.stringify([settings.issuer, settings.clientId, settings.clientSecret ?? '']);
    if (this.cached?.key !== key) {
      const issuer = new URL(settings.issuer);
      const config = await client.discovery(issuer, settings.clientId, undefined, settings.clientSecret ? client.ClientSecretPost(settings.clientSecret) : client.None(), {
        execute: isLocal(issuer) ? [client.allowInsecureRequests] : [],
        timeout: 10,
      });
      this.cached = { key, config };
    }
    return { settings, config: this.cached.config, baseUrl };
  }

  /** Starts a sign-in: returns the provider URL and the value of the pending cookie. */
  async start(): Promise<{ url: string; id: string } | null> {
    const setup = await this.config();
    if (!setup) return null;
    const now = Date.now();
    for (const [id, p] of this.pending) if (p.expiresAt < now) this.pending.delete(id);
    if (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.keys().next().value!);
    const pending: Pending = { state: client.randomState(), nonce: client.randomNonce(), verifier: client.randomPKCECodeVerifier(), expiresAt: now + PENDING_MS };
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
  async complete(id: string | undefined, query: string): Promise<{ user: User } | { error: string }> {
    const pending = id ? this.pending.get(id) : undefined;
    if (id) this.pending.delete(id);
    if (!pending || pending.expiresAt < Date.now()) return { error: 'auth.oidcExpired' };
    const setup = await this.config();
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
    if (!user) {
      const email = typeof claims['email'] === 'string' && claims['email_verified'] !== false ? claims['email'].toLowerCase() : null;
      const username = typeof claims['preferred_username'] === 'string' ? claims['preferred_username'] : null;
      const candidates =
        setup.settings.matchBy === 'email'
          ? email
            ? (await em.find(User, { oidcSubject: null, technical: false })).filter((u) => u.email?.toLowerCase() === email)
            : []
          : username
            ? await em.find(User, { username, oidcSubject: null, technical: false })
            : [];
      // Ambiguous e-mail addresses are not linked.
      if (candidates.length !== 1) return { error: 'auth.oidcUnknownUser' };
      user = candidates[0];
      user.oidcSubject = subject;
      await em.flush();
    }
    if (!user.active || user.technical) return { error: 'auth.oidcUnknownUser' };
    return { user };
  }
}

@Controller('core')
export class OidcController {
  constructor(
    private readonly oidc: OidcService,
    private readonly auth: AuthService,
    private readonly em: EntityManager,
    private readonly audit: Audit,
    @Inject(FORGA_CORE_OPTIONS) private readonly options: ForgaCoreOptions,
  ) {}

  /** Redirects to the provider. */
  @Public()
  @Get('oidc/start')
  async start(@Res() res: Response): Promise<void> {
    const started = await this.oidc.start().catch(() => null);
    if (!started) return res.redirect(302, '/?oidcError=auth.oidcDisabled');
    res.cookie(PENDING_COOKIE, started.id, { httpOnly: true, sameSite: 'lax', secure: this.options.secureCookies, path: '/api/core/oidc', maxAge: PENDING_MS });
    res.redirect(302, started.url);
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
    const em = this.em.fork();
    const user = await em.findOneOrFail(User, result.user.id);
    res.cookie(SESSION_COOKIE, await this.auth.openSession(em, user), sessionCookieOptions(this.options.secureCookies));
    await this.audit.log('auth.login', { via: 'oidc' }, user.id);
    res.redirect(302, '/');
  }

  /** Removes the link to the OIDC account, e.g. after a change of the e-mail address. */
  @Delete('users/:id/oidc')
  @HttpCode(204)
  @RequirePermissions('core.users.manage')
  async unlink(@Param('id') id: string): Promise<void> {
    const em = this.em.fork();
    const user = await em.findOne(User, id);
    if (!user) throw new NotFoundException();
    user.oidcSubject = null;
    await em.flush();
    await this.audit.log('users.oidc-unlinked', { userId: id });
  }
}
