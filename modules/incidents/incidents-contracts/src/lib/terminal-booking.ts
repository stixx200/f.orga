import { z } from 'zod';
import type { LocalizedText } from '@forga/core-contracts';

/**
 * Self-booking of the personnel at an info terminal of a station (module `info-terminal`). The incidents module
 * provides it: `@Inject(INCIDENTS_TERMINAL_BOOKING) booking: IncidentsTerminalBooking`. Bookings go into the personnel
 * of the department report; they never change the report version, so the author's auto-save does not conflict.
 */
export const INCIDENTS_TERMINAL_BOOKING = 'incidents.TerminalBooking';

/** Value of `bookedVia` of personnel entries made at an info terminal. */
export const BOOKED_VIA_TERMINAL = 'info-terminal' as const;

/** How long bookings stay possible around an incident. */
export interface BookingWindowSettings {
  /** Minutes after the confirmed end of the department report. */
  afterEndMinutes: number;
  /** Hours after the alarm while the end of the report is not confirmed. */
  openEndHours: number;
}

/**
 * The booking window of a department report: from the alarm until the confirmed end of the report (`returnedAt`)
 * plus `afterEndMinutes`; without a confirmed end until the alarm plus `openEndHours`. Once the author confirms an
 * end, end plus `afterEndMinutes` applies, even if that is earlier.
 */
export function bookingWindow(
  report: { alarmedAt: string; returnedAt: string; endConfirmed: boolean },
  settings: BookingWindowSettings,
): { opensAt: string; closesAt: string } {
  const closes = report.endConfirmed
    ? new Date(report.returnedAt).getTime() + settings.afterEndMinutes * 60_000
    : new Date(report.alarmedAt).getTime() + settings.openEndHours * 3_600_000;
  return { opensAt: new Date(report.alarmedAt).toISOString(), closesAt: new Date(closes).toISOString() };
}

/** Is the moment inside the window (both ends included)? */
export function windowOpen(window: { opensAt: string; closesAt: string }, now: Date): boolean {
  return now.getTime() >= new Date(window.opensAt).getTime() && now.getTime() <= new Date(window.closesAt).getTime();
}

/** A department report shown on the terminal: minimal incident data, no situation, parties or amounts. */
export interface TerminalReport {
  reportId: string;
  incidentId: string;
  alarmKeyword: string;
  alarmedAt: string;
  street: string;
  city: string;
  /** End of the report (back at the station) if the author confirmed it, else `null`. */
  endedAt: string | null;
  /** End of the report, confirmed or the default (alarm + 1 h): persons without own times are booked until then. */
  returnedAt: string;
  opensAt: string;
  closesAt: string;
  /** Unlocked draft: bookings are accepted. Otherwise the author has finished it. */
  bookable: boolean;
  /** Persons in the personnel of the report. */
  booked: number;
}

/** A personnel entry of the report as the terminal shows it. */
export interface TerminalEntry {
  personId: string;
  vehicleId: string | null;
  standbyStationId: string | null;
  function: string | null;
  breathingApparatus: boolean;
  /** Own times; `null` = those of the vehicle or the report. */
  from: string | null;
  to: string | null;
  lossOfEarnings: boolean;
  duringWorkingHours: boolean;
  /** Booked at an info terminal and not changed by the author since: may be changed and removed at the terminal. */
  editable: boolean;
  /** When it was booked or last changed at a terminal; `null` for entries of the author. */
  bookedAt: string | null;
}

export interface TerminalReportDetail extends TerminalReport {
  departmentId: string;
  entries: TerminalEntry[];
  /** Persons in other reports of the same incident with the department (or unit) of that report. */
  elsewhere: Record<string, { departmentId: string | null; unit: string | null }>;
}

/** A booking at the terminal: a person with a vehicle or on standby at the station of the terminal. */
export const TerminalBookingInput = z
  .object({
    personId: z.uuid(),
    vehicleId: z.uuid().nullable().default(null),
    /** Standby at the station of the terminal instead of a vehicle: times of the report, no breathing apparatus. */
    standby: z.boolean().default(false),
    /** Key of a `function` catalog entry. */
    function: z.string().min(1).nullable().default(null),
    breathingApparatus: z.boolean().default(false),
    lossOfEarnings: z.boolean().default(false),
    duringWorkingHours: z.boolean().default(false),
    /** "I was not there the whole time" (only with a vehicle); `null` = times of the vehicle or the report. */
    from: z.iso.datetime({ offset: true }).nullable().default(null),
    to: z.iso.datetime({ offset: true }).nullable().default(null),
  })
  .refine((b) => Boolean(b.vehicleId) !== b.standby, { message: 'Vehicle or standby', path: ['vehicleId'] });
export type TerminalBookingInput = z.input<typeof TerminalBookingInput>;

/** Who books: the info terminal with its technical user (shown in the history and the versions of the report). */
export interface TerminalActor {
  terminalId: string;
  userId: string;
  userName: string;
  /** Station of the terminal; standby is always booked there. */
  stationId: string;
}

/** A new incident created at the terminal (or the report of the department added to an existing one). */
export const TerminalIncidentInput = z.object({
  alarmKeyword: z.string().min(1),
  alarmedAt: z.iso.datetime({ offset: true }),
  dispatchNumber: z.string().trim().min(1).nullable().default(null),
  street: z.string().trim().max(200).default(''),
  city: z.string().trim().max(200).default(''),
});
export type TerminalIncidentInput = z.input<typeof TerminalIncidentInput>;

/** An existing incident that may be the one about to be created, with the minimal data the terminal shows. */
export interface TerminalIncidentMatch {
  incidentId: string;
  alarmKeyword: string;
  alarmedAt: string;
  street: string;
  city: string;
  /** Departments that already have a report. */
  departmentIds: string[];
  sameDispatchNumber: boolean;
}

export interface IncidentsTerminalBooking {
  /** Department reports of the department whose booking window is open at `now`. */
  openReports(departmentId: string, settings: BookingWindowSettings, now?: Date): Promise<TerminalReport[]>;
  /** One open report of the department with its personnel; `404` if it is not open for the terminal. */
  report(reportId: string, departmentId: string, settings: BookingWindowSettings, now?: Date): Promise<TerminalReportDetail>;
  /** Books a person or changes the booking (only entries made at a terminal and not changed by the author). */
  book(reportId: string, departmentId: string, input: TerminalBookingInput, actor: TerminalActor, settings: BookingWindowSettings, now?: Date): Promise<TerminalEntry>;
  /** Removes an entry made at a terminal. */
  cancel(reportId: string, departmentId: string, personId: string, actor: TerminalActor, settings: BookingWindowSettings, now?: Date): Promise<void>;
  /** Active alarm keywords in catalog order. */
  keywords(): Promise<{ key: string; name: LocalizedText }[]>;
  /** Incidents that may be the one about to be created (same rules as the dialog "Einsatz anlegen"). */
  matches(input: { dispatchNumber: string | null; alarmKeyword: string; alarmedAt: string; street: string; city: string }): Promise<TerminalIncidentMatch[]>;
  /**
   * Creates the incident with the draft report of the department (`createdVia: 'terminal'`, no author), or with
   * `joinIncidentId` adds the report of the department to that incident. An existing report of the department is
   * returned instead.
   */
  createIncident(
    input: z.output<typeof TerminalIncidentInput>,
    departmentId: string,
    joinIncidentId: string | null,
    actor: TerminalActor,
  ): Promise<{ incidentId: string; reportId: string; created: 'incident' | 'report' | 'existing' }>;
}
