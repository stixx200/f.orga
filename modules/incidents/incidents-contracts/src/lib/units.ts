import { z } from 'zod';
import { LocalizedText } from '@forga/core-contracts';
import type { ReportStatus } from './report.js';

/**
 * A brigade-wide unit that writes its own report for an incident, e.g. the duty officer. A report belongs either to a
 * department or to such a unit. Modules register their units with `INCIDENT_UNITS`; the incidents module itself
 * knows none. Access to unit reports follows the brigade-wide permissions named here instead of department grants.
 */
export const IncidentUnit = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]*$/),
  /** ID of the module registering the unit; while it is inactive, the unit is not offered for new reports (e.g. in imports). */
  module: z.string().optional(),
  /** E.g. "Einsatzleiter vom Dienst"; shown instead of a department name. */
  label: LocalizedText,
  /** E.g. "EvD"; in lists, badges and cost recovery positions ("Personal EvD"). */
  shortLabel: LocalizedText,
  /** Prefix of the report numbers per year, e.g. `EvD` → `EvD-2026-001`. */
  numberPrefix: z.string().regex(/^[A-Za-z][A-Za-z0-9]*$/),
  /** Reads the unit reports (besides releasers and brigade-wide readers of incident reports). */
  readPermission: z.string(),
  /** Writes the unit reports. */
  writePermission: z.string(),
  /** Pre-reviews the unit reports: returns them to their authors, reminds authors, gets the tasks of drafts nobody writes. */
  reviewPermission: z.string(),
  /** `false`: persons in the unit report need no vehicle (e.g. the duty officer arrives in his own car). */
  vehicleRequired: z.boolean().default(true),
});
export type IncidentUnit = z.infer<typeof IncidentUnit>;

/** Registry of the units, filled by the modules in `onModuleInit`: `@Inject(INCIDENT_UNITS) units: IncidentUnits`. */
export const INCIDENT_UNITS = 'incidents.Units';

export interface IncidentUnits {
  register(unit: z.input<typeof IncidentUnit>): void;
  get(key: string | null | undefined): IncidentUnit | undefined;
  all(): IncidentUnit[];
}

/** The report of a unit for an incident. */
export interface UnitReportSummary {
  reportId: string;
  incidentId: string;
  number: string;
  status: ReportStatus;
  locked: boolean;
  authorPersonId: string | null;
}

/** An incident as the modules with units need it. */
export interface IncidentInfo {
  incidentId: string;
  dispatchNumber: string;
  alarmKeyword: string;
  alarmedAt: string;
  createdVia: 'ui' | 'api' | 'import';
}

/**
 * Creates and deletes the reports of the units (`@Inject(INCIDENTS_UNIT_REPORTS) reports: IncidentUnitReports`).
 * Unit reports are not created or deleted through the report endpoints but by the module owning the unit.
 */
export const INCIDENTS_UNIT_REPORTS = 'incidents.UnitReports';

export interface IncidentUnitReports {
  /** Creates the draft report of the unit with author and personnel; an existing report is returned unchanged. */
  createUnitReport(
    incidentId: string,
    unit: string,
    options: { authorPersonId: string | null; personnel: { personId: string; function: string | null }[] },
  ): Promise<UnitReportSummary>;
  /**
   * Deletes the report of the unit; only a draft that is not locked, otherwise `incidents.unitReportNotDraft`. The
   * primary report of an incident without department reports passes its role to another unit report; as the only
   * report of the incident it stays (`incidents.unitReportOnlyReport`).
   */
  deleteUnitReport(incidentId: string, unit: string): Promise<void>;
  hasUnitReport(incidentId: string, unit: string): Promise<boolean>;
  /** The reports of the unit for the given incidents, by incident ID. */
  unitReports(incidentIds: readonly string[], unit: string): Promise<Map<string, UnitReportSummary>>;
  /** The incidents with the given IDs; unknown IDs are omitted. */
  incidents(incidentIds: readonly string[]): Promise<IncidentInfo[]>;
}
