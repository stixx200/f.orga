import { Injectable } from '@nestjs/common';
import type { ProcessingRestrictionReason } from '@forga/core-contracts';
import type { AuthenticatedUser, SubDepartments } from './authenticated-user.js';

export interface DepartmentNode {
  id: string;
  /** Department this one belongs to, e.g. the operational department of a youth fire brigade. */
  parentId: string | null;
}

export interface PersonSummary {
  id: string;
  firstName: string;
  lastName: string;
  /** Empty when the person has no e-mail address. */
  email: string;
  /** Departments that decide who may see the person's data (current memberships, or the last ones after leaving). */
  departmentIds: string[];
  /** Postal address, e.g. for reply letters to data protection requests. */
  street?: string;
  postalCode?: string;
  city?: string;
}

/**
 * What the core needs to know about departments and persons, provided by the master data module
 * (the core does not import modules). Without a provider, department and person references are not checked.
 */
export interface OrganizationProvider {
  departments(): Promise<DepartmentNode[]>;
  persons(ids: readonly string[]): Promise<PersonSummary[]>;
  /** Number of catalog entries, for the setup checklist. */
  catalogEntries(): Promise<number>;
  /**
   * Permission needed (in a department of the person, or brigade-wide) to link a user to the person: the linked user
   * reads and changes the person's own data, including sensitive fields.
   */
  linkPermission: string;
  /** Persons whose name matches the query, as far as the user may see them (pickers, e.g. list parameters). */
  searchPersons?(user: AuthenticatedUser, query: string, limit: number): Promise<{ id: string; label: string }[]>;
  /**
   * Persons whose processing is restricted (Art. 18): they disappear from deadlines, search and e-mails of the core.
   */
  restrictedPersonIds?(): Promise<string[]>;
  /** Restricts the processing of a person (a request with `restrict`); `false` if the person is unknown. */
  restrictProcessing?(personId: string, restriction: { reason: ProcessingRestrictionReason; until: string | null; requestId: string | null }): Promise<boolean>;
}

@Injectable()
export class OrganizationDirectory {
  private provider: OrganizationProvider | null = null;

  register(provider: OrganizationProvider): void {
    this.provider = provider;
  }

  get available(): boolean {
    return this.provider !== null;
  }

  async departments(): Promise<DepartmentNode[]> {
    return this.provider ? this.provider.departments() : [];
  }

  /** For grant computation: a department together with all departments below it, recursively. */
  async subDepartments(): Promise<SubDepartments> {
    const departments = await this.departments();
    if (!departments.length) return (id) => [id];
    const children = new Map<string, string[]>();
    for (const d of departments) if (d.parentId) children.set(d.parentId, [...(children.get(d.parentId) ?? []), d.id]);
    const cache = new Map<string, string[]>();
    return (id) => {
      const cached = cache.get(id);
      if (cached) return cached;
      const result: string[] = [];
      const queue = [id];
      // Visited set: a cycle in the data must not hang the server.
      while (queue.length) {
        const next = queue.shift()!;
        if (result.includes(next)) continue;
        result.push(next);
        queue.push(...(children.get(next) ?? []));
      }
      cache.set(id, result);
      return result;
    };
  }

  /** IDs from `ids` that are no known department; empty without a provider. */
  async unknownDepartments(ids: readonly string[]): Promise<string[]> {
    if (!this.provider || !ids.length) return [];
    const known = new Set((await this.provider.departments()).map((d) => d.id));
    return ids.filter((id) => !known.has(id));
  }

  /** The persons with these IDs; `null` without a provider (references cannot be checked). */
  async persons(ids: readonly string[]): Promise<PersonSummary[] | null> {
    if (!this.provider) return null;
    // Person IDs are UUIDs; anything else cannot exist (and must not reach the database as UUID).
    const valid = ids.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
    return valid.length ? this.provider.persons(valid) : [];
  }

  async catalogEntries(): Promise<number | null> {
    return this.provider ? this.provider.catalogEntries() : null;
  }

  /** Permission needed to link a user to a person; `null` without a provider. */
  get linkPermission(): string | null {
    return this.provider?.linkPermission ?? null;
  }

  /** Persons whose processing is restricted (Art. 18); empty without a provider. */
  async restrictedPersonIds(): Promise<Set<string>> {
    return new Set(this.provider?.restrictedPersonIds ? await this.provider.restrictedPersonIds() : []);
  }

  /** Restricts the processing of a person; `false` without a provider or for an unknown person. */
  async restrictProcessing(personId: string, restriction: { reason: ProcessingRestrictionReason; until: string | null; requestId: string | null }): Promise<boolean> {
    return this.provider?.restrictProcessing ? this.provider.restrictProcessing(personId, restriction) : false;
  }

  async searchPersons(user: AuthenticatedUser, query: string, limit = 20): Promise<{ id: string; label: string }[]> {
    return this.provider?.searchPersons ? this.provider.searchPersons(user, query, limit) : [];
  }
}
