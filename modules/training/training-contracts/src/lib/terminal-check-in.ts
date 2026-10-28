import { z } from 'zod';

/**
 * Check-in at an info terminal of a station (module `info-terminal`), like the QR check-in: the attendance stays
 * unconfirmed until someone with `training.attendance` saves the list. Provided by the training module:
 * `@Optional() @Inject(TRAINING_TERMINAL_CHECK_IN) checkIn?: TrainingTerminalCheckIn`.
 */
export const TRAINING_TERMINAL_CHECK_IN = 'training.TerminalCheckIn';

/** Value of `checkedInVia` of attendance checked in at an info terminal (QR check-ins: `qr`). */
export const CHECKED_IN_VIA_TERMINAL = 'info-terminal' as const;

/** Window of the check-in at a terminal: from `beforeMinutes` before the start until `afterEndMinutes` after the planned end. */
export function terminalCheckInWindow(
  session: { startsAt: string; endsAt: string },
  settings: { beforeMinutes: number; afterEndMinutes: number },
): { opensAt: string; closesAt: string } {
  return {
    opensAt: new Date(new Date(session.startsAt).getTime() - settings.beforeMinutes * 60_000).toISOString(),
    closesAt: new Date(new Date(session.endsAt).getTime() + settings.afterEndMinutes * 60_000).toISOString(),
  };
}

/** A session as the terminal shows it: title, time, station and how many are present. */
export interface TerminalSession {
  sessionId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  stationId: string | null;
  departmentIds: string[];
  opensAt: string;
  closesAt: string;
  /** Persons present (confirmed or checked in). */
  present: number;
}

/** Attendance of a person as the terminal shows it. */
export interface TerminalAttendance {
  personId: string;
  role: string | null;
  breathingApparatus: boolean;
  from: string | null;
  to: string | null;
  /** Checked in at a terminal and not confirmed yet: may be changed and removed at the terminal. */
  editable: boolean;
}

export const TerminalCheckInInput = z.object({
  personId: z.uuid(),
  /** Only in sessions of operational departments (checked by the info terminal). */
  breathingApparatus: z.boolean().default(false),
  /** Free text like the role of the attendance, e.g. "Gruppensprecher". */
  role: z.string().trim().max(100).nullable().default(null),
  /** "I was not there the whole time"; `null` = times of the session. */
  from: z.iso.datetime({ offset: true }).nullable().default(null),
  to: z.iso.datetime({ offset: true }).nullable().default(null),
});
export type TerminalCheckInInput = z.input<typeof TerminalCheckInInput>;

/** Which sessions a terminal serves: those of the department at the station of the terminal or without a station. */
export interface TerminalSessionScope {
  departmentId: string;
  stationId: string;
  /** Minutes after the planned end the check-in stays open. */
  afterEndMinutes: number;
}

export interface TrainingTerminalCheckIn {
  /** Sessions of the scope that are not closed and end (with the window) after `from` and start before `to`. */
  sessions(scope: TerminalSessionScope, from: Date, to: Date): Promise<TerminalSession[]>;
  /** One session of the scope with its attendance while its window is open; otherwise `404`/`409`. */
  session(sessionId: string, scope: TerminalSessionScope, now?: Date): Promise<{ session: TerminalSession; attendance: TerminalAttendance[] }>;
  /** Checks a person in (unconfirmed) or changes the own terminal check-in. */
  checkIn(sessionId: string, scope: TerminalSessionScope, input: TerminalCheckInInput, now?: Date): Promise<void>;
  /** Removes a check-in made at a terminal that is not confirmed yet. */
  cancel(sessionId: string, scope: TerminalSessionScope, personId: string, now?: Date): Promise<void>;
}
