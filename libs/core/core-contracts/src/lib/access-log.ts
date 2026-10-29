import { z } from 'zod';
import { LocalizedText } from './i18n.js';

/**
 * Read log (L15): who opened health or other especially protected data of whom. Only such areas are logged (person
 * file with sensitive fields, examinations, access report, full export, lists with contact data), aggregated per user,
 * person, area and day with a count. Readable with `core.audit.read`; retention category `core.access-log`.
 */
export const ACCESS_LOG_RETENTION = 'core.access-log';

/** One aggregated row of the read log (`GET /api/core/access-log`). */
export const AccessLogEntry = z.object({
  id: z.string(),
  /** The user who read (during an impersonation: the administrator). */
  userId: z.string(),
  userName: z.string().nullable(),
  /** `null`: all persons at once (e.g. full export). */
  personId: z.string().nullable(),
  personName: z.string().nullable(),
  area: z.string(),
  areaLabel: LocalizedText,
  /** Day in Europe/Berlin, `YYYY-MM-DD`. */
  day: z.string(),
  count: z.number().int(),
  firstAt: z.string(),
  lastAt: z.string(),
});
export type AccessLogEntry = z.infer<typeof AccessLogEntry>;

/** Filters of the read log page: users, areas. */
export const AccessLogFilters = z.object({
  users: z.array(z.object({ id: z.string(), name: z.string() })),
  areas: z.array(z.object({ key: z.string(), label: LocalizedText })),
});
export type AccessLogFilters = z.infer<typeof AccessLogFilters>;

/** "Anmeldungen als Sie": an impersonation of the own account, from the audit log. */
export const MyImpersonation = z.object({
  startedAt: z.string(),
  /** End of the impersonation; `null` while it runs or if it expired without ending (at most one hour). */
  endedAt: z.string().nullable(),
  administrator: z.string(),
  reason: z.string(),
});
export type MyImpersonation = z.infer<typeof MyImpersonation>;
