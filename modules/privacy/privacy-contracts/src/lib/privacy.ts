import { z } from 'zod';
import { Language, LocalizedText } from '@forga/core-contracts';
import { PRIVACY_TEXT_TEMPLATES } from './privacy-templates.js';
import { ErasureExecution } from './erasure.js';

export { PRIVACY_TEXT_TEMPLATES } from './privacy-templates.js';

/**
 * Data protection (concept `dokumentation/geplant/datenschutz.md`): requests of data subjects, restriction of
 * processing, privacy notice and its settings. Brigade-wide, privileged, needs the second factor (step-up).
 */
export const PRIVACY_PERMISSION = 'privacy.manage';

const isoDate = z.iso.date();
const line = z.string().trim().max(500).default('');
const block = z.string().trim().max(2000).default('');

// ---------- Settings ----------

/** Supervisory authority of public bodies in Baden-Württemberg; address and website are entered by the brigade. */
export const DEFAULT_SUPERVISORY_AUTHORITY = 'Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg';

/**
 * Setting `privacy.contacts`: controller (usually the municipality), data protection officer and supervisory
 * authority. Used by the privacy notice, the reply letters and the cover letter of the access report (Art. 15(1) e, f).
 */
export const PrivacyContacts = z.object({
  controller: z.object({ name: line, address: block, representedBy: line }).prefault({}),
  dpo: z.object({ name: line, address: block, email: z.union([z.literal(''), z.email()]).default(''), phone: line }).prefault({}),
  authority: z.object({ name: z.string().trim().max(500).default(DEFAULT_SUPERVISORY_AUTHORITY), address: block, website: line }).prefault({}),
});
export type PrivacyContacts = z.infer<typeof PrivacyContacts>;
export type PrivacyContactsInput = z.input<typeof PrivacyContacts>;

/**
 * One text block in both languages, versioned: every change of the text raises `version` and makes it a template
 * again until someone marks it as reviewed (`reviewedAt`, `reviewedBy` = display name). `reviewedAt === null` means
 * "Vorlage – mit dem DSB prüfen".
 */
export const PrivacyTextBlock = z.object({
  text: z.object({ de: z.string().trim().max(20000), en: z.string().trim().max(20000) }),
  version: z.number().int().min(1).default(1),
  changedAt: z.string().nullable().default(null),
  changedBy: z.string().nullable().default(null),
  reviewedAt: z.string().nullable().default(null),
  reviewedBy: z.string().nullable().default(null),
});
export type PrivacyTextBlock = z.infer<typeof PrivacyTextBlock>;

const textBlock = (key: keyof typeof PRIVACY_TEXT_TEMPLATES) => PrivacyTextBlock.prefault({ text: PRIVACY_TEXT_TEMPLATES[key] });

/**
 * Setting `privacy.texts`: the text blocks of privacy notice, first sign-in, access report and reply letters. Changed
 * only through `PUT /api/privacy/texts/:key` (versions and review are kept by the server). Read it with
 * `SettingsService.get<PrivacyTexts>('privacy.texts')`; blocks never stored come with their template.
 */
export const PrivacyTexts = z.object({
  /** Privacy notice: introduction. */
  noticeIntro: textBlock('noticeIntro'),
  /** Privacy notice: processing activities, legal bases, recipients, storage (until the register of processing activities exists). */
  noticeProcessing: textBlock('noticeProcessing'),
  /** Rights of the data subject (Art. 15–21, 7(3)); privacy notice and access report (Art. 15(1) e). */
  rights: textBlock('rights'),
  /** Automated decision-making (Art. 15(1) h, Art. 22); privacy notice and access report. */
  automatedDecisions: textBlock('automatedDecisions'),
  /** Transfer to third countries (Art. 15(2)); privacy notice and access report. */
  thirdCountry: textBlock('thirdCountry'),
  /** Short notice at the first sign-in (and after a new version of the privacy notice). */
  firstLogin: textBlock('firstLogin'),
  /** Introduction of the access report (cover letter). */
  accessReportIntro: textBlock('accessReportIntro'),
  /** Reply letters per kind of request, the rejection and the extension of the period. */
  replyAccess: textBlock('replyAccess'),
  replyRectification: textBlock('replyRectification'),
  replyErasure: textBlock('replyErasure'),
  replyRestriction: textBlock('replyRestriction'),
  replyObjection: textBlock('replyObjection'),
  replyConsentWithdrawal: textBlock('replyConsentWithdrawal'),
  replyRejection: textBlock('replyRejection'),
  replyExtension: textBlock('replyExtension'),
});
export type PrivacyTexts = z.infer<typeof PrivacyTexts>;
export type PrivacyTextKey = keyof PrivacyTexts;
export const PRIVACY_TEXT_KEYS = Object.keys(PrivacyTexts.shape) as PrivacyTextKey[];
export const PrivacyTextKey = z.enum(PRIVACY_TEXT_KEYS as [PrivacyTextKey, ...PrivacyTextKey[]]);

