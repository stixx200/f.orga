import { z } from 'zod';
import { LocalizedText } from './i18n.js';

/**
 * Data breaches (Art. 33/34 GDPR, gap L20 of `dokumentation/geplant/datenschutz.md`): recorded under „Verwaltung →
 * Datenschutz → Datenpannen“ with the 72-hour deadline for the notification to the supervisory authority, the
 * notification of the data subjects and helpers to reconstruct who is affected.
 */

/** Hours after the breach became known within which the supervisory authority is to be notified (Art. 33(1)). */
export const BREACH_NOTIFICATION_HOURS = 72;

const isoDate = z.iso.date();
const text = (max: number) => z.string().trim().max(max).default('');

/** Risk for the data subjects: `unlikely` (no notification needed, document why), `risk` (authority), `high` (also the persons). */
export const BreachRisk = z.enum(['unlikely', 'risk', 'high']);
export type BreachRisk = z.infer<typeof BreachRisk>;

/** How the data subjects were notified (Art. 34). */
export const BreachNotificationVia = z.enum(['letter', 'email', 'in-person', 'posting', 'other']);
export type BreachNotificationVia = z.infer<typeof BreachNotificationVia>;

export const BreachStatus = z.enum(['open', 'closed']);
export type BreachStatus = z.infer<typeof BreachStatus>;

/** Fields of a breach the administration records and changes. */
const BreachFields = z.object({
  title: z.string().trim().min(3).max(200),
  /** When the breach became known (ISO date-time); the 72 hours run from here. */
  discoveredAt: z.iso.datetime({ offset: true }),
  /** Period of the breach itself, if known. */
  occurredFrom: isoDate.nullable().default(null),
  occurredUntil: isoDate.nullable().default(null),
  description: text(10000),
  /** Processing activities of the register whose data are affected. */
  activityKeys: z.array(z.string().max(100)).max(50).default([]),
  /** Affected categories of data in own words, e.g. „Telefonliste der Abteilung (Name, Mobilnummer)“. */
  dataCategories: text(2000),
  /** Special categories (Art. 9) are affected, e.g. medical examinations. */
  health: z.boolean().default(false),
  /** Estimated number of affected persons, if no list can be determined. */
  affectedCount: z.number().int().min(0).max(1_000_000).nullable().default(null),
  /** Likely consequences (Art. 33(3) c). */
  consequences: text(5000),
  /** Measures taken or proposed (Art. 33(3) d). */
  measures: text(5000),
  risk: BreachRisk.nullable().default(null),
  /** Notification of the supervisory authority: day and reference („Aktenzeichen“). */
  authorityNotifiedOn: isoDate.nullable().default(null),
  authorityReference: text(200),
  /** No notification, because a risk is unlikely (reason in `authorityNote`). */
  authorityNotRequired: z.boolean().default(false),
  /** Reason for not notifying or for a late notification (Art. 33(1) sentence 2). */
  authorityNote: text(2000),
  /** Notification of the data subjects: day and way. */
  subjectsNotifiedOn: isoDate.nullable().default(null),
  subjectsNotifiedVia: BreachNotificationVia.nullable().default(null),
  subjectsNote: text(2000),
});

/** Records a breach (`POST /api/core/privacy/breaches`). */
export const PrivacyBreachInput = BreachFields;
export type PrivacyBreachInput = z.input<typeof PrivacyBreachInput>;

/** Changes a breach (`PUT /api/core/privacy/breaches/:id`). */
export const PrivacyBreachUpdate = BreachFields.extend({ version: z.number().int() });
export type PrivacyBreachUpdate = z.input<typeof PrivacyBreachUpdate>;

/** Closes a breach (`POST …/:id/close`); the authority must be notified or a notification marked as not required. */
export const PrivacyBreachClose = z.object({ version: z.number().int(), closedOn: isoDate });
export type PrivacyBreachClose = z.infer<typeof PrivacyBreachClose>;

/** Affected persons determined by a helper and taken over into the breach (`PUT …/:id/affected`). */
export const BreachAffectedInput = z.object({
  version: z.number().int(),
  personIds: z.array(z.uuid()).max(10000),
  /** How the list was determined, e.g. „Export der Liste Telefonliste vom 28.10.2026 durch …“. */
  source: text(500),
});
export type BreachAffectedInput = z.input<typeof BreachAffectedInput>;

