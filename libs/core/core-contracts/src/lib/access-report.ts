import { z } from 'zod';
import { Language, LocalizedText } from './i18n.js';

/**
 * TEMPORARY: permission for creating and handing over access reports until `core.privacy.manage` (with step-up) exists.
 * Replace by `core.privacy.manage` once the data subject requests are merged.
 */
export const ACCESS_REPORT_PERMISSION = 'core.data.export';

/** Days an access report stays stored (encrypted) before its file is deleted. */
export const ACCESS_REPORT_DAYS = 30;

/**
 * A processing activity of a module (Art. 30 GDPR), named in the manifest. Sections of the access report refer to it:
 * purpose, recipients and retention period of the section come from here.
 */
export const ProcessingActivity = z.object({
  /** `<module-id>.<name>`, e.g. `incidents.reports`. */
  key: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/),
  name: LocalizedText,
  purpose: LocalizedText,
  /** Recipients outside f.orga, e.g. the treasury of the municipality. */
  recipients: z.array(LocalizedText).default([]),
  /** Retention categories whose periods apply (`privacy.retention`), e.g. `incidents.incidents`. */
  retention: z.array(z.string()).default([]),
});
export type ProcessingActivity = z.infer<typeof ProcessingActivity>;

/** What a module declares about personal data in its manifest. */
export const ModulePrivacy = z.object({
  /**
   * The module stores data about persons. It must then describe them for the access report (`describePerson`) or
   * anonymise them (`PersonDataRegistry`); the server does not start otherwise.
   */
  personData: z.boolean().default(false),
  activities: z.array(ProcessingActivity).default([]),
});
export type ModulePrivacy = z.input<typeof ModulePrivacy>;

/** Processing activities of the core itself: user accounts and protocols. */
export const CORE_ACTIVITIES: ProcessingActivity[] = [
  {
    key: 'core.accounts',
    name: { de: 'Benutzerkonten und Protokolle', en: 'User accounts and protocols' },
    purpose: {
      de: 'Zugang zu f.orga, Nachweis von Änderungen und Zugriffen (Datensicherheit)',
      en: 'Access to f.orga, evidence of changes and access (data security)',
    },
    recipients: [],
    retention: ['core.audit', 'core.history'],
  },
];

/** How an access report reached the person. */
export const AccessReportChannel = z.enum(['self-service', 'in-person', 'post']);
export type AccessReportChannel = z.infer<typeof AccessReportChannel>;

/** `pending` while the server generates the PDF, `failed` with an error code, `ready` to download, `expired` after 30 days. */
export const AccessReportStatus = z.enum(['pending', 'ready', 'failed', 'expired']);
export type AccessReportStatus = z.infer<typeof AccessReportStatus>;

/** Creates an access report (Art. 15 GDPR) for a person; it always contains everything (`POST /api/core/privacy/access-reports`). */
export const AccessReportCreate = z.object({
  personId: z.uuid(),
  language: Language.default('de'),
  /** Attach the machine-readable version (JSON) to the PDF. */
  includeJson: z.boolean().default(false),
  /** Data subject request the report answers. */
  requestId: z.uuid().nullable().default(null),
});
export type AccessReportCreate = z.input<typeof AccessReportCreate>;

/** Records the handover; `self-service` provides the report in "Mein Bereich" and tells the person by e-mail. */
export const AccessReportHandOver = z.object({
  channel: AccessReportChannel,
  /** Day of the handover, `YYYY-MM-DD`; default today. */
  date: z.iso.date().optional(),
});
export type AccessReportHandOver = z.input<typeof AccessReportHandOver>;

/** An access report as listed in the person file. */
export const AccessReport = z.object({
  id: z.uuid(),
  personId: z.string(),
  language: Language,
  includeJson: z.boolean(),
  status: AccessReportStatus,
  /** Error code when the generation failed. */
  error: z.string().nullable(),
  createdAt: z.string(),
  /** Display name of the creating user. */
  createdBy: z.string().nullable(),
  expiresAt: z.string(),
  handedOverOn: z.string().nullable(),
  channel: AccessReportChannel.nullable(),
  /** First download by the person in "Mein Bereich". */
  downloadedByPersonAt: z.string().nullable(),
  requestId: z.string().nullable(),
  /** File size in bytes. */
  size: z.number().int().nullable(),
});
export type AccessReport = z.infer<typeof AccessReport>;

/** One section of the report with its number of entries, shown before creating it. */
export const AccessReportSectionSummary = z.object({
  key: z.string(),
  title: z.string(),
  entries: z.number().int(),
  health: z.boolean(),
});
export type AccessReportSectionSummary = z.infer<typeof AccessReportSectionSummary>;

/** An access report provided to the person in "Mein Bereich". */
export const MyAccessReport = z.object({
  id: z.uuid(),
  language: Language,
  createdAt: z.string(),
  expiresAt: z.string(),
  providedOn: z.string().nullable(),
});
export type MyAccessReport = z.infer<typeof MyAccessReport>;