/** Where a text block is used (shown in the settings). */
export type PrivacyTextUsage = 'notice' | 'firstLogin' | 'accessReport' | 'requests';

/** Usage and placeholders of each text block. */
export const PRIVACY_TEXT_BLOCKS: Record<PrivacyTextKey, { usage: PrivacyTextUsage[]; placeholders: string[] }> = {
  noticeIntro: { usage: ['notice'], placeholders: ['brigade'] },
  noticeProcessing: { usage: ['notice'], placeholders: ['brigade'] },
  rights: { usage: ['notice', 'accessReport'], placeholders: ['brigade'] },
  automatedDecisions: { usage: ['notice', 'accessReport'], placeholders: ['brigade'] },
  thirdCountry: { usage: ['notice', 'accessReport'], placeholders: ['brigade'] },
  firstLogin: { usage: ['firstLogin'], placeholders: ['brigade'] },
  accessReportIntro: { usage: ['accessReport'], placeholders: ['brigade', 'name', 'receivedOn'] },
  replyAccess: { usage: ['requests'], placeholders: replyPlaceholders() },
  replyRectification: { usage: ['requests'], placeholders: replyPlaceholders() },
  replyErasure: { usage: ['requests'], placeholders: replyPlaceholders() },
  replyRestriction: { usage: ['requests'], placeholders: replyPlaceholders() },
  replyObjection: { usage: ['requests'], placeholders: replyPlaceholders() },
  replyConsentWithdrawal: { usage: ['requests'], placeholders: replyPlaceholders() },
  replyRejection: { usage: ['requests'], placeholders: replyPlaceholders() },
  replyExtension: { usage: ['requests'], placeholders: replyPlaceholders() },
};

function replyPlaceholders(): string[] {
  return ['brigade', 'name', 'receivedOn', 'dueOn', 'extendedUntil', 'kind', 'activity', 'reason', 'authority', 'today'];
}

/** Text blocks of the privacy notice; the notice applies (first sign-in) only once all of them are reviewed. */
export const PRIVACY_NOTICE_BLOCKS: PrivacyTextKey[] = ['noticeIntro', 'noticeProcessing', 'rights', 'automatedDecisions', 'thirdCountry'];

/** Replaces `{placeholder}` by its value; unknown placeholders stay as they are. */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (match, key: string) => (Object.hasOwn(values, key) ? values[key] : match));
}

/** Changes one text block (`PUT /api/privacy/texts/:key`). */
export const PrivacyTextInput = z.object({
  text: z.object({ de: z.string().trim().min(1).max(20000), en: z.string().trim().min(1).max(20000) }),
  version: z.number().int().min(1),
});
export type PrivacyTextInput = z.infer<typeof PrivacyTextInput>;

/** Setting `privacy.selfServiceAccess`: how members get their access report from "My area". */
export const PrivacySelfService = z.object({
  /** `request`: the administration creates and releases it (default); `instant`: the member creates it, at most once a day. */
  mode: z.enum(['request', 'instant']).default('request'),
  /** Contact person shown in "My area", e.g. "Markus Vogt, Kommandant". */
  contact: line,
});
export type PrivacySelfService = z.infer<typeof PrivacySelfService>;

/**
 * Former setting `privacy.recipients` (recipients for Art. 19). Replaced by the register of processing activities
 * (`privacy.activities`): the server moves stored entries to its general recipients at startup, with their IDs.
 */
