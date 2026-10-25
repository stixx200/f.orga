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

export class AuthenticatedUser {
  constructor(
    readonly id: string,
    readonly username: string,
    readonly displayName: string,
    readonly personId: string | null,
    readonly language: Language,
    readonly grants: ReadonlyMap<string, Grant>,
    /** How the request was authenticated. Cookie sessions need CSRF protection, tokens do not. */
    readonly via: 'session' | 'token',
  ) {}

  /** Set while an administrator acts as this user (impersonation). */
  impersonator: { id: string; displayName: string; endsAt: Date } | null = null;

  /**
   * Without a department: does the user have the permission anywhere?
   * With a department: there or brigade-wide?
   */
  can(permission: string, departmentId?: string | null): boolean {
    const grant = this.grants.get(permission);
    if (!grant) return false;
    if (grant === 'brigade' || departmentId === undefined) return true;
    return departmentId !== null && grant.includes(departmentId);
  }

  /** For queries: `brigade`, the allowed departments, or `null` (none). */
  grant(permission: string): Grant | null {
    return this.grants.get(permission) ?? null;
  }

  /** Does the user hold any permission of the module? */
  canAnythingIn(moduleId: string): boolean {
    return [...this.grants.keys()].some((p) => p.startsWith(`${moduleId}.`));
  }
}
