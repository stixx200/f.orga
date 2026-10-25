import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthenticatedUser } from './authenticated-user.js';

export const PUBLIC = 'forga:public';
export const REQUIRED_PERMISSIONS = 'forga:permissions';

/** The endpoint can be called without authentication. */
export const Public = () => SetMetadata(PUBLIC, true);

/**
 * The caller needs every listed permission (in at least one department).
 * Department-specific checks happen in the handler with `user.can(permission, departmentId)`.
 */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(REQUIRED_PERMISSIONS, permissions);

/** The authenticated user of the request. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser =>
    context.switchToHttp().getRequest<{ user: AuthenticatedUser }>().user,
);