export const LEGACY_RECIPIENTS_SECTION = 'privacy.recipients';

// ---------- Privacy notice ----------

/** One section of the privacy notice in both languages. */
export const PrivacyNoticeSection = z.object({
  key: z.string(),
  title: LocalizedText,
  text: z.object({ de: z.string(), en: z.string() }),
});
export type PrivacyNoticeSection = z.infer<typeof PrivacyNoticeSection>;

/**
 * A version of the privacy notice (`GET /api/privacy/notice`, public). Every change of its text blocks or of
 * the contacts is a new version with its date. `template`: a block of it is not reviewed yet.
 */
export const PrivacyNotice = z.object({
  version: z.number().int(),
  publishedAt: z.string(),
  brigadeName: z.string(),
  template: z.boolean(),
  sections: z.array(PrivacyNoticeSection),
  /** Older versions with their date. */
  versions: z.array(z.object({ version: z.number().int(), publishedAt: z.string() })),
});
export type PrivacyNotice = z.infer<typeof PrivacyNotice>;

/** Notice at the first sign-in (`GET /api/privacy/notice/first-login`). */
export const FirstLoginNotice = z.object({ version: z.number().int(), text: z.object({ de: z.string(), en: z.string() }) });
export type FirstLoginNotice = z.infer<typeof FirstLoginNotice>;

/** "Zur Kenntnis genommen" of a version (`POST /api/privacy/notice/acknowledge`); no consent. */
export const NoticeAcknowledgement = z.object({ version: z.number().int().min(1) });
export type NoticeAcknowledgement = z.infer<typeof NoticeAcknowledgement>;

/**
 * Privacy notice of the session user: the current version, the version the user acknowledged and whether the shell
 * asks for it (`due`: the notice applies, i.e. all its blocks are reviewed, and the user has not acknowledged this
 * version; never during an impersonation).
 */
export const SessionPrivacyNotice = z.object({ version: z.number().int(), acknowledgedVersion: z.number().int().nullable(), due: z.boolean() });
export type SessionPrivacyNotice = z.infer<typeof SessionPrivacyNotice>;

// ---------- Information under Art. 13/14 and restriction of processing ----------

/** How a person was informed about the processing (Art. 13/14), e.g. a letter after the transfer from MP-Feuer. */
export const PrivacyInformationVia = z.enum(['letter', 'in-person', 'posting', 'email', 'other']);
export type PrivacyInformationVia = z.infer<typeof PrivacyInformationVia>;

export const PrivacyInformation = z.object({ informedOn: z.string(), via: PrivacyInformationVia });
export type PrivacyInformation = z.infer<typeof PrivacyInformation>;

/** "Information erteilt am" for one or many persons (`POST /api/privacy/information`). */
export const PrivacyInformationInput = z.object({
  personIds: z.array(z.uuid()).min(1).max(5000),
  informedOn: isoDate,
  via: PrivacyInformationVia,
});
export type PrivacyInformationInput = z.infer<typeof PrivacyInformationInput>;

/** A person whose information is not recorded yet and who has not acknowledged the notice as a user. */
export const UninformedPerson = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  status: z.string(),
  primaryDepartmentId: z.string().nullable(),
  joinedOn: z.string().nullable(),
});
export type UninformedPerson = z.infer<typeof UninformedPerson>;

/**
 * Reason of a restriction of processing (Art. 18(1) a–d), or the erasure was refused because a retention period runs.
 */
export const ProcessingRestrictionReason = z.enum(['accuracy-contested', 'unlawful-processing', 'legal-claims', 'objection-pending', 'retention']);
export type ProcessingRestrictionReason = z.infer<typeof ProcessingRestrictionReason>;

/** Restricts the processing of a person (`PUT /api/privacy/persons/:id/restriction`). */
export const ProcessingRestrictionInput = z.object({
  reason: ProcessingRestrictionReason,
  /** Planned end, e.g. the end of a retention period; the restriction stays until it is lifted. */
  until: isoDate.nullable().default(null),
  /** Request that led to the restriction. */
  requestId: z.uuid().nullable().default(null),
});
export type ProcessingRestrictionInput = z.input<typeof ProcessingRestrictionInput>;