export const PrivacyBreach = z.object({
  id: z.string(),
  title: z.string(),
  discoveredAt: z.string(),
  /** `discoveredAt` + 72 hours. */
  notifyBy: z.string(),
  occurredFrom: z.string().nullable(),
  occurredUntil: z.string().nullable(),
  description: z.string(),
  activityKeys: z.array(z.string()),
  dataCategories: z.string(),
  health: z.boolean(),
  affectedCount: z.number().nullable(),
  affectedPersonIds: z.array(z.string()),
  /** The affected persons with their names (persons no longer in the master data are left out). */
  affectedPersons: z.array(z.object({ id: z.string(), firstName: z.string(), lastName: z.string() })),
  affectedSource: z.string(),
  consequences: z.string(),
  measures: z.string(),
  risk: BreachRisk.nullable(),
  authorityNotifiedOn: z.string().nullable(),
  authorityReference: z.string(),
  authorityNotRequired: z.boolean(),
  authorityNote: z.string(),
  subjectsNotifiedOn: z.string().nullable(),
  subjectsNotifiedVia: BreachNotificationVia.nullable(),
  subjectsNote: z.string(),
  status: BreachStatus,
  closedOn: z.string().nullable(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  version: z.number().int(),
});
export type PrivacyBreach = z.infer<typeof PrivacyBreach>;

/** An audit entry from which affected persons can be reconstructed: a list export, a full export, an access report. */
export const BreachSourceEntry = z.object({
  auditId: z.string(),
  timestamp: z.string(),
  action: z.string(),
  userId: z.string().nullable(),
  userName: z.string().nullable(),
  /** What was exported, e.g. the list name or „Vollexport“. */
  label: LocalizedText,
  /** Number of persons the entry names, if known. */
  persons: z.number().int().nullable(),
});
export type BreachSourceEntry = z.infer<typeof BreachSourceEntry>;

/**
 * Reconstructs affected persons (`POST /api/core/privacy/breach-tools/affected`): from an audit entry (`audit`) or the
 * persons an account can read (`account`).
 */
export const AffectedPersonsQuery = z.discriminatedUnion('source', [
  z.object({ source: z.literal('audit'), auditId: z.uuid() }),
  z.object({ source: z.literal('account'), userId: z.uuid() }),
]);
export type AffectedPersonsQuery = z.infer<typeof AffectedPersonsQuery>;

export const AffectedPerson = z.object({ id: z.string(), firstName: z.string(), lastName: z.string() });
export type AffectedPerson = z.infer<typeof AffectedPerson>;

export const AffectedPersons = z.object({
  persons: z.array(AffectedPerson),
  /** How the list was determined, in both languages (proposed as `source` of the breach). */
  description: LocalizedText,
  /**
   * `recorded`: the persons named in the audit entry at the time; `current`: computed from today's data and permissions
   * (full export, account), may differ from the time of the breach.
   */
  basis: z.enum(['recorded', 'current']),
});
export type AffectedPersons = z.infer<typeof AffectedPersons>;

/** „Alle Sitzungen beenden und alle Tokens widerrufen“ (`POST /api/core/privacy/breach-tools/lockdown`). */
export const BreachLockdownInput = z.object({
  reason: z.string().trim().min(10).max(2000),
  breachId: z.uuid().nullable().default(null),
});
export type BreachLockdownInput = z.input<typeof BreachLockdownInput>;

/** Ended sessions, revoked API tokens and devices blocked by modules (e.g. the device keys of the info terminals). */
export const BreachLockdownResult = z.object({ sessions: z.number().int(), tokens: z.number().int(), devices: z.number().int() });
export type BreachLockdownResult = z.infer<typeof BreachLockdownResult>;

/** A user account to choose in the helpers (also technical users of API tokens and disabled accounts). */
export const BreachAccount = z.object({ id: z.string(), displayName: z.string(), username: z.string(), technical: z.boolean(), active: z.boolean() });
export type BreachAccount = z.infer<typeof BreachAccount>;

/** A protocol that can be exported for a period and a user (audit log; further ones such as the read log register themselves). */
export const ProtocolSourceInfo = z.object({ key: z.string(), title: LocalizedText });
export type ProtocolSourceInfo = z.infer<typeof ProtocolSourceInfo>;
