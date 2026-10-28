import { z } from 'zod';
import { FalseAlarmType, IncidentStatistics, MainType, TechnicalCategory } from './statistics.js';
import { RuleLevel } from './settings.js';

const datetime = z.iso.datetime({ offset: true });
const text = z.string().default('');

export const Location = z.object({
  street: text,
  houseNumber: text,
  postalCode: text,
  city: text,
  district: text,
  object: text,
  addition: text,
  latitude: z.number().min(-90).max(90).nullable().default(null),
  longitude: z.number().min(-180).max(180).nullable().default(null),
});
export type Location = z.infer<typeof Location>;

export const IncidentInput = z.object({
  /** Number of the dispatch centre; `null` = an internal number is assigned. */
  dispatchNumber: z.string().trim().min(1).nullable().default(null),
  alarmKeyword: z.string().min(1),
  alarmMessage: text,
  alarmedAt: datetime,
  location: Location.default(Location.parse({})),
});
export type IncidentInput = z.input<typeof IncidentInput>;

/** Changing the incident data needs the version the client loaded. */
export const IncidentUpdate = IncidentInput.extend({ version: z.number().int() });
export type IncidentUpdate = z.input<typeof IncidentUpdate>;

/** New incident with a draft report for each department; writers need at least one of their departments. */
export const CreateIncident = IncidentInput.extend({
  departmentIds: z.array(z.uuid()).default([]),
  /** Keys of brigade-wide units whose report the incident gets (e.g. `duty-officer`), also without department reports. */
  units: z.array(z.string()).default([]),
});
export type CreateIncident = z.input<typeof CreateIncident>;

/**
 * An existing incident that may be the same as one about to be created (same dispatch number, or within two hours
 * the same keyword or location). Minimal data only, so writers of other departments can join it with their own
 * report.
 */
export const IncidentMatch = z.object({
  id: z.uuid(),
  dispatchNumber: z.string(),
  alarmKeyword: z.string(),
  alarmedAt: z.string(),
  city: z.string(),
  street: z.string(),
  /** Departments that already have a report. */
  departmentIds: z.array(z.uuid()),
  /** Reports of the incident the user may read (e.g. of his own department), so he opens them instead of joining. */
  ownReports: z.array(z.object({ reportId: z.uuid(), departmentId: z.uuid() })),
  /** `true` if the dispatch number is the same (ignoring case and spaces). */
  sameDispatchNumber: z.boolean(),
});
export type IncidentMatch = z.infer<typeof IncidentMatch>;

export const ReportStatus = z.enum(['draft', 'review', 'released-compensation', 'released-billing']);
export type ReportStatus = z.infer<typeof ReportStatus>;

export const ReportTimes = z.object({
  alarmedAt: datetime,
  departedAt: datetime.nullable().default(null),
  arrivedAt: datetime.nullable().default(null),
  endedAt: datetime.nullable().default(null),
  /** Back at the station and ready again; end of the assignment for personnel and compensation. */
  returnedAt: datetime,
});
export type ReportTimes = z.infer<typeof ReportTimes>;

/** Kind of breathing apparatus used. */
export const BreathingDevice = z.enum(['compressed-air', 'rebreather', 'filter']);
export type BreathingDevice = z.infer<typeof BreathingDevice>;

