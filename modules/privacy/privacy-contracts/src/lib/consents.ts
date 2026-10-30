import { z } from 'zod';
import { ConsentEffect, LocalizedText } from '@forga/core-contracts';

/**
 * Consents (L9, Art. 6(1) a, 7, 8 GDPR): a catalog of consents in the data protection settings and the consents given
 * by persons. Recording and withdrawing consents of the persons of a department; the catalog itself belongs to
 * `privacy.manage`.
 */
export const CONSENTS_PERMISSION = 'privacy.consents';

const isoDate = z.iso.date();

/** Who gives the consent: the person, or for minors their legal guardians (Art. 8; clarify with the DPO). */
export const ConsentGivenBy = z.enum(['person', 'person-or-guardians']);
export type ConsentGivenBy = z.infer<typeof ConsentGivenBy>;

const localizedLong = z.object({ de: z.string().trim().min(1).max(10000), en: z.string().trim().min(1).max(10000) });
const localizedShort = z.object({ de: z.string().trim().min(1).max(200), en: z.string().trim().min(1).max(200) });
const localizedPurpose = z.object({ de: z.string().trim().max(1000).default(''), en: z.string().trim().max(1000).default('') });

/**
 * One consent of the catalog (setting `privacy.consents`). Title and text are versioned: a changed title or text raises
 * `version` and makes the entry a template again until it is marked as reviewed; consents already given keep their
 * version (and its text) until the person consents again.
 */
export const ConsentDefinition = z.object({
  key: z.string().regex(/^[a-z][a-z0-9-]{1,59}$/),
  title: localizedShort,
  text: localizedLong,
  purpose: localizedPurpose.prefault({}),
  givenBy: ConsentGivenBy.default('person'),
  effects: z.array(ConsentEffect).default([]),
  /** Offered to the members (first sign-in, "My area") and recordable; inactive entries keep their consents. */
  active: z.boolean().default(true),
  version: z.number().int().min(1).default(1),
  changedAt: z.string().nullable().default(null),
  changedBy: z.string().nullable().default(null),
  reviewedAt: z.string().nullable().default(null),
  reviewedBy: z.string().nullable().default(null),
});
export type ConsentDefinition = z.infer<typeof ConsentDefinition>;

/** Setting `privacy.consents`: the catalog. Changed only through `/api/privacy/consents`. */
export const PrivacyConsents = z.object({ consents: z.array(ConsentDefinition).max(50).default([]) });
export type PrivacyConsents = z.infer<typeof PrivacyConsents>;

/** Creates or changes a catalog entry (`PUT /api/privacy/consents/:key`); `version` of the stored entry, none for a new one. */
export const ConsentDefinitionInput = z.object({
  title: localizedShort,
  text: localizedLong,
  purpose: localizedPurpose.prefault({}),
  givenBy: ConsentGivenBy,
  effects: z.array(ConsentEffect).max(10).default([]),
  active: z.boolean().default(true),
  version: z.number().int().min(1).optional(),
});
export type ConsentDefinitionInput = z.input<typeof ConsentDefinitionInput>;

/** An entry applies (is offered and recordable) when it is active and reviewed. */
export const consentApplies = (definition: ConsentDefinition) => definition.active && definition.reviewedAt !== null;

/** The catalog with the number of persons with a valid consent per entry (`GET /api/privacy/consents`). */
export const ConsentCatalog = z.object({
  consents: z.array(ConsentDefinition),
  given: z.record(z.string(), z.number().int()),
  effects: z.array(z.object({ key: ConsentEffect, module: z.string(), label: LocalizedText })),
});
export type ConsentCatalog = z.infer<typeof ConsentCatalog>;

/** How a consent was given: in writing, in person, by the legal guardians, in "My area" or at the first sign-in. */
export const ConsentWay = z.enum(['written', 'in-person', 'guardians', 'my-area', 'first-login']);
export type ConsentWay = z.infer<typeof ConsentWay>;

