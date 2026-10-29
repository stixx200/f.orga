import { z } from 'zod';
import { Language, type LocalizedText } from '@forga/core-contracts';

/** Settings section `info-terminal.general`. */
export const InfoTerminalSettings = z
  .object({
    /** Bookings stay possible this long after the confirmed end of a report and after the planned end of a session. */
    afterEndMinutes: z.number().int().min(0).max(24 * 60).default(60),
    /** Without a confirmed end, bookings stay possible this long after the alarm. */
    openEndHours: z.number().int().min(1).max(48).default(6),
    /** "Neuer Einsatz" accepts alarms at most this long ago (at most `openEndHours`). */
    maxAlarmAgeHours: z.number().int().min(1).max(48).default(6),
    /** The terminal returns to the overview of the station's department after this long without input. */
    idleSeconds: z.number().int().min(15).max(600).default(60),
    /** The administration marks terminals not seen for this many days. */
    notSeenWarningDays: z.number().int().min(1).max(365).default(30),
    /**
     * The name search finds all persons of the brigade; by default (`false`) only persons of the terminal's departments and
     * the departments below them (L22).
     */
    searchAllPersons: z.boolean().default(false),
  })
  .refine((s) => s.maxAlarmAgeHours <= s.openEndHours, { message: 'At most openEndHours', path: ['maxAlarmAgeHours'] });
export type InfoTerminalSettings = z.infer<typeof InfoTerminalSettings>;

export const INFO_TERMINAL_SETTINGS = { 'info-terminal.general': InfoTerminalSettings } as const;

/** Prefix of the device keys. */
export const DEVICE_KEY_PREFIX = 'fit_';
/** Cookie of the device after opening the link; only sent to the kiosk endpoints. */
export const TERMINAL_COOKIE = 'forga_terminal';
/** Path of the kiosk endpoints (and of the cookie). */
export const KIOSK_API_PATH = '/api/info-terminal/kiosk';

const name = z.string().trim().min(1).max(100);

/** A new info terminal at a station; the station's department is always one of its departments. */
export const TerminalInput = z.object({
  stationId: z.uuid(),
  /** Name of the device, e.g. "Tablet Fahrzeughalle". */
  name,
  /** Further departments besides the department of the station (e.g. youth and veterans department). */
  departmentIds: z.array(z.uuid()).max(20).default([]),
  /** "Neuer Einsatz" at the terminal. */
  allowNewIncident: z.boolean().default(true),
  /** Check-in for sessions (module training). */
  allowTraining: z.boolean().default(true),
  /** Language of the terminal at the start. */
  language: Language.default('de'),
});
export type TerminalInput = z.input<typeof TerminalInput>;

/** Changing a terminal: name, departments, allowed actions, language. The station stays. */
export const TerminalUpdate = TerminalInput.omit({ stationId: true }).extend({ version: z.number().int() });
export type TerminalUpdate = z.input<typeof TerminalUpdate>;

/** An info terminal in the administration; never with its key or link. */
export const Terminal = z.object({
  id: z.uuid(),
  stationId: z.uuid(),
  name: z.string(),
  /** All departments of the terminal; the department of the station first. */
  departmentIds: z.array(z.uuid()),
  allowNewIncident: z.boolean(),
  allowTraining: z.boolean(),
  language: Language,
  /** First characters of the key, to recognise it. */
  keyPrefix: z.string(),
  createdAt: z.string(),
  createdBy: z.string(),
  revokedAt: z.string().nullable(),
  revokedBy: z.string().nullable(),
  lastSeenAt: z.string().nullable(),
  /** The link can be shown again (the key is stored encrypted with the current server key). */
  linkAvailable: z.boolean(),
  version: z.number(),
});
export type Terminal = z.infer<typeof Terminal>;

/** The link of a terminal with the device key in the fragment, e.g. `https://…/terminal#k=fit_…`. */
export const TerminalLink = z.object({ terminal: Terminal, url: z.string() });
export type TerminalLink = z.infer<typeof TerminalLink>;

// ----- Kiosk -----

/** Exchanges the key from the link for the device cookie. */
export const KioskSessionInput = z.object({ key: z.string().min(8).max(200) });
export type KioskSessionInput = z.infer<typeof KioskSessionInput>;

export interface KioskDepartment {
  id: string;
  name: string;
  shortName: string;
  /** Only operational departments book incidents; the others only sessions. */
  operational: boolean;
}

/** What the terminal knows about itself. */
export interface KioskTerminal {
  brigadeName: string;
  station: { id: string; name: string; city: string };
  name: string;
  /** Departments in the switcher; the station's department first (also the default view). */
  departments: KioskDepartment[];
  allowNewIncident: boolean;
  /** Sessions are offered (allowed and module training active). */
  training: boolean;
  /** Self-checks of driving licences with a registered sticker are switched on (periodic mode of the masterdata). */
  driverLicenseCheck: boolean;
  language: 'de' | 'en';
  idleSeconds: number;
  maxAlarmAgeHours: number;
  afterEndMinutes: number;
  openEndHours: number;
  /** Server time, so the clock and the windows of the terminal follow the server. */
  now: string;
}

