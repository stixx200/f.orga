import { z } from 'zod';
import { LocalizedText } from './i18n.js';

/**
 * A processing activity of a module (Art. 30 GDPR), named in the manifest. Sections of the access report refer to it
 * (purpose, recipients and retention period of the section come from here), and the register of processing activities
 * is composed of the activities of the active modules.
 */
export const ProcessingActivity = z.object({
  /** `<module-id>.<name>`, e.g. `incidents.reports`. */
  key: z.string().regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/),
  name: LocalizedText,
  purpose: LocalizedText,
  /** Recipients outside f.orga, e.g. the treasury of the municipality. */
  recipients: z.array(LocalizedText).default([]),
  /** Retention categories whose periods apply (setting `retention`), e.g. `incidents.incidents`. */
  retention: z.array(z.string()).default([]),
  /** Categories of data subjects (Art. 30(1) c), e.g. members, persons involved in an incident. */
  subjects: z.array(LocalizedText).default([]),
  /** Categories of personal data (Art. 30(1) c), e.g. "times of the operation, function, vehicle". */
  categories: z.array(LocalizedText).default([]),
  /** Special categories of data (Art. 9), e.g. injuries or medical examinations. */
  health: z.boolean().default(false),
  /** What the special categories are, e.g. "injuries of the fire fighters"; shown with `health`. */
  healthNote: LocalizedText.optional(),
  /** Hint for the legal basis the municipality decides on, e.g. "§ 9 FwG (duty to keep records)"; no legal advice. */
  legalBasisHint: LocalizedText.optional(),
  /**
   * The activity stores data of third parties who are no persons of the master data (L14), e.g. persons involved in an
   * incident: the register hints at Art. 14 and at the access report and erasure for "another person".
   */
  thirdParties: z.boolean().default(false),
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
    retention: ['core.audit', 'core.history', 'core.locked-accounts'],
    subjects: [{ de: 'Benutzer von f.orga', en: 'Users of f.orga' }],
    categories: [
      { de: 'Benutzername, Name, E-Mail-Adresse, Rollen und Rechte', en: 'Username, name, e-mail address, roles and permissions' },
      { de: 'Anmeldungen, Sitzungen, zweiter Faktor, API-Tokens', en: 'Logins, sessions, second factor, API tokens' },
      { de: 'Audit-Log und Historie der Änderungen', en: 'Audit log and history of changes' },
    ],
    health: false,
    thirdParties: false,
    legalBasisHint: { de: 'Datensicherheit (Art. 32 DSGVO), Rechenschaftspflicht (Art. 5 Abs. 2 DSGVO)', en: 'Security of processing (Art. 32 GDPR), accountability (Art. 5(2) GDPR)' },
  },
];
