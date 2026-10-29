import { Injectable } from '@nestjs/common';
import type { BrigadeSettings, Language } from '@forga/core-contracts';
import { SettingsService } from '../settings/settings.js';

/** Contacts and text blocks of the cover letter (Art. 15 para. 1 GDPR). */
export interface AccessReportLetterTexts {
  /** At least one text is still a template („Vorlage“) not confirmed by anyone. */
  template: boolean;
  controller: string;
  dataProtectionOfficer: string;
  /** Supervisory authority with address (right to lodge a complaint, f). */
  authority: string;
  introduction: string;
  /** Rights of the person (e): rectification, erasure, restriction, objection. */
  rights: string;
  /** Automated decision-making (h). */
  automatedDecision: string;
  /** Transfer to third countries (Art. 15 para. 2). */
  thirdCountry: string;
  closing: string;
}

const TEMPLATE = { de: 'Vorlage', en: 'Template' } as const;

/**
 * Where the cover letter gets its contacts and text blocks from. Until the settings „Datenschutz“ (`privacy.contacts`,
 * `privacy.texts`) exist, it uses example texts that are marked as template („Vorlage“): they name only the titles of
 * the articles and placeholders and have to be checked with the data protection officer of the municipality.
 */
@Injectable()
export class AccessReportTexts {
  constructor(private readonly settings: SettingsService) {}

  async letter(language: Language): Promise<AccessReportLetterTexts> {
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const de = language === 'de';
    const mark = (text: string) => `[${TEMPLATE[language]}] ${text}`;
    const municipality = brigade?.municipality || (de ? '[Gemeinde]' : '[municipality]');
    const name = brigade?.name ?? '';
    return {
      template: true,
      controller: de
        ? `${municipality}, für die ${name} [Anschrift und Vertretung in den Einstellungen Datenschutz eintragen]`
        : `${municipality}, for the ${name} [enter address and representative in the data protection settings]`,
      dataProtectionOfficer: de
        ? `Datenschutzbeauftragter der ${municipality} [Kontakt in den Einstellungen Datenschutz eintragen]`
        : `Data protection officer of ${municipality} [enter contact in the data protection settings]`,
      authority: de
        ? 'Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit Baden-Württemberg [Anschrift in den Einstellungen eintragen]'
        : 'The State Commissioner for Data Protection and Freedom of Information Baden-Württemberg [enter address in the settings]',
      introduction: mark(
        de
          ? 'Sie haben Auskunft über die personenbezogenen Daten verlangt, die wir über Sie verarbeiten. Auf den folgenden Seiten finden Sie die Angaben nach Art. 15 DSGVO und eine Kopie Ihrer Daten. [Textbaustein „Einleitung“ – mit dem Datenschutzbeauftragten der Gemeinde abzustimmen.]'
          : 'You have asked for access to the personal data we process about you. The following pages contain the information under Art. 15 GDPR and a copy of your data. [Text block "introduction" – to be agreed with the data protection officer of the municipality.]',
      ),
      rights: de
        ? 'Recht auf Berichtigung (Art. 16 DSGVO), Recht auf Löschung (Art. 17 DSGVO), Recht auf Einschränkung der Verarbeitung (Art. 18 DSGVO), Widerspruchsrecht (Art. 21 DSGVO)'
        : 'Right to rectification (Art. 16 GDPR), right to erasure (Art. 17 GDPR), right to restriction of processing (Art. 18 GDPR), right to object (Art. 21 GDPR)',
      automatedDecision: mark(
        de
          ? 'Eine automatisierte Entscheidungsfindung einschließlich Profiling (Art. 22 DSGVO) findet nicht statt. Hinweise der Anwendung (z. B. Ampeln, Beförderungsvorschläge) sind Entscheidungshilfen.'
          : 'There is no automated decision-making including profiling (Art. 22 GDPR). Hints of the application (e.g. traffic lights, promotion proposals) only support decisions.',
      ),
      thirdCountry: mark(de ? 'Eine Übermittlung in Drittländer findet nicht statt.' : 'There is no transfer to third countries.'),
      closing: de ? 'Mit freundlichen Grüßen' : 'Kind regards',
    };
  }
}
