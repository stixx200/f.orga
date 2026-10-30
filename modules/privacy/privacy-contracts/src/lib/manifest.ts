import type { ModuleManifest } from '@forga/core-contracts';
import { CONSENTS_PERMISSION } from './consents.js';
import { PRIVACY_PERMISSION } from './privacy.js';

/** Retention category of the read log. */
export const ACCESS_LOG_RETENTION = 'privacy.access-log';
/** Retention category of the records of access reports. */
export const ACCESS_REPORTS_RETENTION = 'privacy.access-reports';
/** Retention category of the documentation of data breaches. */
export const BREACHES_RETENTION = 'privacy.breaches';

/**
 * Data protection administration (GDPR): data subject requests with deadlines, restriction of processing, erasure check,
 * privacy notice, consents, access report, read log, register of processing activities and data breaches. The security
 * of the core (second factor, sessions, retention plan, anonymisation) works without this module.
 */
export const PRIVACY_MANIFEST = {
  id: 'privacy',
  name: { de: 'Datenschutz', en: 'Data protection' },
  version: '0.1.0',
  requires: ['masterdata'],
  permissions: [
    {
      id: PRIVACY_PERMISSION,
      name: { de: 'Datenschutz verwalten (Anfragen, Einschränkung, Datenschutzhinweis)', en: 'Manage data protection (requests, restriction, privacy notice)' },
      scope: 'brigade',
      privileged: true,
      stepUp: true,
    },
    {
      id: CONSENTS_PERMISSION,
      name: { de: 'Einwilligungen von Personen erfassen und widerrufen', en: 'Record and withdraw consents of persons' },
      scope: 'department',
    },
  ],
  navigation: [
    { label: { de: 'Datenschutz', en: 'Data protection' }, path: '', permission: PRIVACY_PERMISSION, icon: 'privacy', section: 'administration' },
    // Settings page: a button at the module on „Verwaltung → Module“; the setup list has its own steps (contacts, texts).
    { label: { de: 'Datenschutz', en: 'Data protection' }, path: 'settings', permission: PRIVACY_PERMISSION, icon: 'settings', section: 'settings', onboarding: false },
  ],
  roles: [
    { key: 'commander', permissions: [CONSENTS_PERMISSION] },
    { key: 'department-commander', permissions: [CONSENTS_PERMISSION] },
  ],
  // The privacy notice is readable without sign-in at `/privacy-notice`.
  frontend: { remote: 'privacy_web', exposed: './Module', kiosk: { path: 'privacy-notice', exposed: './Notice' } },
  privacy: {
    personData: true,
    activities: [
      {
        key: 'privacy.data-protection',
        name: { de: 'Datenschutzverwaltung', en: 'Data protection administration' },
        purpose: {
          de: 'Bearbeitung von Betroffenenanfragen, Einwilligungen, Information nach Art. 13/14, Leseprotokoll und Dokumentation von Datenpannen (Rechenschaftspflicht)',
          en: 'Handling data subject requests, consents, information under Art. 13/14, read log and documentation of data breaches (accountability)',
        },
        recipients: [{ de: 'Aufsichtsbehörde (Meldung einer Datenpanne)', en: 'Supervisory authority (notification of a data breach)' }],
        retention: [ACCESS_LOG_RETENTION, ACCESS_REPORTS_RETENTION, BREACHES_RETENTION],
        subjects: [
          { de: 'Mitglieder und Benutzer von f.orga', en: 'Members and users of f.orga' },
          { de: 'Dritte, die eine Anfrage stellen', en: 'Third parties making a request' },
        ],
        categories: [
          { de: 'Anfragen mit Inhalt, Frist und Antwort', en: 'Requests with content, deadline and reply' },
          { de: 'Einwilligungen und Widerrufe, Kenntnisnahme des Datenschutzhinweises', en: 'Consents and withdrawals, acknowledgement of the privacy notice' },
          { de: 'Einschränkung der Verarbeitung, Information nach Art. 13/14', en: 'Restriction of processing, information under Art. 13/14' },
          { de: 'Leseprotokoll (wer hat wann besonders geschützte Daten gelesen)', en: 'Read log (who read especially protected data when)' },
          { de: 'Datenpannen mit betroffenen Personen', en: 'Data breaches with persons affected' },
        ],
        health: false,
        thirdParties: true,
        legalBasisHint: { de: 'Art. 12–22, 30, 33, 34 DSGVO; Rechenschaftspflicht (Art. 5 Abs. 2 DSGVO)', en: 'Art. 12–22, 30, 33, 34 GDPR; accountability (Art. 5(2) GDPR)' },
      },
    ],
  },
} satisfies ModuleManifest;
