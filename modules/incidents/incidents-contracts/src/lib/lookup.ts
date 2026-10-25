import type { PartyRole } from './report.js';
import type { CompensationRate, Rounding } from './settings.js';
import type { FalseAlarmType, MainType } from './statistics.js';

/**
 * Incidents for other modules (e.g. cost recovery).
 * Inject optionally: `@Optional() @Inject(INCIDENTS_LOOKUP) incidents?: IncidentsLookup`.
 */
export const INCIDENTS_LOOKUP = 'incidents.Lookup';

export interface ChargeableIncident {
  incidentId: string;
  dispatchNumber: string;
  alarmKeyword: string;
  alarmedAt: string;
  location: string;
  /** Object or operator, e.g. the company with the fire alarm system. */
  object: string;
  mainType: MainType | null;
  falseAlarmType: FalseAlarmType | null;
  /** All reports released for billing (ready for cost recovery). A release for compensation only does not count. */
  released: boolean;
  /** Lowest release level of all reports: `none` while one is not released, `compensation`, or `billing` (= `released`). */
  releaseLevel: 'none' | 'compensation' | 'billing';
  departmentIds: string[];
  /** Why the incident is chargeable, from the costs of the incident. */
  chargeableReason: string;
}

export interface IncidentForCostRecovery extends ChargeableIncident {
  alarmMessage: string;
  /** Notes on the costs of the whole incident. */
  notes: string;
  compensationKind: 'incident' | 'standby' | 'fire-watch';
  reports: {
    reportId: string;
    departmentId: string;
    status: string;
    alarmedAt: string;
    /** Departure of the first vehicle; `null` if not recorded. */
    departedAt: string | null;
    number: string;
    situation: string;
    actions: string;
    cause: string;
    incidentCommander: string;
    returnedAt: string;
    personnel: { personId: string | null; name: string; vehicleId: string | null; from: string; to: string; standby: boolean }[];
    vehicles: { vehicleId: string; departedAt: string | null; returnedAt: string | null }[];
    parties: { role: PartyRole; name: string; street: string; postalCode: string; city: string }[];
  }[];
}

/** A report with its incident, e.g. for the equipment file. */
export interface ReportReference {
  reportId: string;
  reportNumber: string;
  departmentId: string;
  status: string;
  /** Edited by a releaser: only releasers may change it (also while it is a draft). */
  locked: boolean;
  incidentId: string;
  dispatchNumber: string;
  alarmKeyword: string;
  alarmedAt: string;
  location: string;
}

/** How the compensation of an incident would be computed with other statute values (preview in the settings). */
export interface CompensationPreview {
  incidentId: string;
  dispatchNumber: string;
  alarmKeyword: string;
  alarmedAt: string;
  compensationKind: 'incident' | 'standby' | 'fire-watch';
  reports: {
    reportId: string;
    reportNumber: string;
    departmentId: string;
    status: string;
    personnel: {
      personId: string | null;
      name: string;
      from: string;
      to: string;
      standby: boolean;
      duringWorkingHours: boolean;
      hours: number;
      rate: number | null;
      allowances: number;
      amount: number;
      overridden: boolean;
    }[];
  }[];
}

export interface IncidentsLookup {
  /** Chargeable incidents in the period (alarm date, Europe/Berlin). */
  chargeable(from: string, to: string): Promise<ChargeableIncident[]>;
  forCostRecovery(incidentId: string): Promise<IncidentForCostRecovery | null>;
  /** The given reports with their incident, newest first; unknown IDs are omitted. */
  reports(reportIds: readonly string[]): Promise<ReportReference[]>;
  /** Reports of the period (alarm date, Europe/Berlin) that are not released yet, oldest first. */
  unreleased(from: string, to: string): Promise<ReportReference[]>;
  /** All reports of the period (alarm date, Europe/Berlin), newest first. */
  inPeriod(from: string, to: string): Promise<ReportReference[]>;
  /** The incident computed with the given rates, rounding and minimum duration instead of the current ones. */
  compensationPreview(incidentId: string, statute: { rates: CompensationRate[]; rounding: Rounding; minimumHours: number | null }): Promise<CompensationPreview | null>;
}
