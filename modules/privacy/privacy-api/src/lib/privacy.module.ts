import { Module, type OnModuleInit } from '@nestjs/common';
import {
  Consents,
  DeadlineRegistry,
  defineModule,
  ExportRegistry,
  HistoryAccessRegistry,
  OnboardingRegistry,
  PersonDataRegistry,
  RetentionTexts,
  SettingsService,
  TechnicalMeasureRegistry,
} from '@forga/core-api';
import {
  ACCESS_LOG_RETENTION,
  ACCESS_REPORT_DAYS,
  CONSENTS_PERMISSION,
  PRIVACY_MANIFEST,
  PRIVACY_PERMISSION,
  PRIVACY_SETTINGS,
  PRIVACY_SETTINGS_ACCESS,
  PRIVACY_TEXT_KEYS,
  PrivacyContacts,
  PrivacyTexts,
} from '@forga/privacy-contracts';
import { PRIVACY_MIGRATIONS } from '../migrations/index.js';
import { AccessLogController, AccessLogEntity, AccessLogStore } from './access-log.js';
import { AccessReportsController, MyAccessReportsController } from './access-report/access-report.controller.js';
import { AccessReportService } from './access-report/access-report.service.js';
import { AccessReportTexts } from './access-report/access-report.texts.js';
import { PrivacyDocument } from './access-report/privacy-document.entity.js';
import { BreachTools, BreachToolsController } from './breach-tools.js';
import { PrivacyBreaches, PrivacyBreachesController } from './breaches.js';
import { ConsentEntity, ConsentsController, ConsentService } from './consents.js';
import { ErasureController, ErasureService } from './erasure.js';
import { HistoryRedactionController } from './history-redaction.js';
import {
  NoticeAcknowledgementEntity,
  PersonPrivacyController,
  PersonPrivacyService,
  PrivacyInformationEntity,
  ProcessingRestrictionEntity,
  RestrictionDeadlines,
} from './person-privacy.js';
import { PrivacyData } from './privacy.data.js';
import { PrivacyBreachEntity, PrivacyNoticeEntity, PrivacyRequestEntity } from './privacy.entities.js';
import { PrivacyNoticeController, PrivacyNoticeService } from './privacy-notice.js';
import { PrivacyAssignees, PrivacyRequests, PrivacyRequestsController } from './privacy-requests.js';
import { PrivacyRetentionCategories } from './privacy-retention.js';
import { PrivacyTextsController } from './privacy-texts.js';
import { Rectifications, RectificationsController } from './rectifications.js';
import { PrivacyRegister, PrivacyRegisterController } from './register.js';
import { ThirdPartiesController } from './third-parties.js';

@Module({
  controllers: [
    PrivacyNoticeController,
    PrivacyTextsController,
    PrivacyRequestsController,
    ErasureController,
    PersonPrivacyController,
    PrivacyRegisterController,
    PrivacyBreachesController,
    BreachToolsController,
    ConsentsController,
    RectificationsController,
    AccessLogController,
    AccessReportsController,
    MyAccessReportsController,
    ThirdPartiesController,
    HistoryRedactionController,
  ],
  providers: [
    PrivacyNoticeService,
    PrivacyRequests,
    PrivacyAssignees,
    ErasureService,
    PersonPrivacyService,
    RestrictionDeadlines,
    PrivacyRegister,
    PrivacyBreaches,
    BreachTools,
    ConsentService,
    Rectifications,
    AccessLogStore,
    AccessReportTexts,
    AccessReportService,
    PrivacyRetentionCategories,
    PrivacyData,
  ],
})
export class PrivacyModule implements OnModuleInit {
  constructor(
    private readonly exports: ExportRegistry,
    private readonly personData: PersonDataRegistry,
    private readonly data: PrivacyData,
    private readonly consentHook: Consents,
    private readonly consents: ConsentService,
    private readonly deadlines: DeadlineRegistry,
    private readonly restrictionDeadlines: RestrictionDeadlines,
    private readonly historyAccess: HistoryAccessRegistry,
    private readonly measures: TechnicalMeasureRegistry,
    private readonly retention: RetentionTexts,
    private readonly onboarding: OnboardingRegistry,
    private readonly settings: SettingsService,
  ) {}