export const PersonnelEntryInput = z
  .object({
    /** `null` for guests from other brigades (entered by name, never compensated). */
    personId: z.uuid().nullable().default(null),
    guestName: text,
    vehicleId: z.uuid().nullable().default(null),
    /** Standby at a station instead of a vehicle. */
    standbyStationId: z.uuid().nullable().default(null),
    /** Key of a `function` catalog entry. */
    function: z.string().nullable().default(null),
    breathingApparatus: z.boolean().default(false),
    breathingMinutes: z.number().int().min(0).nullable().default(null),
    /** Under breathing apparatus in a chemical protective suit (CSA). */
    chemicalSuit: z.boolean().default(false),
    /** Kind of breathing apparatus for the Atemschutznachweis. */
    breathingDevice: BreathingDevice.nullable().default(null),
    /** `null` = times of the report. */
    from: datetime.nullable().default(null),
    to: datetime.nullable().default(null),
    lossOfEarnings: z.boolean().default(false),
    /** Assignment during working hours with the municipality as employer: no compensation. */
    duringWorkingHours: z.boolean().default(false),
    allowances: z.array(z.string()).default([]),
    /** Manual amount instead of the computed one, with a reason. */
    compensationOverride: z.object({ amount: z.number().min(0), reason: z.string().trim().min(1) }).nullable().default(null),
    injured: z.boolean().default(false),
    killed: z.boolean().default(false),
  })
  .refine((p) => p.personId || p.guestName.trim(), { message: 'Person or guest name required', path: ['personId'] })
  .refine((p) => !(p.vehicleId && p.standbyStationId), { message: 'Vehicle or standby, not both', path: ['standbyStationId'] });
export type PersonnelEntryInput = z.input<typeof PersonnelEntryInput>;

export const VehicleEntryInput = z.object({
  vehicleId: z.uuid(),
  /** Alarm of the vehicle, e.g. alerted later; start of its crew. `null` = alarm of the report (also for the times below). */
  alarmedAt: datetime.nullable().default(null),
  departedAt: datetime.nullable().default(null),
  returnedAt: datetime.nullable().default(null),
  kilometres: z.number().int().min(0).nullable().default(null),
});
export type VehicleEntryInput = z.input<typeof VehicleEntryInput>;

export const PartyRole = z.enum(['injured-party', 'causer', 'witness', 'owner', 'vehicle-keeper', 'caller', 'other']);
export type PartyRole = z.infer<typeof PartyRole>;

export const InvolvedPartyInput = z.object({
  role: PartyRole,
  name: z.string().trim().min(1),
  street: text,
  postalCode: text,
  city: text,
  phone: text,
  licensePlate: text,
  notes: text,
});
export type InvolvedPartyInput = z.input<typeof InvolvedPartyInput>;

export const OtherAgencyInput = z.object({
  /** E.g. `police`, `ambulance`, `thw`, `emergency-doctor`, `neighbouring-brigade`, `utility`, or free text. */
  organization: z.string().trim().min(1),
  forces: z.number().int().min(0).nullable().default(null),
  vehicles: z.number().int().min(0).nullable().default(null),
  notes: text,
});
export type OtherAgencyInput = z.input<typeof OtherAgencyInput>;

export const Weather = z.object({
  influence: z.boolean().default(false),
  conditions: z.array(z.enum(['rain', 'snow', 'ice', 'storm', 'heat', 'thunderstorm', 'fog'])).default([]),
});
export type Weather = z.infer<typeof Weather>;

/** The editable content of a report (everything except status and workflow fields). */
export const ReportInput = z.object({
  /** Version the client loaded; a newer stored version means someone else saved in between. */
  version: z.number().int().optional(),
  /**
   * The end (`returnedAt`) was confirmed by the author; a new report starts with alarm + 1 h and unconfirmed.
   * Left out (e.g. by other systems that send their own times) it counts as confirmed.
   */
  endConfirmed: z.boolean().optional(),
  authorPersonId: z.uuid().nullable().default(null),
  times: ReportTimes,
  situation: text,
  actions: text,
  cause: text,
  incidentCommander: text,
  weather: Weather.default({ influence: false, conditions: [] }),
  equipment: text,
  personnel: z.array(PersonnelEntryInput).default([]),
  vehicles: z.array(VehicleEntryInput).default([]),
  involvedParties: z.array(InvolvedPartyInput).default([]),
  otherAgencies: z.array(OtherAgencyInput).default([]),
});
export type ReportInput = z.input<typeof ReportInput>;

