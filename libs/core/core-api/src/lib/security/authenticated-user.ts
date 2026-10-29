import { ForbiddenException, type HttpException } from '@nestjs/common';
import type { Grant, Language, Permission } from '@forga/core-contracts';

/** Does a permission match a pattern from a role? `*` = everything, `module.*` = everything of a module. */
export function matches(pattern: string, permission: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return permission.startsWith(pattern.slice(0, -1));
  return pattern === permission;
}

/** The given department and all departments below it (e.g. youth and veterans department of an operational department). */
export type SubDepartments = (departmentId: string) => readonly string[];

/**
 * Turns role assignments into effective grants.
 * An assignment for a department only applies to permissions with scope `department`;
 * it covers the departments below the assigned one as well (`subDepartments`).
 */
export function computeGrants(
  known: readonly Permission[],
  assignments: readonly { patterns: readonly string[]; departmentId: string | null }[],
  subDepartments: SubDepartments = (id) => [id],
): Map<string, Grant> {
  const result = new Map<string, Grant>();
  for (const permission of known) {
    for (const { patterns, departmentId } of assignments) {
      if (!patterns.some((p) => matches(p, permission.id))) continue;
      const current = result.get(permission.id);
      if (departmentId === null) {
        result.set(permission.id, 'brigade');
        break;
      }
      if (permission.scope !== 'department') continue;
      result.set(permission.id, [...new Set([...(current ?? []), departmentId, ...subDepartments(departmentId)])]);
    }
  }
  return result;
}

/** Permissions in `grants` that `actor` does not hold to the same extent (brigade-wide or for the same departments). */
export function widerThan(actor: Pick<AuthenticatedUser, 'grant'>, grants: ReadonlyMap<string, Grant>): string[] {
  return [...grants]
    .filter(([permission, grant]) => {
      const own = actor.grant(permission);
      if (!own) return true;
      if (own === 'brigade') return false;
      return grant === 'brigade' || grant.some((d) => !own.includes(d));
    })
    .map(([permission]) => permission);
}

/** Covers `grant` the department (or, without a department, anything)? */
function covers(grant: Grant | undefined, departmentId?: string | null): boolean {
  if (!grant) return false;
  if (grant === 'brigade' || departmentId === undefined) return true;
  return departmentId !== null && grant.includes(departmentId);
}

/** `403 auth.stepUpRequired`: the permission is held, but the session is not confirmed with the second factor. */
export function stepUpRequired(enrolled: boolean): ForbiddenException {
  return new ForbiddenException({ code: 'auth.stepUpRequired', enrolled });
}

export class AuthenticatedUser {
  constructor(
    readonly id: string,
    readonly username: string,
    readonly displayName: string,
    readonly personId: string | null,
    readonly language: Language,
    /** Permissions in effect. */
    readonly grants: ReadonlyMap<string, Grant>,
    /** How the request was authenticated. Cookie sessions need CSRF protection, tokens do not. */
    readonly via: 'session' | 'token',
    /**
     * Permissions with `stepUp` the user holds but which are not in effect, because the session is not confirmed with
     * the second factor. They count as missing until the step-up.
     */
    readonly locked: ReadonlyMap<string, Grant> = new Map(),
  ) {}

  /** Set while an administrator acts as this user (impersonation). */
  impersonator: { id: string; displayName: string; endsAt: Date } | null = null;
  /** SHA-256 of the session cookie (sessions only). */
  sessionId: string | null = null;
  /** End of the step-up confirmation of the session. */
  elevatedUntil: Date | null = null;
  /** Has the user (during an impersonation: the administrator) set up a second factor? */
  mfaEnrolled = false;

  /**
   * Without a department: does the user have the permission anywhere?
   * With a department: there or brigade-wide? Permissions waiting for the step-up do not count.
   */
  can(permission: string, departmentId?: string | null): boolean {
    return covers(this.grants.get(permission), departmentId);
  }

  /** For queries: `brigade`, the allowed departments, or `null` (none). Permissions waiting for the step-up do not count. */
  grant(permission: string): Grant | null {
    return this.grants.get(permission) ?? null;
  }

  /** Does the user hold the permission, in effect or waiting for the step-up (e.g. to offer a page or list)? */
  holds(permission: string, departmentId?: string | null): boolean {
    return this.can(permission, departmentId) || covers(this.locked.get(permission), departmentId);
  }

  /** Held grant including permissions waiting for the step-up. */
  heldGrant(permission: string): Grant | null {
    return this.grants.get(permission) ?? this.locked.get(permission) ?? null;
  }

  /** Would the step-up give the user this permission (where it is missing now)? */
  needsStepUp(permission: string, departmentId?: string | null): boolean {
    return !this.can(permission, departmentId) && covers(this.locked.get(permission), departmentId);
  }

  /** `403 auth.stepUpRequired` with whether a second factor is set up. */
  stepUpRequired(): ForbiddenException {
    return stepUpRequired(this.mfaEnrolled);
  }

  /**
   * The error for a missing permission: `auth.stepUpRequired` if the step-up would give one of them, otherwise
   * `auth.forbidden`. Write paths use it, so sensitive data is refused instead of silently ignored.
   */
  denied(permissions: readonly string[], departmentId?: string | null): HttpException {
    if (permissions.some((p) => this.needsStepUp(p, departmentId))) return this.stepUpRequired();
    return new ForbiddenException({ code: 'auth.forbidden', permissions });
  }

  /** Does the user hold any permission of the module (also one waiting for the step-up)? */
  canAnythingIn(moduleId: string): boolean {
    return [...this.grants.keys(), ...this.locked.keys()].some((p) => p.startsWith(`${moduleId}.`));
  }
}
