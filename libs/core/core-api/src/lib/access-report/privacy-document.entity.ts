import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { AccessReportChannel, AccessReportStatus, Language, ThirdPartyRef } from '@forga/core-contracts';

/** The third party of a report: as in the letter, and where its data is stored. */
export interface StoredThirdParty {
  name: string;
  address: string;
  refs: ThirdPartyRef[];
}

/**
 * A document of the data protection handling, today the access report (Art. 15 GDPR) as PDF. The file is encrypted with
 * `FORGA_SECRET_KEY` (`encryptBytes`) and deleted after 30 days (`expiresAt`); the row stays as a record of when it was
 * created and handed over. Not historized: the audit log records creation, download and handover, and a history would
 * outlive the deletion of the file.
 */
export const PrivacyDocumentSchema = defineEntity({
  name: 'PrivacyDocument',
  schema: 'core',
  tableName: 'privacy_document',
  indexes: [{ properties: ['personId'] }, { properties: ['expiresAt'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    kind: p.string().$type<'access-report'>().default('access-report'),
    /** Person in the masterdata module; no foreign key across modules. `null` for a report about a third party. */
    personId: p.string().nullable(),
    /** Report about a third party (L14): name and address of the letter, places of the data in the modules. */
    thirdParty: p.json<StoredThirdParty>().nullable(),
    language: p.string().$type<Language>(),
    includeJson: p.boolean().default(false),
    /** `expired` is derived from `deletedAt`, never stored. */
    status: p.string().$type<Exclude<AccessReportStatus, 'expired'>>().default('pending'),
    error: p.string().nullable(),
    /** Encrypted PDF (`encryptBytes`); `null` while pending, after a failure and after the deletion. */
    content: p.blob().nullable().lazy().hidden(),
    size: p.integer().nullable(),
    createdAt: p.datetime(),
    createdBy: p.string().nullable(),
    expiresAt: p.datetime(),
    /** The file was deleted (expired). */
    deletedAt: p.datetime().nullable(),
    handedOverOn: p.string().nullable(),
    channel: p.string().$type<AccessReportChannel>().nullable(),
    handedOverBy: p.string().nullable(),
    downloadedByPersonAt: p.datetime().nullable(),
    /** Data subject request the document answers (core). */
    requestId: p.string().nullable(),
  },
});
export class PrivacyDocument extends PrivacyDocumentSchema.class {}
PrivacyDocumentSchema.setClass(PrivacyDocument);
