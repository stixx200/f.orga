import { erasureAuditDe, erasureAuditEn, erasureAuditKeysDe, erasureAuditKeysEn } from './i18n/erasure';
import { minimisationAuditDe, minimisationAuditEn } from './i18n/minimisation';
import { registerAuditDe, registerAuditEn } from './i18n/register';
import { transparencyAuditDe, transparencyAuditEn, transparencyAuditKeysDe, transparencyAuditKeysEn } from './i18n/transparency';

/** Texts of the audit log page (shell) for the actions and detail keys of this module. */
export const audit = {
  de: {
    unknownUser: 'gelöschter Benutzer',
    actions: {
      ...registerAuditDe.actions,
      ...minimisationAuditDe.actions,
      ...transparencyAuditDe,
      ...erasureAuditDe,
      'privacy.notice-published': 'Neue Fassung des Datenschutzhinweises',
      'privacy.notice-acknowledged': 'Datenschutzhinweis zur Kenntnis genommen',
      'privacy.text-changed': 'Datenschutztext geändert',
      'privacy.text-reviewed': 'Datenschutztext als geprüft markiert',
      'privacy.request-created': 'Datenschutzanfrage erfasst',
      'privacy.request-status-changed': 'Stand einer Datenschutzanfrage geändert',
      'privacy.request-extended': 'Frist einer Datenschutzanfrage verlängert',
      'privacy.request-closed': 'Datenschutzanfrage abgeschlossen',
      'privacy.request-reopened': 'Datenschutzanfrage wieder geöffnet',
      'privacy.recipients-notified': 'Empfänger informiert (Art. 19)',
      'privacy.reply-created': 'Antwortschreiben erstellt',
      'privacy.restricted': 'Verarbeitung eingeschränkt',
      'privacy.restriction-lifted': 'Einschränkung der Verarbeitung aufgehoben',
      'privacy.information-recorded': 'Information nach Art. 13/14 vermerkt',
      'privacy.access-report-created': 'Auskunft erstellt',
      'privacy.access-report-downloaded': 'Auskunft heruntergeladen',
      'privacy.access-report-handed-over': 'Auskunft übergeben',
    },
    keys: {
      ...registerAuditDe.keys,
      ...minimisationAuditDe.keys,
      ...transparencyAuditKeysDe,
      ...erasureAuditKeysDe,
    },
  },
  en: {
    unknownUser: 'deleted user',
    actions: {
      ...registerAuditEn.actions,
      ...minimisationAuditEn.actions,
      ...transparencyAuditEn,
      ...erasureAuditEn,
      'privacy.notice-published': 'New version of the privacy notice',
      'privacy.notice-acknowledged': 'Privacy notice acknowledged',
      'privacy.text-changed': 'Data protection text changed',
      'privacy.text-reviewed': 'Data protection text marked as reviewed',
      'privacy.request-created': 'Data protection request recorded',
      'privacy.request-status-changed': 'Status of a data protection request changed',
      'privacy.request-extended': 'Deadline of a data protection request extended',
      'privacy.request-closed': 'Data protection request closed',
      'privacy.request-reopened': 'Data protection request reopened',
      'privacy.recipients-notified': 'Recipients informed (Art. 19)',
      'privacy.reply-created': 'Reply letter created',
      'privacy.restricted': 'Processing restricted',
      'privacy.restriction-lifted': 'Restriction of processing lifted',
      'privacy.information-recorded': 'Information under Art. 13/14 recorded',
      'privacy.access-report-created': 'Access report created',
      'privacy.access-report-downloaded': 'Access report downloaded',
      'privacy.access-report-handed-over': 'Access report handed over',
    },
    keys: {
      ...registerAuditEn.keys,
      ...minimisationAuditEn.keys,
      ...transparencyAuditKeysEn,
      ...erasureAuditKeysEn,
    },
  },
};
