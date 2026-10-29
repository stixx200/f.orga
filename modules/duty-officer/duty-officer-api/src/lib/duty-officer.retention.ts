import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { HistoryEntry, type PersonDataRegistry, type RetentionRegistry } from '@forga/core-api';
import { DutyAssignmentEntity, ExpectedReportEntity, IncidentExemptionEntity } from './duty-officer.entities.js';

/**
 * The duty officer side of the retention plan: the EvD reports are reports of their incident and follow it in the
 * incidents module; this module keeps per incident whether a report is expected or exempted (with a reason), and notes on
 * the duties of persons.
 */
@Injectable()
export class DutyOfficerRetention {
  constructor(private readonly em: EntityManager) {}

  register(retention: RetentionRegistry, personData: PersonDataRegistry): void {
    retention.registerDependent('incidents.incidents', 'duty-officer', {
      execute: async (records, action) => {
        const ids = records.map((r) => r.id);
        if (!ids.length) return;
        const em = this.em.fork();
        const exemptions = await em.find(IncidentExemptionEntity, { incidentId: { $in: ids } }, { fields: ['id'] });
        if (action === 'delete') {
          await em.nativeDelete(ExpectedReportEntity, { incidentId: { $in: ids } });
          await em.nativeDelete(IncidentExemptionEntity, { incidentId: { $in: ids } });
        } else {
          // The reason may name persons ("EvD war erkrankt").
          await em.nativeUpdate(IncidentExemptionEntity, { incidentId: { $in: ids } }, { reason: '', by: '' });
        }
        if (exemptions.length) await em.nativeDelete(HistoryEntry, { entity: 'duty_officer.incident_exemption', entityId: { $in: exemptions.map((e) => e.id) } });
      },
    });
    // Anonymised persons: notes on their duties are emptied, and so is the history holding them.
    personData.register('duty-officer', {
      anonymize: async (personIds) => {
        const em = this.em.fork();
        const duties = await em.find(DutyAssignmentEntity, { personId: { $in: [...personIds] } }, { fields: ['id'] });
        if (!duties.length) return;
        await em.nativeUpdate(DutyAssignmentEntity, { personId: { $in: [...personIds] } }, { notes: '' });
        await em.nativeDelete(HistoryEntry, { entity: 'duty_officer.duty_assignment', entityId: { $in: duties.map((d) => d.id) } });
      },
    });
  }
}