export interface KioskIncident {
  reportId: string;
  alarmKeyword: string;
  alarmedAt: string;
  street: string;
  city: string;
  endedAt: string | null;
  closesAt: string;
  bookable: boolean;
  booked: number;
}

export interface KioskSession {
  sessionId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  stationName: string | null;
  opensAt: string;
  closesAt: string;
  present: number;
}

export interface KioskOverview {
  incidents: KioskIncident[];
  /** Sessions whose window is open. */
  sessions: KioskSession[];
  /** Sessions whose window opens later today (shown greyed out). */
  upcoming: KioskSession[];
  /** The next session after today, for the empty state. */
  next: KioskSession | null;
  now: string;
}

/** A person on a name tile or in the search. */
export interface KioskPerson {
  id: string;
  firstName: string;
  lastName: string;
  /** Short names of the person's departments (search only). */
  departments: string[];
}

export interface KioskVehicle {
  id: string;
  /** `vehicleLabel()`: designation · radio call sign (department). */
  label: string;
  seats: number;
  /** At the station of the terminal (tiles); others are offered under "Anderes Fahrzeug". */
  atStation: boolean;
}

export interface KioskEntry {
  personId: string;
  firstName: string;
  lastName: string;
  vehicleId: string | null;
  standby: boolean;
  function: string | null;
  breathingApparatus: boolean;
  from: string | null;
  to: string | null;
  lossOfEarnings: boolean;
  duringWorkingHours: boolean;
  /** Booked at a terminal and not changed by the author: may be changed and removed here. */
  editable: boolean;
  bookedAt: string | null;
}

export interface KioskReport extends KioskIncident {
  entries: KioskEntry[];
  /** Persons in other reports of the incident (not selectable): name of that department or unit. */
  elsewhere: Record<string, LocalizedText>;
  vehicles: KioskVehicle[];
  functions: { key: string; name: LocalizedText }[];
  /** Times of the report: alarm and the end (confirmed or default). */
  returnedAt: string;
}

export interface KioskAttendance {
  personId: string;
  firstName: string;
  lastName: string;
  role: string | null;
  breathingApparatus: boolean;
  from: string | null;
  to: string | null;
  editable: boolean;
}

export interface KioskSessionDetail extends KioskSession {
  attendance: KioskAttendance[];
  /** Breathing apparatus only in the view of an operational department. */
  breathingApparatus: boolean;
}

export interface KioskMatch {
  incidentId: string;
  alarmKeyword: string;
  alarmedAt: string;
  street: string;
  city: string;
  /** Short names of the departments with a report. */
  departments: string[];
  /** The department of the view already has a report there. */
  ownReport: boolean;
}

/** "Neuer Einsatz": the form, and with `joinIncidentId` the report added to an existing incident instead. */
export const KioskIncidentInput = z.object({
  departmentId: z.uuid(),
  alarmKeyword: z.string().min(1),
  alarmedAt: z.iso.datetime({ offset: true }),
  dispatchNumber: z.string().trim().max(50).nullable().default(null),
  street: z.string().trim().max(200).default(''),
  city: z.string().trim().max(200).default(''),
  joinIncidentId: z.uuid().nullable().default(null),
});
export type KioskIncidentInput = z.input<typeof KioskIncidentInput>;

/**
 * Self-check of a driving licence: the scanned sticker ID, and `confirm` once the person confirmed the
 * self-declaration. Without `confirm` the terminal only shows name, classes and whether a self-check is possible.
 */
export const KioskDriverLicenseInput = z.object({
  code: z.string().trim().min(1).max(200),
  confirm: z.boolean().default(false),
  /** Language of the screen; the self-declaration is stored in it. */
  language: Language.optional(),
});
export type KioskDriverLicenseInput = z.input<typeof KioskDriverLicenseInput>;

/** What the terminal shows of the person whose sticker was scanned: name, classes, latest check, no more. */
export interface KioskDriverLicense {
  firstName: string;
  lastName: string;
  classes: { class: string; expiresOn: string | null }[];
  lastCheck: { checkedOn: string; method: 'in-person' | 'transponder' | 'barcode' | 'legacy' } | null;
  /** `allowed`: confirm now; `in-person`: the original is due (no reason given); `off`: only the state is shown. */
  state: 'allowed' | 'in-person' | 'off';
  /** Latest date to show the original. */
  inPersonDueOn: string | null;
  /** Earliest open deadline (e.g. expiry of class CE). */
  next: { kind: string; dueOn: string; classes: string[] } | null;
  /** After the confirmation: when it was recorded and the next due date. */
  confirmed: { checkedAt: string; nextDueOn: string | null } | null;
}