/** Saving a report (`PUT incidents/reports/:id`) needs the version the client loaded. */
export const ReportUpdate = ReportInput.extend({ version: z.number().int() });
export type ReportUpdate = z.input<typeof ReportUpdate>;

export const NewReportInput = ReportInput.partial({ times: true }).extend({ departmentId: z.uuid() });
export type NewReportInput = z.input<typeof NewReportInput>;

/** A finding of the report rules. `subject` identifies what it refers to (e.g. a person) for acknowledgements. */
export const Finding = z.object({
  rule: z.string(),
  level: RuleLevel,
  subject: z.string().nullable(),
  params: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  acknowledged: z.boolean(),
  /** Reason given when acknowledging a warning; `released` if the releaser acknowledged it by releasing. */
  reason: z.string().nullable(),
});
export type Finding = z.infer<typeof Finding>;

export const Acknowledgement = z.object({ rule: z.string(), subject: z.string().nullable().default(null), reason: z.string().trim().min(1) });
export type Acknowledgement = z.input<typeof Acknowledgement>;

export const Submit = z.object({ acknowledgements: z.array(Acknowledgement).default([]) });
export type Submit = z.input<typeof Submit>;

export const ReturnToAuthor = z.object({ comment: z.string().trim().min(1) });
export type ReturnToAuthor = z.infer<typeof ReturnToAuthor>;

export const ReleaseLevel = z.enum(['compensation', 'billing']);
export type ReleaseLevel = z.infer<typeof ReleaseLevel>;

export const Release = z.object({ level: ReleaseLevel });
export type Release = z.infer<typeof Release>;

/** Releases several reports at once, e.g. all error-free reports for review or all reports of an incident. */
export const ReleaseMany = z.object({ reportIds: z.array(z.uuid()).min(1).max(200), level: ReleaseLevel });
export type ReleaseMany = z.infer<typeof ReleaseMany>;

export const ReleaseManyResult = z.object({
  released: z.array(z.uuid()),
  /** Reports that could not be released, with the error code (e.g. `incidents.findingsOpen`). */
  failed: z.array(z.object({ reportId: z.uuid(), code: z.string() })),
});
export type ReleaseManyResult = z.infer<typeof ReleaseManyResult>;

/** Lifts the lock; a locked draft can only go back to `draft`, a released report to `review` or `draft`. */
export const Unlock = z.object({ reason: z.string().trim().min(1), toStatus: z.enum(['draft', 'review']).default('review') });
export type Unlock = z.input<typeof Unlock>;

/**
 * Statistics of an incident (`PUT incidents/incidents/:id/statistics`), set or removed (`null`) with the version of
 * the incident the client loaded.
 */
export const StatisticsUpdate = z.object({ statistics: IncidentStatistics.nullable(), version: z.number().int() });
export type StatisticsUpdate = z.input<typeof StatisticsUpdate>;

/** Pre-filled statistics from keyword and location; the writers confirm or correct them. */
export const StatisticsSuggestion = z.object({
  ownMunicipality: z.boolean(),
  mainType: MainType.nullable(),
  technicalCategory: TechnicalCategory.nullable(),
  falseAlarmType: FalseAlarmType.nullable(),
});
export type StatisticsSuggestion = z.infer<typeof StatisticsSuggestion>;

export const Compensation = z.object({
  hours: z.number(),
  rate: z.number().nullable(),
  allowances: z.number(),
  amount: z.number(),
  overridden: z.boolean(),
});
export type Compensation = z.infer<typeof Compensation>;

export const PersonnelEntry = z.object({
  id: z.uuid(),
  personId: z.uuid().nullable(),
  guestName: z.string(),
  vehicleId: z.uuid().nullable(),
  standbyStationId: z.uuid().nullable(),
  function: z.string().nullable(),
  breathingApparatus: z.boolean(),
  breathingMinutes: z.number().nullable(),
  chemicalSuit: z.boolean(),
  breathingDevice: BreathingDevice.nullable(),
  from: z.string(),
  to: z.string(),
  lossOfEarnings: z.boolean(),
  duringWorkingHours: z.boolean(),
  allowances: z.array(z.string()),
  compensationOverride: z.object({ amount: z.number(), reason: z.string() }).nullable(),
  injured: z.boolean(),
  killed: z.boolean(),
  compensation: Compensation,
});
export type PersonnelEntry = z.infer<typeof PersonnelEntry>;

