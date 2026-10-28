import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { LocalizedText } from '@forga/core-contracts';
import type {
  BreathingDevice,
  CompensationKind,
  FalseAlarmType,
  IncidentStatistics,
  Location,
  MainType,
  PartyRole,
  ReportStatus,
  StatisticsCheck,
  StatisticsValue,
  TechnicalCategory,
  Weather,
} from '@forga/incidents-contracts';

export const AlarmKeywordSchema = defineEntity({
  name: 'AlarmKeywordEntity',
  schema: 'incidents',
  tableName: 'alarm_keyword',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    key: p.string().unique(),
    name: p.json<LocalizedText>(),
    mainType: p.string().$type<MainType>().nullable(),
    technicalCategory: p.string().$type<TechnicalCategory>().nullable(),
    falseAlarmType: p.string().$type<FalseAlarmType>().nullable(),
    requiresVehicle: p.boolean().default(true),
    compensationKind: p.string().$type<CompensationKind>().default('incident'),
    active: p.boolean().default(true),
    /** Other names imports match the keyword by; unique among the keywords. */
    aliases: p.json<string[]>(),
    version: p.integer().version(),
  },
});
export class AlarmKeywordEntity extends AlarmKeywordSchema.class {}
AlarmKeywordSchema.setClass(AlarmKeywordEntity);

export const IncidentSchema = defineEntity({
  name: 'IncidentEntity',
  schema: 'incidents',
  tableName: 'incident',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    dispatchNumber: p.string().unique(),
    internalNumber: p.boolean().default(false),
    alarmKeyword: p.string(),
    alarmMessage: p.text().default(''),
    alarmedAt: p.datetime().index(),
    location: p.json<Location>(),
    createdVia: p.string().$type<'ui' | 'api' | 'import'>().default('ui'),
    /** Costs and notes apply to the whole incident, entered by the commander (`incidents.costs`), not per report. */
    chargeable: p.boolean().default(false),
    chargeableReason: p.text().default(''),
    notes: p.text().default(''),
    /** Statistics features, once per incident (not per report); `null` until filled in. */
    statistics: p.json<IncidentStatistics>().nullable(),
    reports: () => p.oneToMany(ReportEntity).mappedBy('incident'),
    version: p.integer().version(),
  },
});
export class IncidentEntity extends IncidentSchema.class {}
IncidentSchema.setClass(IncidentEntity);

export interface StoredAcknowledgement {
  rule: string;
  subject: string | null;
  reason: string;
  userId: string | null;
  at: string;
}

export const ReportSchema = defineEntity({
  name: 'ReportEntity',
  schema: 'incidents',
  tableName: 'report',
  // A report belongs to a department or to a brigade-wide unit (`unit`); one per incident each, numbered per year.
  uniques: [
    { properties: ['incident', 'departmentId'] },
    { properties: ['departmentId', 'number'] },
    { properties: ['incident', 'unit'] },
    { properties: ['unit', 'number'] },
  ],
  checks: [{ name: 'report_department_or_unit', expression: '("department_id" is null) <> ("unit" is null)' }],
  indexes: [
    {
      name: 'report_one_primary_per_incident',
      expression:
        'create unique index "report_one_primary_per_incident" on "incidents"."report" ("incident_id") where "primary"',
    },
  ],
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    incident: () => p.manyToOne(IncidentEntity).deleteRule('cascade'),
    /** Department in the masterdata module; `null` for the report of a brigade-wide unit. */
    departmentId: p.string().nullable(),
    /** Key of a brigade-wide unit registered with `INCIDENT_UNITS` (e.g. `duty-officer`); `null` for department reports. */
    unit: p.string().nullable(),
    number: p.string(),
    /** At most one primary report per incident (partial unique index). */
    primary: p.boolean().default(false),
    status: p.string().$type<ReportStatus>().default('draft'),
    locked: p.boolean().default(false),
    lockedBy: p.string().nullable(),
    lockedAt: p.datetime().nullable(),
    returnComment: p.text().nullable(),
    authorPersonId: p.string().nullable(),
    alarmedAt: p.datetime(),
    departedAt: p.datetime().nullable(),
    arrivedAt: p.datetime().nullable(),
    endedAt: p.datetime().nullable(),
    returnedAt: p.datetime(),
    /** The author confirmed the end; new reports start with alarm + 1 h, unconfirmed (rule `end-unconfirmed`). */
    endConfirmed: p.boolean().default(true),
    situation: p.text().default(''),
    actions: p.text().default(''),
    cause: p.text().default(''),
    incidentCommander: p.string().default(''),
    weather: p.json<Weather>(),
    equipment: p.text().default(''),
    acknowledgements: p.json<StoredAcknowledgement[]>(),
    /** Created by an external system and not edited by a person yet; only then the API may change it. */
    externallyManaged: p.boolean().default(false),
    personnel: () => p.oneToMany(ReportPersonnelEntity).mappedBy('report').orphanRemoval(),
    vehicles: () => p.oneToMany(ReportVehicleEntity).mappedBy('report').orphanRemoval(),
    involvedParties: () => p.oneToMany(InvolvedPartyEntity).mappedBy('report').orphanRemoval(),
    otherAgencies: () => p.oneToMany(OtherAgencyEntity).mappedBy('report').orphanRemoval(),
    version: p.integer().version(),
  },
});
export class ReportEntity extends ReportSchema.class {}
ReportSchema.setClass(ReportEntity);

