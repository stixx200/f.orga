import { Body, ConflictException, Controller, ForbiddenException, Get, HttpCode, Injectable, Logger, NotFoundException, type OnModuleInit, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/core';
import {
  type BrigadeSettings,
  fillPlaceholders,
  type FirstLoginNotice,
  type Language,
  NoticeAcknowledgement,
  PRIVACY_NOTICE_BLOCKS,
  PrivacyContacts,
  type PrivacyNotice,
  type PrivacyNoticeSection,
  PrivacyTexts,
  type SessionPrivacyNotice,
} from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import { renderLetterPdf } from '../lists/renderers.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser, Public } from '../security/decorators.js';
import { User } from '../security/security.entities.js';
import { brigadeLogoDataUrl } from '../settings/assets.js';
import { SettingsService } from '../settings/settings.js';
import { ZodPipe } from '../zod.pipe.js';
import { PrivacyNoticeEntity } from './privacy.entities.js';
import { formatDay, lines, pdfParagraphs } from './privacy-text.js';

/** Settings the privacy notice is composed of; a change publishes a new version. */
const NOTICE_SOURCES = ['brigade', 'privacy.contacts', 'privacy.texts'];

const languageOf = (value: string | undefined): Language => (value === 'en' ? 'en' : 'de');

const both = (make: (language: Language) => string) => ({ de: make('de'), en: make('en') });

/** The sections of the privacy notice from the brigade, the contacts and the text blocks, in both languages. */
export function composeNotice(brigadeName: string, contacts: PrivacyContacts, texts: PrivacyTexts): { sections: PrivacyNoticeSection[]; template: boolean } {
  const fill = (key: (typeof PRIVACY_NOTICE_BLOCKS)[number], language: Language) => fillPlaceholders(texts[key].text[language], { brigade: brigadeName });
  const { controller, dpo, authority } = contacts;
  const missing = { de: '[in den Einstellungen „Datenschutz → Kontakte“ eintragen]', en: '[to be entered in the settings “Data protection → Contacts”]' };
  const controllerText = (language: Language) =>
    lines(
      controller.name || missing[language],
      controller.address,
      controller.representedBy && (language === 'de' ? `vertreten durch ${controller.representedBy}` : `represented by ${controller.representedBy}`),
      brigadeName && (language === 'de' ? `für die ${brigadeName}` : `for the ${brigadeName}`),
      '',
    ) +
    '\n\n' +
    lines(
      `${language === 'de' ? 'Datenschutzbeauftragter' : 'Data protection officer'}: ${dpo.name || missing[language]}`,
      dpo.address,
      dpo.email && `${language === 'de' ? 'E-Mail' : 'E-mail'}: ${dpo.email}`,
      dpo.phone && `${language === 'de' ? 'Telefon' : 'Phone'}: ${dpo.phone}`,
    );
  const complaint = (language: Language) =>
    lines(language === 'de' ? 'Beschwerderecht bei einer Aufsichtsbehörde (Art. 77 DSGVO):' : 'Right to lodge a complaint with a supervisory authority (Art. 77 GDPR):', authority.name, authority.address, authority.website);
  const sections: PrivacyNoticeSection[] = [
    { key: 'noticeIntro', title: { de: 'Worum es geht', en: 'About this notice' }, text: both((l) => fill('noticeIntro', l)) },
    { key: 'controller', title: { de: 'Verantwortlicher und Datenschutzbeauftragter', en: 'Controller and data protection officer' }, text: both(controllerText) },
    { key: 'noticeProcessing', title: { de: 'Welche Daten wir wofür verarbeiten', en: 'Which data we process for which purpose' }, text: both((l) => fill('noticeProcessing', l)) },
    { key: 'rights', title: { de: 'Ihre Rechte', en: 'Your rights' }, text: both((l) => fill('rights', l)) },
    { key: 'complaint', title: { de: 'Beschwerde', en: 'Complaint' }, text: both(complaint) },
    { key: 'automatedDecisions', title: { de: 'Automatisierte Entscheidungen', en: 'Automated decisions' }, text: both((l) => fill('automatedDecisions', l)) },
    { key: 'thirdCountry', title: { de: 'Übermittlung in Drittländer', en: 'Transfer to third countries' }, text: both((l) => fill('thirdCountry', l)) },
  ];
  return { sections, template: PRIVACY_NOTICE_BLOCKS.some((key) => !texts[key].reviewedAt) };
}

/**
 * Versions of the privacy notice (L4): composed from the text blocks and the contacts; every change is a new version
 * with its date. Users acknowledge a version once it applies (all its blocks reviewed).
 */
@Injectable()
export class PrivacyNoticeService implements OnModuleInit {
  private readonly logger = new Logger(PrivacyNoticeService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
    private readonly audit: Audit,
  ) {}

  onModuleInit(): void {
    this.settings.onChange(NOTICE_SOURCES, async () => {
      // A failure must not undo the saved setting; the next read publishes the version.
      await this.publishIfChanged().catch((error: unknown) => this.logger.error('Publishing the privacy notice failed', error instanceof Error ? error.stack : String(error)));
    });
  }

  async texts(): Promise<PrivacyTexts> {
    return PrivacyTexts.parse((await this.settings.get('privacy.texts')) ?? {});
  }

  async contacts(): Promise<PrivacyContacts> {
    return PrivacyContacts.parse((await this.settings.get('privacy.contacts')) ?? {});
  }

  async brigadeName(): Promise<string> {
    return (await this.settings.get<BrigadeSettings>('brigade'))?.name ?? '';
  }

  private async compose() {
    return composeNotice(await this.brigadeName(), await this.contacts(), await this.texts());
  }

  private async latest(em: EntityManager): Promise<PrivacyNoticeEntity | null> {
    return (await em.find(PrivacyNoticeEntity, {}, { orderBy: { version: 'desc' }, limit: 1 }))[0] ?? null;
  }

  /** The current version; the first one is created when the notice is first needed. */
  async current(): Promise<PrivacyNoticeEntity> {
    return (await this.latest(this.em.fork())) ?? this.publishIfChanged();
  }

  /** Publishes a new version if the composed notice differs from the latest one. */
  async publishIfChanged(): Promise<PrivacyNoticeEntity> {
    const composed = await this.compose();
    for (let attempt = 0; attempt < 3; attempt++) {
      const em = this.em.fork();
      const latest = await this.latest(em);
      if (latest && latest.template === composed.template && JSON.stringify(latest.sections) === JSON.stringify(composed.sections)) return latest;
      const created = em.create(PrivacyNoticeEntity, { version: (latest?.version ?? 0) + 1, publishedAt: new Date(), ...composed });
      try {
        await em.flush();
        await this.audit.log('privacy.notice-published', { version: created.version, template: created.template });
        return created;
      } catch (error) {
        // Another request published the same version at the same time.
        if (!(error instanceof UniqueConstraintViolationException)) throw error;
      }
    }
    return (await this.latest(this.em.fork()))!;
  }

  async version(version: number): Promise<PrivacyNoticeEntity | null> {
    return this.em.fork().findOne(PrivacyNoticeEntity, { version });
  }

  async versions(): Promise<{ version: number; publishedAt: string }[]> {
    const all = await this.em.fork().find(PrivacyNoticeEntity, {}, { orderBy: { version: 'desc' }, fields: ['version', 'publishedAt'] });
    return all.map((n) => ({ version: n.version, publishedAt: n.publishedAt.toISOString() }));
  }

  /** What the session reports: the shell asks for an acknowledgement once the notice applies (all blocks reviewed). */
  async sessionState(user: AuthenticatedUser): Promise<SessionPrivacyNotice> {
    const em = this.em.fork();
    const [current, stored] = await Promise.all([this.current(), em.findOne(User, user.id, { fields: ['privacyNoticeVersion', 'technical'] })]);
    const acknowledged = stored?.privacyNoticeVersion ?? null;
    const due = !current.template && !user.impersonator && user.via === 'session' && !stored?.technical && (acknowledged ?? 0) < current.version;
    return { version: current.version, acknowledgedVersion: acknowledged, due };
  }

  async toDto(notice: PrivacyNoticeEntity): Promise<PrivacyNotice> {
    return {
      version: notice.version,
      publishedAt: notice.publishedAt.toISOString(),
      brigadeName: await this.brigadeName(),
      template: notice.template,
      sections: notice.sections,
      versions: await this.versions(),
    };
  }

  async pdf(notice: PrivacyNoticeEntity, language: Language): Promise<Buffer> {
    const em = this.em.fork();
    const title = language === 'de' ? 'Datenschutzhinweis' : 'Privacy notice';
    const version = language === 'de' ? `Fassung ${notice.version} vom ${formatDay(notice.publishedAt.toISOString(), 'de')}` : `Version ${notice.version} of ${formatDay(notice.publishedAt.toISOString(), 'en')}`;
    const content: unknown[] = [
      { text: title, style: 'title' },
      { text: version, style: 'small', margin: [0, 0, 0, 8] },
      ...(notice.template ? [{ text: language === 'de' ? 'Vorlage – noch nicht mit dem Datenschutzbeauftragten geprüft' : 'Template – not yet reviewed with the data protection officer', bold: true, color: '#6B4B00', margin: [0, 0, 0, 8] }] : []),
      ...notice.sections.flatMap((section) => [{ text: section.title[language], style: 'heading' }, ...pdfParagraphs(section.text[language])]),
    ];
    return renderLetterPdf({
      brigade: await this.settings.get<BrigadeSettings>('brigade'),
      letterhead: await brigadeLogoDataUrl(em, 'letterhead'),
      logo: await brigadeLogoDataUrl(em),
      title,
      content,
      language,
      now: new Date(),
    });
  }
}

/**
 * The privacy notice: readable without sign-in (`/privacy`, PDF for posting), the short notice at the first sign-in and
 * its acknowledgement.
 */
@Controller('core/privacy')
export class PrivacyNoticeController {
  constructor(
    private readonly notices: PrivacyNoticeService,
    private readonly em: EntityManager,
    private readonly audit: Audit,
  ) {}

  private async find(version: string | undefined): Promise<PrivacyNoticeEntity> {
    if (!version) return this.notices.current();
    const found = /^\d{1,6}$/.test(version) ? await this.notices.version(Number(version)) : null;
    if (!found) throw new NotFoundException({ code: 'privacy.noticeUnknown' });
    return found;
  }

  /** The current version (or `?version=`), with the list of all versions. */
  @Public()
  @Get('notice')
  async notice(@Query('version') version?: string): Promise<PrivacyNotice> {
    return this.notices.toDto(await this.find(version));
  }

  /** The notice as PDF for posting in the station and as an enclosure to the admission. */
  @Public()
  @Get('notice.pdf')
  async noticePdf(@Res() res: Response, @Query('language') language?: string, @Query('version') version?: string): Promise<void> {
    const notice = await this.find(version);
    const pdf = await this.notices.pdf(notice, languageOf(language));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${languageOf(language) === 'de' ? 'datenschutzhinweis' : 'privacy-notice'}-${notice.version}.pdf"`);
    res.send(pdf);
  }

  /** The short notice shown at the first sign-in and after a new version. */
  @Get('notice/first-login')
  async firstLogin(): Promise<FirstLoginNotice> {
    const [current, texts, brigade] = await Promise.all([this.notices.current(), this.notices.texts(), this.notices.brigadeName()]);
    const fill = (language: Language) => fillPlaceholders(texts.firstLogin.text[language], { brigade });
    return { version: current.version, text: { de: fill('de'), en: fill('en') } };
  }

  /** "Zur Kenntnis genommen": stored with the time at the user; no consent. Not during an impersonation. */
  @Post('notice/acknowledge')
  @HttpCode(204)
  async acknowledge(@Body(new ZodPipe(NoticeAcknowledgement)) input: NoticeAcknowledgement, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    if (user.impersonator || user.via !== 'session') throw new ForbiddenException({ code: 'privacy.acknowledgeOwnOnly' });
    const current = await this.notices.current();
    if (input.version !== current.version) throw new ConflictException({ code: 'privacy.noticeOutdated', current: current.version });
    const em = this.em.fork();
    const stored = await em.findOneOrFail(User, user.id);
    stored.privacyNoticeVersion = current.version;
    stored.privacyNoticeAcknowledgedAt = new Date();
    await em.flush();
    await this.audit.log('privacy.notice-acknowledged', { version: current.version });
  }
}
