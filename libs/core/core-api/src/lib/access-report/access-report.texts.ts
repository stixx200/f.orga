import { Injectable } from '@nestjs/common';
import { fillPlaceholders, type BrigadeSettings, type Language, type PrivacyTextKey } from '@forga/core-contracts';
import { PrivacyNoticeService } from '../privacy/privacy-notice.js';
import { formatDay, lines } from '../privacy/privacy-text.js';
import { SettingsService } from '../settings/settings.js';

/** Contacts and text blocks of the cover letter (Art. 15 para. 1 GDPR). */
export interface AccessReportLetterTexts {
  /** At least one text block of the letter is still a template („Vorlage“) not confirmed as reviewed. */
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

/** Text blocks of the cover letter; the letter is a template while one of them is not reviewed. */
const LETTER_BLOCKS: PrivacyTextKey[] = ['accessReportIntro', 'rights', 'automatedDecisions', 'thirdCountry'];

/**
 * The contacts (`privacy.contacts`) and text blocks (`privacy.texts`) of the settings „Datenschutz“ for the cover letter;
 * missing contacts appear as placeholder in square brackets.
 */
@Injectable()
export class AccessReportTexts {
  constructor(
    private readonly settings: SettingsService,
    private readonly notices: PrivacyNoticeService,
  ) {}

  /** `receivedOn`: day the request came in (`YYYY-MM-DD`), or the day of the report without a request. */
  async letter(language: Language, values: { name: string; receivedOn: string }): Promise<AccessReportLetterTexts> {
    const [brigade, contacts, texts] = await Promise.all([this.settings.get<BrigadeSettings>('brigade'), this.notices.contacts(), this.notices.texts()]);
    const de = language === 'de';
    const missing = de ? '[in den Einstellungen Datenschutz eintragen]' : '[enter in the data protection settings]';
    const inline = (...parts: (string | null | undefined)[]) => lines(...parts).replaceAll('\n', ', ') || missing;
    const filled = (key: PrivacyTextKey) =>
      fillPlaceholders(texts[key].text[language], { brigade: brigade?.name ?? '', name: values.name, receivedOn: formatDay(values.receivedOn, language) });
    const { controller, dpo, authority } = contacts;
    return {
      template: LETTER_BLOCKS.some((key) => !texts[key].reviewedAt),
      controller: inline(controller.name, controller.address, controller.representedBy && (de ? `vertreten durch ${controller.representedBy}` : `represented by ${controller.representedBy}`)),
      dataProtectionOfficer: inline(dpo.name, dpo.address, dpo.email, dpo.phone),
      authority: inline(authority.name, authority.address, authority.website),
      introduction: filled('accessReportIntro'),
      rights: filled('rights'),
      automatedDecision: filled('automatedDecisions'),
      thirdCountry: filled('thirdCountry'),
      closing: de ? 'Mit freundlichen Grüßen' : 'Kind regards',
    };
  }
}