export const ReportPersonnelSchema = defineEntity({
  name: 'ReportPersonnelEntity',
  schema: 'incidents',
  tableName: 'report_personnel',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    report: () => p.manyToOne(ReportEntity).deleteRule('cascade'),
    personId: p.string().nullable().index(),
    guestName: p.string().default(''),
    vehicleId: p.string().nullable(),
    standbyStationId: p.string().nullable(),
    function: p.string().nullable(),
    breathingApparatus: p.boolean().default(false),
    breathingMinutes: p.integer().nullable(),
    chemicalSuit: p.boolean().default(false),
    breathingDevice: p.string().$type<BreathingDevice>().nullable(),
    /** `null` = the times of the report. */
    from: p.datetime().nullable(),
    to: p.datetime().nullable(),
    lossOfEarnings: p.boolean().default(false),
    duringWorkingHours: p.boolean().default(false),
    allowances: p.json<string[]>(),
    compensationOverride: p.json<{ amount: number; reason: string }>().nullable(),
    injured: p.boolean().default(false),
    killed: p.boolean().default(false),
  },
});
export class ReportPersonnelEntity extends ReportPersonnelSchema.class {}
ReportPersonnelSchema.setClass(ReportPersonnelEntity);

export const ReportVehicleSchema = defineEntity({
  name: 'ReportVehicleEntity',
  schema: 'incidents',
  tableName: 'report_vehicle',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    report: () => p.manyToOne(ReportEntity).deleteRule('cascade'),
    vehicleId: p.string(),
    /** Alarm of the vehicle (start of its crew); `null` = alarm of the report, likewise for the other times. */
    alarmedAt: p.datetime().nullable(),
    departedAt: p.datetime().nullable(),
    returnedAt: p.datetime().nullable(),
    kilometres: p.integer().nullable(),
  },
});
export class ReportVehicleEntity extends ReportVehicleSchema.class {}
ReportVehicleSchema.setClass(ReportVehicleEntity);

export const InvolvedPartySchema = defineEntity({
  name: 'InvolvedPartyEntity',
  schema: 'incidents',
  tableName: 'involved_party',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    report: () => p.manyToOne(ReportEntity).deleteRule('cascade'),
    role: p.string().$type<PartyRole>(),
    name: p.string(),
    street: p.string().default(''),
    postalCode: p.string().default(''),
    city: p.string().default(''),
    phone: p.string().default(''),
    licensePlate: p.string().default(''),
    notes: p.text().default(''),
  },
});
export class InvolvedPartyEntity extends InvolvedPartySchema.class {}
InvolvedPartySchema.setClass(InvolvedPartyEntity);

export const OtherAgencySchema = defineEntity({
  name: 'OtherAgencyEntity',
  schema: 'incidents',
  tableName: 'other_agency',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    report: () => p.manyToOne(ReportEntity).deleteRule('cascade'),
    organization: p.string(),
    forces: p.integer().nullable(),
    vehicles: p.integer().nullable(),
    notes: p.text().default(''),
  },
});
export class OtherAgencyEntity extends OtherAgencySchema.class {}
OtherAgencySchema.setClass(OtherAgencyEntity);

/** Corrections and closing of the annual statistics of one year. */
export const StatisticsYearSchema = defineEntity({
  name: 'StatisticsYearEntity',
  schema: 'incidents',
  tableName: 'statistics_year',
  properties: {
    year: p.integer().primary(),
    /** `<question>:<column>` → value replacing the computed one. */
    corrections: p.json<Record<string, number>>(),
    closedAt: p.datetime().nullable(),
    closedBy: p.string().nullable(),
    /** Values and checks as they were when closing; a closed year shows these, not the values computed now. */
    frozenValues: p.json<StatisticsValue[]>().nullable(),
    frozenChecks: p.json<StatisticsCheck[]>().nullable(),
    version: p.integer().version(),
  },
});
export class StatisticsYearEntity extends StatisticsYearSchema.class {}
StatisticsYearSchema.setClass(StatisticsYearEntity);

/**
 * A saved state of the report content, for undo. Saves of the same user within a few minutes
 * update the latest revision instead of creating a new one (auto-save).
 */
export const ReportRevisionSchema = defineEntity({
  name: 'ReportRevisionEntity',
  schema: 'incidents',
  tableName: 'report_revision',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    report: () => p.manyToOne(ReportEntity).deleteRule('cascade').index(),
    content: p.json<Record<string, unknown>>(),
    userId: p.string().nullable(),
    userName: p.string().default(''),
    savedAt: p.datetime(),
  },
});
export class ReportRevisionEntity extends ReportRevisionSchema.class {}
ReportRevisionSchema.setClass(ReportRevisionEntity);
