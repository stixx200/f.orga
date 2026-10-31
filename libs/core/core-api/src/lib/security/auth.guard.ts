import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { UserContext } from '../user-context.js';
import { AuthService, IDLE_HEADER, SESSION_COOKIE } from './auth.service.js';
import type { AuthenticatedUser } from './authenticated-user.js';
import { PUBLIC, REQUIRED_PERMISSIONS, STEP_UP } from './decorators.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Browsers only send custom headers same-origin, so this header proves the request came from the UI. */
export const CSRF_HEADER = 'x-forga';

/**
 * Global guard: authenticates via session cookie or `Authorization: Bearer <api-token>`
 * and checks the permissions declared with `@RequirePermissions`. A permission with `stepUp` the user holds but which
 * waits for the second factor, and endpoints marked `@StepUp()`, answer `403 auth.stepUpRequired` until the session is
 * confirmed.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC, targets) ?? false;
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();

    const user = await this.authenticate(request);
    if (user) {
      request.user = user;
      UserContext.set(user.id, user.impersonator?.id ?? null);
    }
    // Changes from a browser always carry the header, also without a session (login, setup, password reset): a form of
    // another site cannot sign the browser in to an account of the attacker (login CSRF). API tokens need no header.
    if (!isPublic && !user) throw new UnauthorizedException({ code: 'auth.required' });
    if (user?.via !== 'token' && !SAFE_METHODS.has(request.method) && request.headers[CSRF_HEADER] !== '1') {
      throw new ForbiddenException({ code: 'auth.csrf' });
    }
    if (isPublic || !user) return true;

    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, targets) ?? [];
    if (required.some((permission) => !user.holds(permission))) {
      throw new ForbiddenException({ code: 'auth.forbidden', permissions: required });
    }
    if (required.some((permission) => !user.can(permission))) throw user.stepUpRequired();
    const stepUp = this.reflector.getAllAndOverride<boolean>(STEP_UP, targets) ?? false;
    if (stepUp && !user.elevatedUntil && (await this.auth.securitySettings()).mfaEnabled) throw user.stepUpRequired();
    return true;
  }

  private async authenticate(request: Request): Promise<AuthenticatedUser | null> {
    const header = request.headers.authorization;
    if (header?.startsWith('Bearer ')) return this.auth.userFromApiToken(header.slice(7).trim(), request.ip ?? null);
    const cookie = (request.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (!cookie) return null;
    const idle = Number(request.headers[IDLE_HEADER]);
    return this.auth.userFromSession(cookie, Number.isFinite(idle) ? idle : null);
  }
}