/** System that keeps a report as long as no person edits it in f.orga. */
export const ReportManagedBy = z.enum(['api', 'mp-feuer']);
export type ReportManagedBy = z.infer<typeof ReportManagedBy>;

export const Report = z.object({
  id: z.uuid(),
  incidentId: z.uuid(),
  /** Department of the report; `null` for the report of a brigade-wide unit (`unit`, e.g. the duty officer). */
  departmentId: z.uuid().nullable(),
  /** Key of the brigade-wide unit (see `IncidentUnit`); `null` for department reports. Exactly one of both is set. */
  unit: z.string().nullable(),
  /** Sequential number per department (or unit, with its prefix) and year, e.g. `2026-017` or `EvD-2026-003`. */
  number: z.string(),
  primary: z.boolean(),
  status: ReportStatus,
  locked: z.boolean(),
  lockedBy: z.string().nullable(),
  lockedAt: z.string().nullable(),
  returnComment: z.string().nullable(),
  authorPersonId: z.uuid().nullable(),
  /** System keeping the report until a person edits it: the external API or the MP-Feuer import; `null`: f.orga. */
  managedBy: ReportManagedBy.nullable(),
  /** The author confirmed the end; until then the rule `end-unconfirmed` keeps the times step open. */
  endConfirmed: z.boolean(),
  times: z.object({
    alarmedAt: z.string(),
    departedAt: z.string().nullable(),
    arrivedAt: z.string().nullable(),
    endedAt: z.string().nullable(),
    returnedAt: z.string(),
  }),
  situation: z.string(),
  actions: z.string(),
  cause: z.string(),
  incidentCommander: z.string(),
  weather: Weather,
  equipment: z.string(),
  personnel: z.array(PersonnelEntry),
  vehicles: z.array(
    z.object({
      id: z.uuid(),
      vehicleId: z.uuid(),
      alarmedAt: z.string().nullable(),
      departedAt: z.string().nullable(),
      returnedAt: z.string().nullable(),
      kilometres: z.number().nullable(),
    }),
  ),
  involvedParties: z.array(InvolvedPartyInput.extend({ id: z.uuid() })),
  otherAgencies: z.array(OtherAgencyInput.extend({ id: z.uuid() })),
  findings: z.array(Finding),
  /** Sum of the compensation of all personnel. */
  compensationTotal: z.number(),
  version: z.number(),
});
export type Report = z.infer<typeof Report>;

/**
 * Costs and notes of the whole incident (not per report); entered by the commander or someone else with
 * `incidents.costs`. Cost recovery starts from chargeable incidents.
 */
export const IncidentCosts = z
  .object({
    version: z.number().int().optional(),
    chargeable: z.boolean().default(false),
    chargeableReason: text,
    notes: text,
  })
  .refine((c) => !c.chargeable || c.chargeableReason.trim().length > 0, { message: 'Reason required', path: ['chargeableReason'] });
export type IncidentCosts = z.input<typeof IncidentCosts>;

