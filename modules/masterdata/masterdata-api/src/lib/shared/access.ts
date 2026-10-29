import { ForbiddenException } from '@nestjs/common';
import { berlinDate, type AuthenticatedUser } from '@forga/core-api';

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

/** `YYYY-MM-DD` of today in Europe/Berlin, independent of the server's time zone. */
export function today(): string {
  return berlinDate();
}

/** Lists with contact details of many members (phone list, member list for contacting; L11). */
export const LISTS_CONTACT = 'masterdata.lists.contact';
