import { z } from 'zod';
import { Language } from '@forga/core-contracts';
import { PRIVACY_PERMISSION } from './privacy.js';

/** Creating, viewing and handing over access reports: managing data protection (with step-up). */
export const ACCESS_REPORT_PERMISSION = PRIVACY_PERMISSION;

/** Days an access report stays stored (encrypted) before its file is deleted. */
export const ACCESS_REPORT_DAYS = 30;

/** How an access report reached the person. */
export const AccessReportChannel = z.enum(['self-service', 'in-person', 'post']);
export type AccessReportChannel = z.infer<typeof AccessReportChannel>;

/** `pending` while the server generates the PDF, `failed` with an error code, `ready` to download, `expired` after 30 days. */
export const AccessReportStatus = z.enum(['pending', 'ready', 'failed', 'expired']);
export type AccessReportStatus = z.infer<typeof AccessReportStatus>;

/** Creates an access report (Art. 15 GDPR) for a person; it always contains everything (`POST /api/privacy/access-reports`). */
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
  /** „Anfrage damit erledigt“: closes the data subject request of the report as done. */
  closeRequest: z.boolean().default(false),
});
export type AccessReportHandOver = z.input<typeof AccessReportHandOver>;

/** An access report as listed in the person file. */
export const AccessReport = z.object({
  id: z.uuid(),
  /** `null` for a report about a third party (L14). */
  personId: z.string().nullable(),
  /** Name of the third party the report is about, else `null`. */
  thirdPartyName: z.string().nullable(),
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
  /** `pending` while a report created by the member (`instant`) is generated. */
  status: AccessReportStatus,
  language: Language,
  createdAt: z.string(),
  expiresAt: z.string(),
  providedOn: z.string().nullable(),
});
export type MyAccessReport = z.infer<typeof MyAccessReport>;
