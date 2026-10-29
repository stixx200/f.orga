import { z } from 'zod';
import { LocalizedText } from './i18n.js';

/**
 * Register of processing activities (Art. 30 GDPR, gap L8 of `dokumentation/geplant/datenschutz.md`): a draft composed
 * of the processing activities of the active modules (manifest `privacy.activities`), completed by the municipality per
 * activity (setting `privacy.activities`) and a section "technical measures" with the current state of f.orga.
 */

const id = z.string().trim().min(1).max(100);

/** A recipient entered by the municipality, e.g. an insurance or the police on request. */
export const RegisterRecipient = z.object({
  id,
  name: z.string().trim().min(1).max(200),
  note: z.string().trim().max(500).default(''),
});
export type RegisterRecipient = z.infer<typeof RegisterRecipient>;

/**
 * What the municipality adds to one activity: legal basis, further recipients, transfer to third countries, remarks
 * and "geprüft am/von". Every change raises `version` and makes the activity a draft again until it is reviewed.
 */
export const ActivityRecord = z.object({
  legalBasis: z.string().trim().max(2000).default(''),
  recipients: z.array(RegisterRecipient).max(50).default([]),
  /** Transfer to third countries; empty = none. */
  thirdCountry: z.string().trim().max(1000).default(''),
  remarks: z.string().trim().max(5000).default(''),
  version: z.number().int().min(1).default(1),
  changedAt: z.string().nullable().default(null),
  changedBy: z.string().nullable().default(null),
  reviewedAt: z.string().nullable().default(null),
  reviewedBy: z.string().nullable().default(null),
});
export type ActivityRecord = z.infer<typeof ActivityRecord>;

/**
 * Setting `privacy.activities` (historized like every setting): the municipality's part of the register per activity
 * key, and recipients that apply to all activities (`general`, e.g. the former list `privacy.recipients`). Changed only
 * through `/api/core/privacy/register/…`.
 */
export const PrivacyActivities = z.object({
  activities: z.record(z.string(), ActivityRecord).default({}),
  general: z.array(RegisterRecipient).max(50).default([]),
});
export type PrivacyActivities = z.infer<typeof PrivacyActivities>;

/** Changes the municipality's part of one activity (`PUT /api/core/privacy/register/activities/:key`). */
export const ActivityRecordInput = z.object({
  legalBasis: z.string().trim().max(2000).default(''),
  recipients: z.array(RegisterRecipient).max(50).default([]),
  thirdCountry: z.string().trim().max(1000).default(''),
  remarks: z.string().trim().max(5000).default(''),
  version: z.number().int().min(1),
});
export type ActivityRecordInput = z.input<typeof ActivityRecordInput>;

/** Recipients for all activities (`PUT /api/core/privacy/register/recipients`). */
export const GeneralRecipientsInput = z.object({ recipients: z.array(RegisterRecipient).max(50) });
export type GeneralRecipientsInput = z.input<typeof GeneralRecipientsInput>;

/**
 * Where a recipient comes from: `module` (manifest), `municipality` (entered for the activity), `general` (entered for
 * all activities), `token` (an API token with permissions of the module), `processor` (SMTP server, OIDC provider).
 */
export const RecipientSource = z.enum(['module', 'municipality', 'general', 'token', 'processor']);
export type RecipientSource = z.infer<typeof RecipientSource>;

export const RegisterRecipientView = z.object({
  /** Stable reference, e.g. `module:incidents.reports:0`, `token:<id>` or the ID entered by the municipality. */
  id: z.string(),
  name: LocalizedText,
  note: z.string(),
  source: RecipientSource,
});
export type RegisterRecipientView = z.infer<typeof RegisterRecipientView>;

/** One activity of the register: the module's description, the retention periods and the municipality's part. */
export const RegisterActivity = z.object({
  key: z.string(),
  module: z.object({ id: z.string(), name: LocalizedText }),
  name: LocalizedText,
  purpose: LocalizedText,
  subjects: z.array(LocalizedText),
  categories: z.array(LocalizedText),
  health: z.boolean(),
  healthNote: LocalizedText.nullable(),
  legalBasisHint: LocalizedText.nullable(),
  /** Stores data of third parties (no persons of the master data, L14): hint at Art. 14 and „Auskunft zu einer anderen Person“. */
  thirdParties: z.boolean(),
  recipients: z.array(RegisterRecipientView),
  /** Retention periods from `privacy.retention`, e.g. „Personalakte: 30 Jahre nach Austritt“. */
  retention: LocalizedText,
  record: ActivityRecord,
});
export type RegisterActivity = z.infer<typeof RegisterActivity>;

/** Hint of the register at activities with data of third parties (L14). */
export const THIRD_PARTY_HINT: LocalizedText = {
  de: 'Daten Dritter (keine Mitglieder): Information nach Art. 14 DSGVO durch die Feuerwehr; Auskunft und Löschung über „Auskunft zu einer anderen Person“ (Anfragen)',
  en: 'Data of third parties (no members): information under Art. 14 GDPR by the brigade; access and erasure via "Access report for another person" (requests)',
};

/** `ok`: in place; `warning`: missing or weak (e.g. HTTPS: no); `info`: description only. */
export const MeasureTone = z.enum(['ok', 'warning', 'info']);
export type MeasureTone = z.infer<typeof MeasureTone>;

/** A technical measure with the current state of f.orga, e.g. „Zweiter Faktor: bei sensiblen Daten (Step-up)“. */
export const TechnicalMeasure = z.object({
  key: z.string(),
  title: LocalizedText,
  value: LocalizedText,
  tone: MeasureTone,
});
export type TechnicalMeasure = z.infer<typeof TechnicalMeasure>;

/** The register as the page and the exports show it (`GET /api/core/privacy/register`). */
export const ProcessingRegister = z.object({
  controller: z.object({ name: z.string(), address: z.string(), representedBy: z.string() }),
  dpo: z.object({ name: z.string(), address: z.string(), email: z.string(), phone: z.string() }),
  activities: z.array(RegisterActivity),
  /** Recipients for all activities. */
  general: z.array(RegisterRecipient),
  /** Technical recipients and processors from the configuration (SMTP server, OIDC provider). */
  processors: z.array(RegisterRecipientView),
  measures: z.array(TechnicalMeasure),
  generatedAt: z.string(),
});
export type ProcessingRegister = z.infer<typeof ProcessingRegister>;

/** A recipient to inform under Art. 19, flattened from the register (`GET /api/core/privacy/register/recipients`). */
export const RecipientOption = z.object({
  id: z.string(),
  name: LocalizedText,
  source: RecipientSource,
  /** Names of the activities the recipient belongs to; empty for general recipients. */
  activities: z.array(LocalizedText),
});
export type RecipientOption = z.infer<typeof RecipientOption>;

/** A processing activity to refer to (objection, data breach): key and name. */
export const ActivityOption = z.object({ key: z.string(), name: LocalizedText, health: z.boolean() });
export type ActivityOption = z.infer<typeof ActivityOption>;