/**
 * Processing of the person is restricted: the person disappears from lists, search, pickers, info terminal, deadlines
 * and e-mails; the person file is readable only with `privacy.manage`.
 */
export const ProcessingRestriction = z.object({
  restrictedAt: z.string(),
  reason: ProcessingRestrictionReason,
  until: z.string().nullable(),
  requestId: z.string().nullable(),
});
export type ProcessingRestriction = z.infer<typeof ProcessingRestriction>;

/** A restricted person (`GET /api/privacy/restricted`). */
export const RestrictedPerson = z.object({ id: z.string(), firstName: z.string(), lastName: z.string(), restriction: ProcessingRestriction });
export type RestrictedPerson = z.infer<typeof RestrictedPerson>;

// ---------- Requests of data subjects ----------

export const PrivacyRequestKind = z.enum(['access', 'rectification', 'erasure', 'restriction', 'objection', 'consent-withdrawal']);
export type PrivacyRequestKind = z.infer<typeof PrivacyRequestKind>;

/** How the request came in; `my-area`: the member asked in "My area", identity checked by the sign-in. */
export const PrivacyRequestChannel = z.enum(['letter', 'email', 'in-person', 'my-area']);
export type PrivacyRequestChannel = z.infer<typeof PrivacyRequestChannel>;

export const PrivacyRequestStatus = z.enum(['received', 'in-review', 'extended', 'done', 'rejected']);
export type PrivacyRequestStatus = z.infer<typeof PrivacyRequestStatus>;
export const OPEN_REQUEST_STATUSES: readonly PrivacyRequestStatus[] = ['received', 'in-review', 'extended'];

/** Reply letter of a kind of request. */
export const REPLY_TEXT_OF_KIND: Record<PrivacyRequestKind, PrivacyTextKey> = {
  access: 'replyAccess',
  rectification: 'replyRectification',
  erasure: 'replyErasure',
  restriction: 'replyRestriction',
  objection: 'replyObjection',
  'consent-withdrawal': 'replyConsentWithdrawal',
};

/**
 * A third party making a request (L14): a person who is no `Person` of the master data, e.g. a person involved in an
 * incident or a debtor. `note` tells where the person appears, e.g. "Verursacher Einsatz 2026-104950".
 */
export const PrivacyThirdParty = z.object({
  name: z.string().trim().min(2).max(200),
  note: z.string().trim().max(500).default(''),
});
export type PrivacyThirdParty = z.infer<typeof PrivacyThirdParty>;

/** Kinds of requests a third party can make; restriction and consents concern persons of the master data. */
export const THIRD_PARTY_REQUEST_KINDS: readonly PrivacyRequestKind[] = ['access', 'rectification', 'erasure', 'objection'];

/**
 * Records a request (`POST /api/privacy/requests`) of a person of the master data (`personId`) or of a third party
 * (`thirdParty`). The deadline is received + 1 month (Art. 12(3)).
 */
export const PrivacyRequestInput = z.object({
  personId: z.uuid().nullable().default(null),
  thirdParty: PrivacyThirdParty.nullable().default(null),
  kind: PrivacyRequestKind,
  receivedOn: isoDate,
  channel: PrivacyRequestChannel,
  identityChecked: z.boolean().default(false),
  /** How the identity was checked, e.g. "Unterschrift, Anschrift". */
  identityNote: line,
  content: z.string().trim().max(5000).default(''),
  /** Language of reply and access report. */
  language: Language.default('de'),
  /** Objection: the processing activity of the register it refers to. */
  activityKey: z.string().max(100).nullable().default(null),
  /** Objection: further description of what it refers to (requests recorded before the register: the only reference). */
  activity: line,
  /** Objection or restriction: restrict the processing of the person right away (until the decision). */
  restrict: z.boolean().default(false),
})
  .refine((r) => (r.personId === null) !== (r.thirdParty === null), { message: 'Person or third party', params: { code: 'privacy.subjectRequired' } })
  .refine((r) => !r.thirdParty || THIRD_PARTY_REQUEST_KINDS.includes(r.kind), { message: 'Kind not for third parties', params: { code: 'privacy.kindNotForThirdParty' } });
