import type { LocalizedText } from '@forga/core-contracts';

/**
 * Templates of the privacy text blocks (setting `privacy.texts`). They only name titles of GDPR articles and
 * placeholders in square brackets and must be reviewed with the data protection officer of the municipality before
 * they apply. Placeholders in braces are filled in when the text is used, e.g. `{brigade}`, `{name}`, `{receivedOn}`.
 */
export const PRIVACY_TEXT_TEMPLATES = {
  noticeIntro: {
    de: '[Vorlage] Die {brigade} verwaltet mit der Anwendung f.orga die Daten ihrer Mitglieder: Personalakte, Einsätze, Dienste, Ausbildung, Atemschutz, Entschädigung und Ausrüstung. Dieser Hinweis informiert nach Art. 13 und Art. 14 DSGVO (Informationspflicht), wer verantwortlich ist, welche Daten wofür verarbeitet werden, wie lange sie gespeichert bleiben und welche Rechte Sie haben.',
    en: '[Template] The {brigade} manages the data of its members with the application f.orga: personnel file, incidents, duty sessions, training, breathing protection, compensation and equipment. Following Art. 13 and Art. 14 GDPR (information to be provided), this notice says who is responsible, which data are processed for which purpose, how long they are kept and which rights you have.',
  },
  noticeProcessing: {
    de: '[Vorlage]\n- Personalverwaltung der Feuerwehr: Stammdaten, Kontakt, Mitgliedschaft, Laufbahn, Qualifikationen\n- Einsatzdokumentation: Einsatzzeiten, Funktion, Fahrzeug, Atemschutz\n- Dienstbetrieb und Ausbildung: Anwesenheit, Entschuldigungen\n- Atemschutzüberwachung: Nachweise und Eignungsuntersuchungen (Gesundheitsdaten)\n- Entschädigung: Posten, Auszahlungen, Bankverbindung\n- Benutzerkonten und Protokolle: Anmeldungen, Änderungen\n\nRechtsgrundlagen: [von der Gemeinde einzutragen]\nEmpfänger: [z. B. Gemeindeverwaltung bzw. Kämmerei für die Entschädigung]\nSpeicherdauer: nach dem Aufbewahrungsplan der Feuerwehr [Fristen einzutragen]',
    en: '[Template]\n- Personnel administration of the fire brigade: master data, contact, membership, career, qualifications\n- Incident documentation: times, function, vehicle, breathing protection\n- Duty sessions and training: attendance, excuses\n- Breathing protection: records and medical examinations (health data)\n- Compensation: items, payouts, bank account\n- User accounts and logs: sign-ins, changes\n\nLegal bases: [to be entered by the municipality]\nRecipients: [e.g. municipal administration or treasury for the compensation]\nStorage period: according to the retention plan of the fire brigade [periods to be entered]',
  },
  rights: {
    de: '[Vorlage] Sie haben das Recht auf Auskunft (Art. 15 DSGVO), Berichtigung (Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung (Art. 18) und Widerspruch (Art. 21) sowie auf Widerruf einer Einwilligung (Art. 7 Abs. 3). Mitglieder mit Benutzerkonto stellen Anfragen in f.orga unter „Mein Bereich“, alle anderen beim Kommandanten oder beim Datenschutzbeauftragten.',
    en: '[Template] You have the right of access (Art. 15 GDPR), to rectification (Art. 16), to erasure (Art. 17), to restriction of processing (Art. 18) and to object (Art. 21), and to withdraw a consent (Art. 7(3)). Members with a user account make requests in f.orga under “My area”, everybody else with the commander or the data protection officer.',
  },
  automatedDecisions: {
    de: '[Vorlage] Eine automatisierte Entscheidung im Einzelfall einschließlich Profiling (Art. 22 DSGVO) findet nicht statt. Ampeln, Fristen und Vorschläge in f.orga (z. B. zur Beförderung) sind Entscheidungshilfen; es entscheiden die zuständigen Personen.',
    en: '[Template] There is no automated individual decision-making, including profiling (Art. 22 GDPR). Traffic lights, deadlines and suggestions in f.orga (e.g. for promotions) support decisions; the responsible persons decide.',
  },
  thirdCountry: {
    de: '[Vorlage] Die Daten werden nicht in ein Drittland oder an eine internationale Organisation übermittelt.',
    en: '[Template] The data are not transferred to a third country or to an international organisation.',
  },
  firstLogin: {
    de: '[Vorlage] f.orga speichert Daten der Mitglieder der {brigade}, darunter Ihre eigenen. Wofür, wie lange und welche Rechte Sie haben, steht im Datenschutzhinweis.\n\n- Nutzen Sie die Daten nur für Ihre Aufgabe in der Feuerwehr.\n- Geben Sie Listen und Ausdrucke nicht weiter und vernichten Sie sie nach Gebrauch.\n- Tragen Sie in Bemerkungen keine Gesundheitsangaben ein.',
    en: '[Template] f.orga stores data of the members of the {brigade}, including your own. What for, how long and which rights you have is explained in the privacy notice.\n\n- Use the data only for your task in the fire brigade.\n- Do not pass on lists and printouts and destroy them after use.\n- Do not enter health details in notes.',
  },
  accessReportIntro: {
    de: '[Vorlage] Sie haben am {receivedOn} Auskunft über die zu Ihrer Person gespeicherten Daten verlangt. Auf den folgenden Seiten finden Sie alle Daten, die die {brigade} in f.orga zu Ihnen speichert, und die Angaben nach Art. 15 Abs. 1 DSGVO.',
    en: '[Template] On {receivedOn} you requested access to the personal data stored about you. The following pages list all data the {brigade} stores about you in f.orga and the information under Art. 15(1) GDPR.',
  },
  replyAccess: {
    de: '[Vorlage] Sehr geehrte(r) {name},\n\nSie haben am {receivedOn} Auskunft nach Art. 15 DSGVO verlangt. Die Auskunft liegt diesem Schreiben bei bzw. steht für Sie in f.orga unter „Mein Bereich“ bereit.\n\nMit freundlichen Grüßen',
    en: '[Template] Dear {name},\n\nOn {receivedOn} you requested access under Art. 15 GDPR. The information is enclosed with this letter or available for you in f.orga under “My area”.\n\nKind regards',
  },
  replyRectification: {
    de: '[Vorlage] Sehr geehrte(r) {name},\n\nSie haben am {receivedOn} die Berichtigung Ihrer Daten verlangt (Art. 16 DSGVO). Wir haben die Angaben berichtigt [bzw.: Begründung, warum nicht]. Empfänger, denen die Daten offengelegt wurden, haben wir unterrichtet (Art. 19 DSGVO).\n\nMit freundlichen Grüßen',
    en: '[Template] Dear {name},\n\nOn {receivedOn} you requested the rectification of your data (Art. 16 GDPR). We have rectified the data [or: reason why not]. We have informed recipients to whom the data were disclosed (Art. 19 GDPR).\n\nKind regards',
  },
  replyErasure: {
    de: '[Vorlage] Sehr geehrte(r) {name},\n\nSie haben am {receivedOn} die Löschung Ihrer Daten verlangt (Art. 17 DSGVO). [Ergebnis der Prüfung: gelöschte Daten; Daten, die aufzubewahren sind, mit Grund und Frist.]\n\nMit freundlichen Grüßen',
    en: '[Template] Dear {name},\n\nOn {receivedOn} you requested the erasure of your data (Art. 17 GDPR). [Result of the review: erased data; data that have to be kept, with reason and period.]\n\nKind regards',
  },
  replyRestriction: {
    de: '[Vorlage] Sehr geehrte(r) {name},\n\nSie haben am {receivedOn} die Einschränkung der Verarbeitung Ihrer Daten verlangt (Art. 18 DSGVO). Die Verarbeitung ist eingeschränkt [bis …]. Wir unterrichten Sie, bevor die Einschränkung aufgehoben wird.\n\nMit freundlichen Grüßen',
    en: '[Template] Dear {name},\n\nOn {receivedOn} you requested the restriction of processing of your data (Art. 18 GDPR). The processing is restricted [until …]. We will inform you before the restriction is lifted.\n\nKind regards',
  },
  replyObjection: {
    de: '[Vorlage] Sehr geehrte(r) {name},\n\nSie haben am {receivedOn} Widerspruch gegen die Verarbeitung Ihrer Daten eingelegt (Art. 21 DSGVO), Bezug: {activity}. [Ergebnis der Abwägung mit Begründung.]\n\nMit freundlichen Grüßen',
    en: '[Template] Dear {name},\n\nOn {receivedOn} you objected to the processing of your data (Art. 21 GDPR), regarding: {activity}. [Result of the assessment with reasons.]\n\nKind regards',
  },
  replyConsentWithdrawal: {
    de: '[Vorlage] Sehr geehrte(r) {name},\n\nSie haben am {receivedOn} Ihre Einwilligung widerrufen (Art. 7 Abs. 3 DSGVO). Die Einwilligung gilt ab diesem Tag nicht mehr.\n\nMit freundlichen Grüßen',
    en: '[Template] Dear {name},\n\nOn {receivedOn} you withdrew your consent (Art. 7(3) GDPR). The consent no longer applies from that day.\n\nKind regards',
  },
  replyRejection: {
    de: '[Vorlage] Sehr geehrte(r) {name},\n\nIhre Anfrage vom {receivedOn} ({kind}) können wir nicht erfüllen. Begründung: {reason}\n\nSie können sich bei der Aufsichtsbehörde beschweren: {authority}.\n\nMit freundlichen Grüßen',
    en: '[Template] Dear {name},\n\nWe cannot comply with your request of {receivedOn} ({kind}). Reason: {reason}\n\nYou can lodge a complaint with the supervisory authority: {authority}.\n\nKind regards',
  },
  replyExtension: {
    de: '[Vorlage] Sehr geehrte(r) {name},\n\nIhre Anfrage vom {receivedOn} ({kind}) beantworten wir bis zum {extendedUntil}. Die Frist verlängert sich nach Art. 12 Abs. 3 DSGVO. Grund: {reason}\n\nMit freundlichen Grüßen',
    en: '[Template] Dear {name},\n\nWe will answer your request of {receivedOn} ({kind}) by {extendedUntil}. The period is extended under Art. 12(3) GDPR. Reason: {reason}\n\nKind regards',
  },
} as const satisfies Record<string, LocalizedText>;