/** How a consent was withdrawn; `request`: by closing a request of kind "withdrawal of consent". */
export const ConsentWithdrawalWay = z.enum(['written', 'email', 'in-person', 'my-area', 'request']);
export type ConsentWithdrawalWay = z.infer<typeof ConsentWithdrawalWay>;

/** Records a consent at the person (`POST /api/privacy/persons/:personId/consents`). The proof is uploaded as attachment. */
export const ConsentRecordInput = z.object({
  key: z.string().min(1).max(60),
  givenOn: isoDate,
  via: z.enum(['written', 'in-person', 'guardians']),
});
export type ConsentRecordInput = z.input<typeof ConsentRecordInput>;

/** Records the withdrawal of a consent (`POST /api/privacy/consents/given/:id/withdraw`). */
export const ConsentWithdrawalInput = z.object({
  withdrawnOn: isoDate,
  via: z.enum(['written', 'email', 'in-person']),
  /** Request of kind "withdrawal of consent" closed by this withdrawal. */
  requestId: z.uuid().nullable().default(null),
});
export type ConsentWithdrawalInput = z.input<typeof ConsentWithdrawalInput>;

/** A consent of a person as the administration sees it; never deleted, only withdrawn. */
export const PersonConsent = z.object({
  id: z.string(),
  key: z.string(),
  /** Title of the version that was consented to. */
  title: LocalizedText,
  text: z.object({ de: z.string(), en: z.string() }),
  version: z.number().int(),
  /** Version of the catalog entry now; `null` if the entry was removed from the catalog. */
  currentVersion: z.number().int().nullable(),
  givenOn: z.string(),
  givenVia: ConsentWay,
  recordedByName: z.string().nullable(),
  withdrawnOn: z.string().nullable(),
  withdrawnVia: ConsentWithdrawalWay.nullable(),
  withdrawnByName: z.string().nullable(),
  /** The person consented to a newer version that day; this consent no longer counts. */
  supersededOn: z.string().nullable(),
  requestId: z.string().nullable(),
  proofCount: z.number().int(),
});
export type PersonConsent = z.infer<typeof PersonConsent>;

/** Consents of a person (data protection tab): entries that may be recorded, and the given ones. */
export const PersonConsents = z.object({
  consents: z.array(PersonConsent),
  /** Catalog entries that apply; recording needs `privacy.consents` for the person's department. */
  recordable: z.array(z.object({ key: z.string(), title: LocalizedText, version: z.number().int(), givenBy: ConsentGivenBy })),
  canRecord: z.boolean(),
  /** The person is under 18: consents are given by the legal guardians. */
  minor: z.boolean(),
});
export type PersonConsents = z.infer<typeof PersonConsents>;

/** One consent in "My area" and at the first sign-in. */
export const MyConsent = z.object({
  key: z.string(),
  title: LocalizedText,
  text: z.object({ de: z.string(), en: z.string() }),
  purpose: z.object({ de: z.string(), en: z.string() }),
  /** Version of the catalog entry offered now; `null` if the entry no longer applies. */
  version: z.number().int().nullable(),
  /** The person's consent: given (with the version) or withdrawn; `null` never asked. */
  given: z.object({ id: z.string(), version: z.number().int(), givenOn: z.string(), via: ConsentWay }).nullable(),
  withdrawnOn: z.string().nullable(),
});
export type MyConsent = z.infer<typeof MyConsent>;

/** "Meine Einwilligungen" (`GET /api/privacy/me/consents`). Minors only see them; guardians consent in writing. */
export const MyConsents = z.object({ minor: z.boolean(), consents: z.array(MyConsent) });
export type MyConsents = z.infer<typeof MyConsents>;

/** Gives or withdraws an own consent (`PUT /api/privacy/me/consents/:key`), at the first sign-in with `firstLogin`. */
export const MyConsentInput = z.object({ given: z.boolean(), version: z.number().int().min(1).optional(), firstLogin: z.boolean().default(false) });
export type MyConsentInput = z.input<typeof MyConsentInput>;

/**
 * Templates of the catalog ("Vorlagen einfügen"), marked as template until reviewed. They only name the purpose and
 * placeholders; the brigade writes the texts with the data protection officer.
 */