export type PrivacyRequestInput = z.input<typeof PrivacyRequestInput>;

/** Changes the working data of an open request (`PUT /api/privacy/requests/:id`). */
export const PrivacyRequestUpdate = z.object({
  version: z.number().int(),
  status: z.enum(['received', 'in-review']).optional(),
  assigneeId: z.uuid().nullable(),
  identityChecked: z.boolean(),
  identityNote: line,
  content: z.string().trim().max(5000).default(''),
  notes: z.string().trim().max(10000).default(''),
  language: Language,
  activityKey: z.string().max(100).nullable().default(null),
  activity: line,
});
export type PrivacyRequestUpdate = z.input<typeof PrivacyRequestUpdate>;

/** Extends the period by up to two further months, with reason (Art. 12(3)); the person is to be told within the first month. */
export const PrivacyRequestExtension = z.object({
  version: z.number().int(),
  months: z.union([z.literal(1), z.literal(2)]),
  reason: z.string().trim().min(10).max(2000),
});
export type PrivacyRequestExtension = z.infer<typeof PrivacyRequestExtension>;

/** The person was told about the extension (`POST …/extension-notified`). */
export const PrivacyExtensionNotified = z.object({ version: z.number().int(), notifiedOn: isoDate });
export type PrivacyExtensionNotified = z.infer<typeof PrivacyExtensionNotified>;

/** Closes a request as done or rejected (with reason). */
export const PrivacyRequestClose = z
  .object({
    version: z.number().int(),
    outcome: z.enum(['done', 'rejected']),
    closedOn: isoDate,
    reason: z.string().trim().max(2000).default(''),
  })
  .refine((c) => c.outcome !== 'rejected' || c.reason.length >= 10, { message: 'Reason required', path: ['reason'] });
export type PrivacyRequestClose = z.input<typeof PrivacyRequestClose>;

/** Recipients informed about the rectification, erasure or restriction (Art. 19), as a checklist. */
export const PrivacyRecipientsNotified = z.object({
  version: z.number().int(),
  recipients: z.array(z.object({ id: z.string().min(1).max(100), name: z.string().trim().min(1).max(200), notifiedOn: isoDate })).max(50),
});
export type PrivacyRecipientsNotified = z.infer<typeof PrivacyRecipientsNotified>;

/**
 * Rectification asked for in "My area" (L12): area (module of the section, `other`), what is wrong and how it is right.
 * Holders of `masterdata.persons.write` of the person's department check it (task) and mark it as corrected.
 */
export const Rectification = z.object({
  area: z.string(),
  /** Name of the area (module name, "Sonstiges"). */
  areaLabel: LocalizedText,
  wrong: z.string(),
  correct: z.string(),
  correctedAt: z.string().nullable(),
  correctedByName: z.string().nullable(),
});
export type Rectification = z.infer<typeof Rectification>;

/** "Berichtigung beantragen" in "My area" (`POST /api/privacy/me/rectifications`); a proof is uploaded as attachment. */
export const MyRectificationInput = z.object({
  /** Module ID of the section or `other`. */
  area: z.string().regex(/^[a-z][a-z0-9-]{0,59}$/),
  wrong: z.string().trim().min(1).max(2000),
  correct: z.string().trim().min(1).max(2000),
});
export type MyRectificationInput = z.infer<typeof MyRectificationInput>;

/** A rectification for the persons responsible for the person's data (`GET /api/privacy/rectifications/:id`). */
export const RectificationView = z.object({
  id: z.string(),
  personId: z.string(),
  personName: z.string().nullable(),
  receivedOn: z.string(),
  deadline: z.string(),
  status: PrivacyRequestStatus,
  rectification: Rectification,
});
export type RectificationView = z.infer<typeof RectificationView>;

