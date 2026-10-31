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
import type { Request, Response } from 'express';
import { Audit, CookiePolicy, CSRF_HEADER, RateLimits } from '@forga/core-api';
import { KIOSK_API_PATH, PERSONAL_COOKIE } from '@forga/personal-contracts';
import { LinksService } from '../links/links.service.js';
import type { AccessLinkEntity } from '../personal.entities.js';

/** The cookie lives 400 days and is renewed while the personal view is used. */
const COOKIE_MAX_AGE_MS = 400 * 24 * 3_600_000;
const SEEN_INTERVAL_MS = 60_000;
const HOUR_MS = 3_600_000;
/** Wrong keys per address: 10 in 10 minutes, then blocked for 10 minutes. */
const FAILURES = { limit: 10, windowMs: 10 * 60_000, blockMs: 10 * 60_000 };
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type KioskRequest = Request & { accessLink?: AccessLinkEntity };

/** The access link of a kiosk request (set by `AccessGuard`). */
export const CurrentLink = createParamDecorator((_data: unknown, context: ExecutionContext): AccessLinkEntity => context.switchToHttp().getRequest<KioskRequest>().accessLink!);

/**
 * Authentication of the personal view by its access key: the key from the link once (`session`), afterwards the
 * cookie `forga_personal`. Wrong keys are limited per address and written to the audit log at most once per hour.
 */
@Injectable()
export class AccessAuth {
  constructor(
    private readonly links: LinksService,
    private readonly audit: Audit,
    private readonly cookies: CookiePolicy,
    private readonly rateLimits: RateLimits,
  ) {}

  async cookieOptions(req: Request) {
    return { httpOnly: true, sameSite: 'strict' as const, secure: await this.cookies.secure(req), path: KIOSK_API_PATH, maxAge: COOKIE_MAX_AGE_MS };
  }

  /**
   * The link of a key: `401 personal.invalidKey` for unknown keys, `403 personal.revoked` for revoked links,
   * `429 personal.tooManyAttempts` while the address is blocked.
   */
  async authenticate(key: string | undefined, ip: string): Promise<AccessLinkEntity> {
    if (await this.rateLimits.blocked('personal.key', ip)) throw new HttpException({ code: 'personal.tooManyAttempts' }, HttpStatus.TOO_MANY_REQUESTS);
    const link = await this.links.findByKey(key);
    if (!link) {
      if (key) {
        await this.rateLimits.hit('personal.key', ip, FAILURES);
        if (await this.rateLimits.hit('personal.key-logged', ip, { limit: 1, windowMs: HOUR_MS })) await this.audit.log('personal.invalid-key', { ip }, null);
      }
      throw new UnauthorizedException({ code: 'personal.invalidKey' });
    }
    if (link.revokedAt) throw new ForbiddenException({ code: 'personal.revoked' });
    // A processing restriction (Art. 18) closes the kiosk even for a key that was issued before it.
    await this.links.assertNotRestricted(link);
    return link;
  }

  /** Records the link as seen (at most once a minute) and renews the cookie then. */
  async seen(link: AccessLinkEntity, key: string, res: Response): Promise<void> {
    const now = Date.now();
    if (link.lastSeenAt && now - link.lastSeenAt.getTime() < SEEN_INTERVAL_MS) return;
    await this.links.touch(link.id);
    res.cookie(PERSONAL_COOKIE, key, await this.cookieOptions(res.req));
  }
}

/**
 * Guard of the kiosk endpoints (they are `@Public()` for the global guard): only the access cookie counts.
 * Changes need the header `x-forga: 1` like every UI request.
 */
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(private readonly auth: AccessAuth) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<KioskRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    if (!SAFE_METHODS.has(request.method) && request.headers[CSRF_HEADER] !== '1') throw new ForbiddenException({ code: 'auth.csrf' });
    const key = (request.cookies as Record<string, string> | undefined)?.[PERSONAL_COOKIE];
    const link = await this.auth.authenticate(key, request.ip ?? '');
    request.accessLink = link;
    await this.auth.seen(link, key as string, response);
    return true;
  }
}