  onModuleInit(): void {
    this.exports.register('privacy', {
      all: () => this.data.all(),
      person: (id) => this.data.person(id),
      describePerson: (id, ctx) => this.data.describePerson(id, ctx),
    });
    this.personData.register('privacy', this.data);
    // Effects of consents for the modules (`CONSENTS`), e.g. the phone list of the master data.
    this.consentHook.register({ module: 'privacy', has: (personId, key) => this.consents.has(personId, key), withEffect: (effect, ids) => this.consents.withEffect(effect, ids) });
    this.deadlines.register(this.restrictionDeadlines);
    this.historyAccess.registerPermission('privacy.request', PRIVACY_PERMISSION);
    this.historyAccess.registerPermission('privacy.notice', PRIVACY_PERMISSION);
    this.historyAccess.registerPermission('privacy.breach', PRIVACY_PERMISSION);
    this.historyAccess.registerPermission('privacy.restriction', PRIVACY_PERMISSION);
    this.historyAccess.registerPermission('privacy.information', PRIVACY_PERMISSION);
    // Consents: data protection, or recording consents for a department of the person.
    this.historyAccess.register('privacy.consent', async (user, id) => {
      const consent = await this.consents.find(id);
      return { allowed: consent !== null && (user.can(PRIVACY_PERMISSION) || (user.grant(CONSENTS_PERMISSION) !== null && (await this.consents.mayRecord(user, consent.personId)))) };
    });
    // Register of processing activities: read log and stored access reports.
    this.measures.register({
      module: 'privacy',
      measures: async () => {
        const retention = await this.retention.localized();
        return [
          {
            key: 'privacy.access-log',
            title: { de: 'Leseprotokoll', en: 'Read log' },
            value: {
              de: `Lesezugriffe auf Gesundheits- und andere besonders geschützte Daten je Benutzer, Person und Tag, ohne Inhalt; ${retention([ACCESS_LOG_RETENTION]).de}; betroffene Benutzer sehen „Anmeldungen als Sie“`,
              en: `Read accesses to health and other especially protected data per user, person and day, without content; ${retention([ACCESS_LOG_RETENTION]).en}; users see "logins as you"`,
            },
            tone: 'ok',
          },
          {
            key: 'privacy.access-reports',
            title: { de: 'Auskünfte', en: 'Access reports' },
            value: {
              de: `verschlüsselt abgelegt (AES-256-GCM, FORGA_SECRET_KEY), nach ${ACCESS_REPORT_DAYS} Tagen gelöscht`,
              en: `stored encrypted (AES-256-GCM, FORGA_SECRET_KEY), deleted after ${ACCESS_REPORT_DAYS} days`,
            },
            tone: 'info',
          },
        ];
      },
    });
    // Setup list: contacts of controller and DPO, and the text blocks reviewed with the DPO (templates otherwise).
    this.onboarding.register({
      module: 'privacy',
      items: async () => {
        const contacts = PrivacyContacts.parse((await this.settings.get('privacy.contacts')) ?? {});
        const texts = PrivacyTexts.parse((await this.settings.get('privacy.texts')) ?? {});
        return [
          {
            key: 'privacyContacts',
            done: Boolean(contacts.controller.name && contacts.dpo.name),
            to: '/privacy/settings?tab=contacts',
            label: { de: 'Datenschutz: Verantwortlichen und Datenschutzbeauftragten eintragen', en: 'Data protection: enter controller and data protection officer' },
          },
          {
            key: 'privacyTexts',
            done: PRIVACY_TEXT_KEYS.every((key) => texts[key].reviewedAt),
            to: '/privacy/settings?tab=texts',
            label: { de: 'Datenschutztexte prüfen (Vorlagen mit dem Datenschutzbeauftragten der Gemeinde abstimmen)', en: 'Review the data protection texts (agree the templates with the data protection officer of the municipality)' },
          },
        ];
      },
    });
  }
}

export const privacyModule = defineModule({
  manifest: PRIVACY_MANIFEST,
  nestModule: PrivacyModule,
  entities: [
    PrivacyRequestEntity,
    PrivacyNoticeEntity,
    PrivacyBreachEntity,
    ConsentEntity,
    AccessLogEntity,
    PrivacyDocument,
    ProcessingRestrictionEntity,
    PrivacyInformationEntity,
    NoticeAcknowledgementEntity,
  ],
  // The read log, the access reports and the acknowledgements are protocols and not historized.
  historized: [PrivacyRequestEntity, PrivacyNoticeEntity, PrivacyBreachEntity, ConsentEntity, ProcessingRestrictionEntity, PrivacyInformationEntity],
  migrations: PRIVACY_MIGRATIONS,
  settings: PRIVACY_SETTINGS,
  settingsAccess: PRIVACY_SETTINGS_ACCESS,
});
