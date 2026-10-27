import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';

/** A special service from the duty roster (e.g. duty officer), compensated per day. */
export const DutyAssignmentSchema = defineEntity({
  name: 'DutyAssignmentEntity',
  schema: 'duty_officer',
  tableName: 'duty_assignment',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    personId: p.string().index(),
    kind: p.string(),
    from: p.datetime().index(),
    to: p.datetime(),
    notes: p.text().default(''),
    /** UID of the calendar event; a second import of the same calendar updates instead of duplicating. */
    externalUid: p.string().nullable().unique(),
    version: p.integer().version(),
  },
});
export class DutyAssignmentEntity extends DutyAssignmentSchema.class {}
DutyAssignmentSchema.setClass(DutyAssignmentEntity);

/**
 * An incident that gets an EvD report: created while the module and the setting "EvD-Bericht für jeden Einsatz
 * anlegen" were active (not imported). Only these incidents are checked for a missing EvD report, so incidents from
 * before (e.g. imported from MP-Feuer) never show up as missing.
 */
export const ExpectedReportSchema = defineEntity({
  name: 'ExpectedReportEntity',
  schema: 'duty_officer',
  tableName: 'expected_report',
  properties: {
    /** Incident in the incidents module. */
    incidentId: p.uuid().primary(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});
export class ExpectedReportEntity extends ExpectedReportSchema.class {}
ExpectedReportSchema.setClass(ExpectedReportEntity);

/** "Kein EvD bei diesem Einsatz": the incident needs no EvD report; its draft was deleted. */
export const IncidentExemptionSchema = defineEntity({
  name: 'IncidentExemptionEntity',
  schema: 'duty_officer',
  tableName: 'incident_exemption',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    /** Incident in the incidents module. */
    incidentId: p.uuid().unique(),
    reason: p.text(),
    /** Display name of the user who exempted the incident. */
    by: p.string(),
    at: p.datetime(),
    version: p.integer().version(),
  },
});
export class IncidentExemptionEntity extends IncidentExemptionSchema.class {}
IncidentExemptionSchema.setClass(IncidentExemptionEntity);
