import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { Language, PrivacyNoticeSection, PrivacyRequestChannel, PrivacyRequestKind, PrivacyRequestStatus } from '@forga/core-contracts';

/**
 * A request of a data subject (Art. 15–21): access, rectification, erasure, restriction, objection or withdrawal of a
 * consent, with the deadline of Art. 12(3). Historized; readable only with `core.privacy.manage`.
 */
export const PrivacyRequestSchema = defineEntity({
  name: 'PrivacyRequestEntity',
  schema: 'core',
  tableName: 'privacy_request',
  indexes: [{ properties: ['personId'] }, { properties: ['status'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    /** Person in the masterdata module; no foreign key across modules. */
    personId: p.string(),
    kind: p.string().$type<PrivacyRequestKind>(),
    receivedOn: p.string().length(10),
    channel: p.string().$type<PrivacyRequestChannel>(),
    identityChecked: p.boolean().default(false),
    identityNote: p.text().default(''),
    content: p.text().default(''),
    language: p.string().$type<Language>().default('de'),
    /** Objection: processing activity it refers to. */
    activity: p.text().default(''),
    /** Received + 1 month. */
    dueOn: p.string().length(10),
    extendedUntil: p.string().length(10).nullable(),
    extensionReason: p.text().default(''),
    extensionNotifiedOn: p.string().length(10).nullable(),
    status: p.string().$type<PrivacyRequestStatus>().default('received'),
    closedOn: p.string().length(10).nullable(),
    rejectionReason: p.text().default(''),
    /** User working on the request; no foreign key, the user may be deleted. */
    assigneeId: p.string().nullable(),
    notes: p.text().default(''),
    /** Recipients informed about the change (Art. 19). */
    recipients: p.json<{ id: string; name: string; notifiedOn: string }[]>().defaultRaw("'[]'::jsonb").onCreate(() => []),
    /** Access report created for the request (feature "Auskunft als PDF"). */
    accessReportDocumentId: p.string().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
    createdBy: p.string().nullable(),
    version: p.integer().version(),
  },
});
export class PrivacyRequestEntity extends PrivacyRequestSchema.class {}
PrivacyRequestSchema.setClass(PrivacyRequestEntity);

/** A version of the privacy notice; every change of its text blocks or the contacts creates a new one. */
export const PrivacyNoticeSchema = defineEntity({
  name: 'PrivacyNoticeEntity',
  schema: 'core',
  tableName: 'privacy_notice',
  properties: {
    version: p.integer().primary(),
    publishedAt: p.datetime(),
    sections: p.json<PrivacyNoticeSection[]>(),
    /** A block of this version was not reviewed yet. */
    template: p.boolean(),
  },
});
export class PrivacyNoticeEntity extends PrivacyNoticeSchema.class {}
PrivacyNoticeSchema.setClass(PrivacyNoticeEntity);
