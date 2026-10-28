import type { LocalizedText } from '@forga/core-contracts';
import type {
  KioskEntry,
  KioskIncidentInput,
  KioskMatch,
  KioskOverview,
  KioskPerson,
  KioskReport,
  KioskSessionDetail,
  KioskTerminal,
} from '@forga/info-terminal-contracts';
import { api, ApiError, fromLocalInput, i18n, send, toLocalInput, withQuery } from '@forga/web-sdk';

const BASE = 'info-terminal/kiosk';

export interface BookingBody {
  departmentId: string;
  personId: string;
  vehicleId: string | null;
  standby: boolean;
  function: string | null;
  breathingApparatus: boolean;
  lossOfEarnings: boolean;
  duringWorkingHours: boolean;
  from: string | null;
  to: string | null;
}

export interface CheckInBody {
  departmentId: string;
  personId: string;
  breathingApparatus: boolean;
  role: string | null;
  from: string | null;
  to: string | null;
}

/** Endpoints of the kiosk; the device cookie authenticates them. */
export const kioskApi = {
  open: (key: string) => send<KioskTerminal>('POST', `${BASE}/session`, { key }),
  terminal: () => api<KioskTerminal>(`${BASE}/terminal`),
  overview: (departmentId: string) => api<KioskOverview>(withQuery(`${BASE}/overview`, { departmentId })),
  members: (departmentId: string) => api<KioskPerson[]>(withQuery(`${BASE}/members`, { departmentId })),
  search: (departmentId: string, q: string) => api<KioskPerson[]>(withQuery(`${BASE}/persons`, { departmentId, q })),
  report: (departmentId: string, reportId: string) => api<KioskReport>(withQuery(`${BASE}/reports/${reportId}`, { departmentId })),
  book: (reportId: string, body: BookingBody) => send<KioskEntry>('PUT', `${BASE}/reports/${reportId}/entries/${body.personId}`, body),
  cancel: (departmentId: string, reportId: string, personId: string) =>
    send<void>('DELETE', withQuery(`${BASE}/reports/${reportId}/entries/${personId}`, { departmentId })),
  keywords: () => api<{ key: string; name: LocalizedText }[]>(`${BASE}/keywords`),
  matches: (body: KioskIncidentInput) => send<KioskMatch[]>('POST', `${BASE}/incidents/matches`, body),
  createIncident: (body: KioskIncidentInput) => send<{ reportId: string }>('POST', `${BASE}/incidents`, body),
  session: (departmentId: string, sessionId: string) => api<KioskSessionDetail>(withQuery(`${BASE}/sessions/${sessionId}`, { departmentId })),
  checkIn: (sessionId: string, body: CheckInBody) => send<void>('PUT', `${BASE}/sessions/${sessionId}/attendance/${body.personId}`, body),
  cancelCheckIn: (departmentId: string, sessionId: string, personId: string) =>
    send<void>('DELETE', withQuery(`${BASE}/sessions/${sessionId}/attendance/${personId}`, { departmentId })),
};

/** Text of an error in the current language: kiosk texts first, then the common ones. */
export function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    const params = Object.fromEntries(Object.entries(error.body ?? {}).map(([key, value]) => [key, Array.isArray(value) ? value.join(', ') : value]));
    return i18n.t(`kioskErrors.${error.code}`, { ns: 'info-terminal', ...params, defaultValue: error.translated() });
  }
  return error instanceof Error ? error.message : String(error);
}

/** The device is not (or no longer) enabled: unknown key, revoked, blocked address. */
export const isBlocked = (error: unknown) =>
  error instanceof ApiError && (error.status === 401 || error.code === 'info-terminal.revoked' || error.code === 'info-terminal.tooManyAttempts');

/** The module is switched off. */
export const isInactive = (error: unknown) => error instanceof ApiError && error.code === 'modules.inactive';

/** `HH:MM` in Europe/Berlin of an ISO time. */
export const clockTime = (iso: string) => toLocalInput(iso).slice(11, 16);

const HOUR_MS = 3_600_000;

/**
 * ISO time of a clock time `HH:MM` on the day of `base` (Europe/Berlin); a time more than `toleranceHours` before
 * `base` lies on the following day (e.g. 00:30 after an alarm at 23:40). `null` for an invalid time.
 */
export function timeOn(base: string, hhmm: string, toleranceHours = 2): string | null {
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const day = toLocalInput(base).slice(0, 10);
  const iso = fromLocalInput(`${day}T${hhmm}`);
  if (Date.parse(iso) < Date.parse(base) - toleranceHours * HOUR_MS) {
    const next = new Date(Date.parse(`${day}T12:00:00Z`) + 24 * HOUR_MS).toISOString().slice(0, 10);
    return fromLocalInput(`${next}T${hhmm}`);
  }
  return iso;
}

/** `YYYY-MM-DD` in Europe/Berlin. */
export const berlinDay = (iso: string) => toLocalInput(iso).slice(0, 10);