export const Incident = z.object({
  id: z.uuid(),
  dispatchNumber: z.string(),
  /** `true` if the number was assigned internally because the dispatch centre gave none. */
  internalNumber: z.boolean(),
  alarmKeyword: z.string(),
  alarmMessage: z.string(),
  alarmedAt: z.string(),
  location: Location,
  createdVia: z.enum(['ui', 'api', 'import']),
  chargeable: z.boolean(),
  chargeableReason: z.string(),
  notes: z.string(),
  /** Statistics features of the incident (once per incident, not per report); `null` until filled in. */
  statistics: IncidentStatistics.nullable(),
  /** Pre-filled from keyword and location while `statistics` is empty and the keyword counts. */
  statisticsSuggestion: StatisticsSuggestion.nullable(),
  /** The keyword counts in the annual statistics (it has a main type); only then statistics are entered. */
  statisticsCounted: z.boolean(),
  /** The current user may change the statistics now (see `PUT incidents/incidents/:id/statistics`). */
  statisticsEditable: z.boolean(),
  reports: z.array(
    z.object({
      id: z.uuid(),
      departmentId: z.uuid().nullable(),
      unit: z.string().nullable(),
      number: z.string(),
      primary: z.boolean(),
      status: ReportStatus,
      locked: z.boolean(),
      authorPersonId: z.uuid().nullable(),
      managedBy: ReportManagedBy.nullable(),
    }),
  ),
  version: z.number(),
});
export type Incident = z.infer<typeof Incident>;

/** A saved state of a report for undo; `content` can be sent back unchanged to restore it. */
export const ReportRevision = z.object({
  id: z.uuid(),
  savedAt: z.string(),
  userName: z.string(),
  personnelCount: z.number(),
});
export type ReportRevision = z.infer<typeof ReportRevision>;

/** A problem that blocks or distorts the compensation payout of a period. */
export const CompensationProblem = z.object({
  reportId: z.uuid(),
  dispatchNumber: z.string(),
  alarmedAt: z.string(),
  department: z.string(),
  reportNumber: z.string(),
  status: ReportStatus,
  /** `not-released`, `zero-amount` or a personnel rule such as `no-personnel`, `times-invalid`, `vehicle-missing`. */
  code: z.string(),
  person: z.string().nullable(),
});
export type CompensationProblem = z.infer<typeof CompensationProblem>;

export const CompensationCheck = z.object({
  from: z.string(),
  to: z.string(),
  reportsChecked: z.number(),
  reportsReleased: z.number(),
  problems: z.array(CompensationProblem),
});
export type CompensationCheck = z.infer<typeof CompensationCheck>;

/** An assignment of a person in a report, for the person file. */
export const PersonAssignment = z.object({
  reportId: z.uuid(),
  incidentId: z.uuid(),
  dispatchNumber: z.string(),
  alarmKeyword: z.string(),
  department: z.string(),
  status: ReportStatus,
  from: z.string(),
  to: z.string(),
  standby: z.boolean(),
  hours: z.number(),
  amount: z.number(),
});
export type PersonAssignment = z.infer<typeof PersonAssignment>;

export const AssignAuthor = z.object({ authorPersonId: z.uuid().nullable() });
export type AssignAuthor = z.infer<typeof AssignAuthor>;

/** Reminder e-mail to the authors of open reports. */
export const RemindAuthors = z.object({
  personIds: z.array(z.uuid()).min(1),
  message: z.string().trim().default(''),
});
export type RemindAuthors = z.input<typeof RemindAuthors>;

export const RemindResult = z.object({
  sent: z.array(z.string()),
  /** Authors without an e-mail address. */
  missingEmail: z.array(z.string()),
});
export type RemindResult = z.infer<typeof RemindResult>;

/** Crew of a vehicle in the latest earlier report of the same department, to take it over into a new report. */
export const PreviousCrew = z.object({
  reportId: z.uuid().nullable(),
  dispatchNumber: z.string().nullable(),
  alarmedAt: z.string().nullable(),
  personnel: z.array(z.object({ personId: z.uuid(), function: z.string().nullable() })),
});
export type PreviousCrew = z.infer<typeof PreviousCrew>;

/** "My area": own assignments of a year (only the person linked to the user). */
export const MyIncidents = z.object({
  year: z.number().int(),
  incidents: z.number().int(),
  hours: z.number(),
  assignments: z.array(PersonAssignment),
});
export type MyIncidents = z.infer<typeof MyIncidents>;
