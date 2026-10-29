import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Request, Response } from 'express';
import { Audit, CookiePolicy, CSRF_HEADER, RateLimits, UserContext } from '@forga/core-api';
import { KIOSK_API_PATH, TERMINAL_COOKIE } from '@forga/info-terminal-contracts';
import { TerminalEntity } from '../info-terminal.entities.js';
import { hashDeviceKey, sameHash } from '../security/device-keys.js';

/** The device cookie lives 400 days and is renewed while the terminal is used. */
const COOKIE_MAX_AGE_MS = 400 * 24 * 3_600_000;
const SEEN_INTERVAL_MS = 60_000;
const HOUR_MS = 3_600_000;
/** Wrong keys per address: 10 in 10 minutes, then blocked for 10 minutes. */
const FAILURES = { limit: 10, windowMs: 10 * 60_000, blockMs: 10 * 60_000 };
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type KioskRequest = Request & { terminal?: TerminalEntity };

/** The authenticated terminal of a kiosk request (set by `TerminalGuard`). */
export const CurrentTerminal = createParamDecorator((_data: unknown, context: ExecutionContext): TerminalEntity => context.switchToHttp().getRequest<KioskRequest>().terminal!);

/**
 * Authentication of the info terminals by their device key: the key from the link once (`exchange`), afterwards the
 * cookie `forga_terminal`. Wrong keys are limited per address (10 in 10 minutes, then the address is blocked for
 * 10 minutes) and written to the audit log at most once per address and hour.
 */
@Injectable()
export class TerminalAuth {
  constructor(
    private readonly em: EntityManager,
    private readonly audit: Audit,
    private readonly cookies: CookiePolicy,
    private readonly rateLimits: RateLimits,
  ) {}

  /** `Secure` like the session cookie (`CookiePolicy`). */
  async cookieOptions(req: Request) {
    return { httpOnly: true, sameSite: 'strict' as const, secure: await this.cookies.secure(req), path: KIOSK_API_PATH, maxAge: COOKIE_MAX_AGE_MS };
  }

  /**
   * The terminal of a key: `401 info-terminal.invalidKey` for unknown keys, `403 info-terminal.revoked` for revoked
   * terminals, `429 info-terminal.tooManyAttempts` while the address is blocked.
   */
  async authenticate(key: string | undefined, ip: string): Promise<TerminalEntity> {
    if (await this.rateLimits.blocked('info-terminal.key', ip)) throw new HttpException({ code: 'info-terminal.tooManyAttempts' }, HttpStatus.TOO_MANY_REQUESTS);
    const hash = key ? hashDeviceKey(key) : '';
    const terminal = hash ? await this.em.fork().findOne(TerminalEntity, { keyHash: hash }) : null;
    if (!terminal || !sameHash(terminal.keyHash, hash)) {
      if (key) {
        await this.rateLimits.hit('info-terminal.key', ip, FAILURES);
        if (await this.rateLimits.hit('info-terminal.key-logged', ip, { limit: 1, windowMs: HOUR_MS })) await this.audit.log('info-terminal.invalid-key', { ip }, null);
      }
      throw new UnauthorizedException({ code: 'info-terminal.invalidKey' });
    }
    if (terminal.revokedAt) throw new ForbiddenException({ code: 'info-terminal.revoked' });
    return terminal;
  }

  /** Records the terminal as seen (at most once a minute, without history) and renews the cookie then. */
  async seen(terminal: TerminalEntity, key: string, res: Response): Promise<void> {
    const now = Date.now();
    if (terminal.lastSeenAt && now - terminal.lastSeenAt.getTime() < SEEN_INTERVAL_MS) return;
    await this.em.fork().nativeUpdate(TerminalEntity, { id: terminal.id }, { lastSeenAt: new Date(now) });
    res.cookie(TERMINAL_COOKIE, key, await this.cookieOptions(res.req));
  }
}

/**
 * Guard of the kiosk endpoints (they are `@Public()` for the global guard): only the device cookie counts, sessions
 * and API tokens do not. Changes need the header `x-forga: 1` like every UI request. The history of what the terminal
 * changes names its technical user.
 */
@Injectable()
export class TerminalGuard implements CanActivate {
  constructor(private readonly auth: TerminalAuth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<KioskRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    if (!SAFE_METHODS.has(request.method) && request.headers[CSRF_HEADER] !== '1') throw new ForbiddenException({ code: 'auth.csrf' });
    const key = (request.cookies as Record<string, string> | undefined)?.[TERMINAL_COOKIE];
    const terminal = await this.auth.authenticate(key, request.ip ?? '');
    request.terminal = terminal;
    UserContext.set(terminal.userId);
    await this.auth.seen(terminal, key as string, response);
    return true;
  }
}
