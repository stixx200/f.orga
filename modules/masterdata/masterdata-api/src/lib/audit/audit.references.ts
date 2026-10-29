import type { EntityManager } from '@mikro-orm/core';
import type { AuditReferenceRegistry } from '@forga/core-api';
import { Department, Person, Station, Vehicle } from '../masterdata.entities.js';

const ORGANIZATION = 'masterdata.organization.manage';

/** Persons, departments, stations and vehicles in audit entries: „Nachname, Vorname“, names and designations. */
export function registerAuditReferences(registry: AuditReferenceRegistry, em: EntityManager): void {
  registry.register('masterdata.person', {
    keys: ['personId', 'previousPersonId'],
    resolve: async (ids, user) => {
      const persons = await em.fork().find(Person, { id: { $in: [...ids] } }, { fields: ['id', 'firstName', 'lastName', 'anonymizedAt'] });
      const read = user.can('masterdata.persons.read');
      return new Map(
        persons.map((p) => [
          p.id,
          p.anonymizedAt ? { label: null, anonymized: true } : { label: `${p.lastName}, ${p.firstName}`, to: read ? `/masterdata/persons/${p.id}` : undefined },
        ]),
      );
    },
  });
  registry.register('masterdata.department', {
    keys: ['departmentId', 'departmentIds', 'departmentsBefore', 'departmentsAfter'],
    resolve: async (ids, user) => {
      const departments = await em.fork().find(Department, { id: { $in: [...ids] } }, { fields: ['id', 'name'] });
      const to = user.can(ORGANIZATION) ? '/masterdata/organization' : undefined;
      return new Map(departments.map((d) => [d.id, { label: d.name, to }]));
    },
  });
  // A moved department: previous and new parent department.
  registry.register('masterdata.parent-department', {
    keys: ['from', 'to'],
    actions: ['masterdata.department-moved'],
    resolve: async (ids, user) => {
      const departments = await em.fork().find(Department, { id: { $in: [...ids] } }, { fields: ['id', 'name'] });
      const to = user.can(ORGANIZATION) ? '/masterdata/organization' : undefined;
      return new Map(departments.map((d) => [d.id, { label: d.name, to }]));
    },
  });
  registry.register('masterdata.station', {
    keys: ['stationId'],
    resolve: async (ids, user) => {
      const stations = await em.fork().find(Station, { id: { $in: [...ids] } }, { fields: ['id', 'name'] });
      const to = user.can(ORGANIZATION) ? '/masterdata/organization' : undefined;
      return new Map(stations.map((s) => [s.id, { label: s.name, to }]));
    },
  });
  registry.register('masterdata.vehicle', {
    keys: ['vehicleId'],
    resolve: async (ids, user) => {
      const vehicles = await em.fork().find(Vehicle, { id: { $in: [...ids] } }, { fields: ['id', 'designation', 'radioCallSign'] });
      const to = user.can(ORGANIZATION) ? '/masterdata/vehicles' : undefined;
      return new Map(vehicles.map((v) => [v.id, { label: v.radioCallSign ? `${v.designation} (${v.radioCallSign})` : v.designation, to }]));
    },
  });
}