export const CONSENT_TEMPLATES: Record<string, Omit<ConsentDefinitionInput, 'version'>> = {
  'photos-public-relations': {
    title: { de: 'Fotos in der Öffentlichkeitsarbeit', en: 'Photos in public relations' },
    text: {
      de: '[Vorlage] Ich willige ein, dass die Feuerwehr Fotos, auf denen ich zu erkennen bin, in ihrer Öffentlichkeitsarbeit verwendet [Website, Presse, soziale Medien – genau benennen]. Die Einwilligung ist freiwillig und kann jederzeit mit Wirkung für die Zukunft widerrufen werden (Art. 7 Abs. 3 DSGVO).',
      en: '[Template] I consent to the fire brigade using photos on which I can be recognised in its public relations [website, press, social media – name them]. The consent is voluntary and can be withdrawn at any time with effect for the future (Art. 7(3) GDPR).',
    },
    purpose: { de: 'Öffentlichkeitsarbeit der Feuerwehr', en: 'Public relations of the fire brigade' },
    givenBy: 'person-or-guardians',
    effects: [],
  },
  'birthday-posting': {
    title: { de: 'Geburtstag im Aushang', en: 'Birthday on the notice board' },
    text: {
      de: '[Vorlage] Ich willige ein, dass mein Geburtstag (Tag und Monat, bei runden Geburtstagen das Alter) im Gerätehaus ausgehängt wird. Die Einwilligung ist freiwillig und kann jederzeit mit Wirkung für die Zukunft widerrufen werden (Art. 7 Abs. 3 DSGVO).',
      en: '[Template] I consent to my birthday (day and month, the age for milestone birthdays) being posted in the fire station. The consent is voluntary and can be withdrawn at any time with effect for the future (Art. 7(3) GDPR).',
    },
    purpose: { de: 'Aushang der Geburtstage im Gerätehaus', en: 'Posting birthdays in the fire station' },
    givenBy: 'person',
    effects: ['masterdata.birthdays-posting'],
  },
  'phone-list-mobile': {
    title: { de: 'Handynummer in der Telefonliste der Abteilung', en: 'Mobile number in the phone list of the department' },
    text: {
      de: '[Vorlage] Ich willige ein, dass meine Handynummer in der Telefonliste meiner Abteilung steht, die alle Mitglieder der Abteilung erhalten. Ohne Einwilligung erreichen mich die Mitglieder über den Gruppenführer. Die Einwilligung ist freiwillig und kann jederzeit mit Wirkung für die Zukunft widerrufen werden (Art. 7 Abs. 3 DSGVO).',
      en: '[Template] I consent to my mobile number being in the phone list of my department that all members of the department receive. Without consent members reach me through the group leader. The consent is voluntary and can be withdrawn at any time with effect for the future (Art. 7(3) GDPR).',
    },
    purpose: { de: 'Erreichbarkeit innerhalb der Abteilung', en: 'Reachability within the department' },
    givenBy: 'person',
    effects: ['masterdata.phone-list-mobile'],
  },
  'birthday-greeting': {
    title: { de: 'Geburtstagsgruß durch die Feuerwehr', en: 'Birthday greeting by the fire brigade' },
    text: {
      de: '[Vorlage] Ich willige ein, dass die Feuerwehr mein Geburtsdatum nutzt, um mir zum Geburtstag zu gratulieren [Weg benennen, z. B. Karte oder Besuch]. Die Einwilligung ist freiwillig und kann jederzeit mit Wirkung für die Zukunft widerrufen werden (Art. 7 Abs. 3 DSGVO).',
      en: '[Template] I consent to the fire brigade using my date of birth to congratulate me on my birthday [name the way, e.g. card or visit]. The consent is voluntary and can be withdrawn at any time with effect for the future (Art. 7(3) GDPR).',
    },
    purpose: { de: 'Glückwünsche der Feuerwehr', en: 'Congratulations of the fire brigade' },
    givenBy: 'person',
    effects: [],
  },
};
