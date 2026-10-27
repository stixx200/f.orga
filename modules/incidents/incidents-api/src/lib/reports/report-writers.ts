import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { computeGrants, OrganizationDirectory, PermissionRegistry, User } from '@forga/core-api';
import type { Grant } from '@forga/core-contracts';
import { IncidentUnitsRegistry } from '../units/units.registry.js';
import { RELEASE, WRITE } from './reports.service.js';

/** Persons who may write the reports of a department, by department. */
export interface ReportWriterIndex {
  /** Persons with an active account that may write reports of the department (or release reports). */
  of(departmentId: string): Set<string>;
  /** Persons with an active account that may write the reports of the brigade-wide unit (or release reports). */
  ofUnit(unit: string): Set<string>;
}

const covers = (grant: Grant | undefined, departmentId: string) => grant === 'brigade' || (Array.isArray(grant) && grant.includes(departmentId));

/**
 * Who can actually write a report: only persons linked to an active user account with `incidents.reports.write`
 * for the department, or releasers. Authors without such an account would never see their report.
 */
@Injectable()
export class ReportWriters {
  constructor(
    private readonly em: EntityManager,
    private readonly registry: PermissionRegistry,
    private readonly organization: OrganizationDirectory,
    private readonly units: IncidentUnitsRegistry,
  ) {}

  async index(): Promise<ReportWriterIndex> {
    const users = await this.em.fork().find(User, { active: true, personId: { $ne: null } }, { populate: ['roles.role'] });
    const subDepartments = await this.organization.subDepartments();
    const unitPermissions = new Set(this.units.all().map((u) => u.writePermission));
    const known = this.registry.all.filter((p) => p.id === WRITE || p.id === RELEASE || unitPermissions.has(p.id));
    const grants = users.map((user) => ({
      personId: user.personId as string,
      grants: computeGrants(
        known,
        user.roles.getItems().flatMap((a) => [
          { patterns: a.role.permissions, departmentId: a.departmentId ?? null },
          { patterns: a.role.permissionsAllDepartments ?? [], departmentId: null },
        ]),
        subDepartments,
      ),
    }));
    const cache = new Map<string, Set<string>>();
    return {
      of: (departmentId) => {
        let persons = cache.get(departmentId);
        if (!persons) {
          persons = new Set(
            grants.filter((g) => g.grants.get(RELEASE) === 'brigade' || covers(g.grants.get(WRITE), departmentId)).map((g) => g.personId),
          );
          cache.set(departmentId, persons);
        }
        return persons;
      },
      ofUnit: (key) => {
        const permission = this.units.get(key)?.writePermission;
        let persons = cache.get(`unit:${key}`);
        if (!persons) {
          persons = new Set(grants.filter((g) => g.grants.get(RELEASE) === 'brigade' || (permission && g.grants.get(permission) === 'brigade')).map((g) => g.personId));
          cache.set(`unit:${key}`, persons);
        }
        return persons;
      },
    };
  }
}