/** A request as the administration sees it. */
export const PrivacyRequest = z.object({
  id: z.string(),
  /** `null` for a request of a third party. */
  personId: z.string().nullable(),
  /** Request of a third party (L14), else `null`. */
  thirdParty: PrivacyThirdParty.nullable(),
  /** "Nachname, Vorname"; `null` if the person no longer exists. */
  personName: z.string().nullable(),
  kind: PrivacyRequestKind,
  receivedOn: z.string(),
  channel: PrivacyRequestChannel,
  identityChecked: z.boolean(),
  identityNote: z.string(),
  content: z.string(),
  language: Language,
  /** Objection: processing activity of the register (`null` for requests recorded before the register). */
  activityKey: z.string().nullable(),
  /** Name of `activityKey` in both languages; `null` if the activity is no longer in the register (module removed). */
  activityName: LocalizedText.nullable(),
  activity: z.string(),
  /** Received + 1 month. */
  dueOn: z.string(),
  extendedUntil: z.string().nullable(),
  extensionReason: z.string(),
  /** The person was told about the extension. */
  extensionNotifiedOn: z.string().nullable(),
  /** The deadline in force: the extension, otherwise `dueOn`. */
  deadline: z.string(),
  status: PrivacyRequestStatus,
  closedOn: z.string().nullable(),
  rejectionReason: z.string(),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  notes: z.string(),
  recipients: z.array(z.object({ id: z.string(), name: z.string(), notifiedOn: z.string() })),
  /**
   * Access report (Art. 15) created for the request; filled by the feature "Auskunft als PDF" (`privacy.document`).
   */
  accessReportDocumentId: z.string().nullable(),
  /** Rectification asked for in "My area" (L12). */
  rectification: Rectification.nullable(),
  /** Erasure executed for the request (L7): what was deleted, anonymised and kept. */
  erasure: ErasureExecution.nullable(),
  createdAt: z.string(),
  createdByName: z.string().nullable(),
  version: z.number().int(),
});
export type PrivacyRequest = z.infer<typeof PrivacyRequest>;

/** An own request in "My area" (`GET /api/privacy/my-requests`). */
export const MyPrivacyRequest = z.object({
  id: z.string(),
  kind: PrivacyRequestKind,
  receivedOn: z.string(),
  status: PrivacyRequestStatus,
  deadline: z.string(),
  closedOn: z.string().nullable(),
  /** Rectification: area and what is wrong. */
  rectification: z.object({ areaLabel: LocalizedText, wrong: z.string() }).nullable(),
});
export type MyPrivacyRequest = z.infer<typeof MyPrivacyRequest>;

/** "Auskunft anfordern" in "My area"; identity counts as checked by the sign-in. */
export const MyAccessRequestInput = z.object({ language: Language.default('de') });
export type MyAccessRequestInput = z.input<typeof MyAccessRequestInput>;

/** "Datenschutz" section of "My area" (`GET /api/privacy/me`). */
export const MyPrivacy = z.object({
  requests: z.array(MyPrivacyRequest),
  selfService: PrivacySelfService,
  dpo: z.object({ name: z.string(), email: z.string(), phone: z.string() }),
  notice: z.object({ version: z.number().int(), acknowledgedVersion: z.number().int().nullable(), acknowledgedAt: z.string().nullable() }),
});
export type MyPrivacy = z.infer<typeof MyPrivacy>;

/** Data protection tab of the person file (`GET /api/privacy/persons/:personId`). */
export const PersonPrivacy = z.object({
  requests: z.array(PrivacyRequest),
  /** Privacy notice acknowledged by the user linked to the person; `null` without a linked user. */
  notice: z.object({ version: z.number().int().nullable(), acknowledgedAt: z.string().nullable() }).nullable(),
  /** Restriction of processing (Art. 18); `null` if none. */
  restriction: ProcessingRestriction.nullable(),
  /** Information under Art. 13/14 recorded for the person; `null` if none. */
  information: PrivacyInformation.nullable(),
});
export type PersonPrivacy = z.infer<typeof PersonPrivacy>;

/** A user who may be assigned to requests (holder of `privacy.manage`). */
export const PrivacyAssignee = z.object({ id: z.string(), displayName: z.string() });
export type PrivacyAssignee = z.infer<typeof PrivacyAssignee>;

/** Adds one month (or more) to a date like the GDPR period: the same day of the month, clamped to the month's end. */
export function addMonthsToDate(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
