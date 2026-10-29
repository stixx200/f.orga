import type { EntityManager } from '@mikro-orm/core';
import type { AuditReferenceRegistry } from '@forga/core-api';
import type { Organization } from '@forga/masterdata-contracts';
import { IncidentEntity, ReportEntity } from '../incidents.entities.js';

const READ = 'incidents.reports.read';

/** Reports („2026-012 · Abteilung Nord“) and incidents (dispatch number) in audit entries. */
export function registerAuditReferences(registry: AuditReferenceRegistry, em: EntityManager, organization: Organization): void {
  registry.register('incidents.report', {
    keys: ['reportId'],
    resolve: async (ids, user) => {
      const reports = await em.fork().find(ReportEntity, { id: { $in: [...ids] } }, { fields: ['id', 'number', 'departmentId', 'unit'] });
      const departments = reports.some((r) => r.departmentId) ? new Map((await organization.departments()).map((d) => [d.id, d.name])) : new Map<string, string>();
      return new Map(
        reports.map((r) => {
          const owner = (r.departmentId && departments.get(r.departmentId)) || r.unit;
          return [r.id, { label: owner ? `${r.number} · ${owner}` : r.number, to: user.can(READ) ? `/incidents/reports/${r.id}` : undefined }];
        }),
      );
    },
  });
  registry.register('incidents.incident', {
    keys: ['incidentId'],
    resolve: async (ids, user) => {
      const incidents = await em.fork().find(IncidentEntity, { id: { $in: [...ids] } }, { fields: ['id', 'dispatchNumber'] });
      return new Map(incidents.map((i) => [i.id, { label: i.dispatchNumber, to: user.can(READ) ? `/incidents/incidents/${i.id}` : undefined }]));
    },
  });
}
