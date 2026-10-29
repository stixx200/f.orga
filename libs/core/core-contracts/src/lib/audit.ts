import { z } from 'zod';
import { LocalizedText } from './i18n.js';

/**
 * A record an audit entry refers to by ID (e.g. `personId`), resolved by the server for display:
 * `label` is `null` when the record no longer exists, `anonymized` for persons anonymised after leaving.
 */
export const AuditReference = z.object({
  /** Kind of the record, e.g. `masterdata.person`. */
  kind: z.string(),
  label: z.union([z.string(), LocalizedText]).nullable(),
  /** Route in the shell, only if the viewer may open the record. */
  to: z.string().optional(),
  anonymized: z.boolean().optional(),
});
export type AuditReference = z.infer<typeof AuditReference>;

/** An entry of the audit log (`GET /api/core/audit`). */
export const AuditEntry = z.object({
  id: z.string(),
  timestamp: z.string(),
  userId: z.string().nullable(),
  /** Display name of the user, resolved by the server (readers of the log need not manage users). */
  userName: z.string().nullable(),
  impersonatorId: z.string().nullable(),
  impersonatorName: z.string().nullable(),
  action: z.string(),
  details: z.record(z.string(), z.unknown()),
  /** Resolved references, keyed by the ID as it appears in `details` (also in arrays and nested objects). */
  references: z.record(z.string(), AuditReference),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

/** Values for the filters of the audit page (`GET /api/core/audit/filters`). */
export const AuditFilters = z.object({
  /** All actions in the log. */
  actions: z.array(z.string()),
  /** Users appearing in the log. */
  users: z.array(z.object({ id: z.string(), name: z.string() })),
});
export type AuditFilters = z.infer<typeof AuditFilters>;
