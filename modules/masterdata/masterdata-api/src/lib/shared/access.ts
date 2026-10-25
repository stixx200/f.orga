import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '@forga/core-api';

/** Throws unless the user holds the permission for the department (or brigade-wide). */
export function requireDepartment(user: AuthenticatedUser, permission: string, departmentId: string | null): void {
  if (!user.can(permission, departmentId)) {
    throw new ForbiddenException({ code: 'auth.forbidden', permissions: [permission] });
  }
}

/** Throws unless the user holds the permission brigade-wide. */
export function requireBrigade(user: AuthenticatedUser, permission: string): void {
  if (user.grant(permission) !== 'brigade') {
    throw new ForbiddenException({ code: 'auth.forbidden', permissions: [permission] });
  }
}

/** `YYYY-MM-DD` of today in local time. */
export function today(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
