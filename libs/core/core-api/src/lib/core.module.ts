import { type DynamicModule, type MiddlewareConsumer, Module, type NestModule, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD, DiscoveryModule } from '@nestjs/core';
import { Migrator } from '@mikro-orm/migrations';
import { CONSENTS, CONSENTS_PERMISSION, PRIVACY_PERMISSION, RETENTION_PERMISSION } from '@forga/core-contracts';
import { CORE_MIGRATIONS } from '../migrations/index.js';
import { AccessReportsController, MyAccessReportsController } from './access-report/access-report.controller.js';
import { AccessReportService } from './access-report/access-report.service.js';
import { AccessReportTexts } from './access-report/access-report.texts.js';
import { CoreDescription } from './access-report/core-description.js';
import { PrivacyDocument } from './access-report/privacy-document.entity.js';
import { Audit, AuditController, AuditEntry } from './audit/audit.js';
import { AuditReferenceRegistry } from './audit/audit-references.js';
import { CoreAuditReferences } from './audit/core-references.js';
import { DomainEvents } from './events/domain-events.js';
import { PrivacyBreachEntity, PrivacyNoticeEntity, PrivacyRequestEntity } from './privacy/privacy.entities.js';
import { BreachTools, BreachToolsController, LockdownRegistry, ProtocolRegistry } from './privacy/breach-tools.js';
import { ProcessorRegistry } from './privacy/processors.js';
import { RateLimitEntity, RateLimits } from './security/rate-limits.js';
import { MySessionsController } from './security/sessions.controller.js';
import { PrivacyBreaches, PrivacyBreachesController } from './privacy/breaches.js';
import { PrivacyRegister, PrivacyRegisterController } from './privacy/register.js';
import { RetentionTexts } from './privacy/retention-texts.js';
import { CoreMeasures, TechnicalMeasureRegistry } from './privacy/technical-measures.js';
import { PrivacyNoticeController, PrivacyNoticeService } from './privacy/privacy-notice.js';
import { PrivacyAssignees, PrivacyRequests, PrivacyRequestsController } from './privacy/privacy-requests.js';
import { PrivacyTextsController } from './privacy/privacy-texts.js';
import { AccessLog, AccessLogController, AccessLogEntity } from './privacy/access-log.js';
import { ConsentEntity, ConsentsController, ConsentService } from './privacy/consents.js';
import { Rectifications, RectificationsController } from './privacy/rectifications.js';
import { Impersonations, ImpersonationsController } from './security/impersonations.js';
import { CORE_HISTORIZED, HistoryAccessRegistry } from './history/history-access.js';
import { HistoryController } from './history/history.controller.js';
import { ImportRegistry } from './imports/import-registry.js';
import { ImportService, ImportsController, ImportUploadEntity, ImportUrlEntity } from './imports/imports.js';
import { ImportMappingEntity, ImportMappings } from './imports/import-mappings.js';
import { ListRegistry } from './lists/list-registry.js';
import { ListsController } from './lists/lists.controller.js';
import { DeadlineRegistry } from './tasks/deadline-registry.js';
import { DigestService } from './tasks/digest.service.js';
import { MailService } from './tasks/mail.service.js';
import { Notifications } from './tasks/notifications.js';
import { CoreExport } from './data/core-export.js';
import { CodeRegistry, DataController, ExportRegistry, PersonDataRegistry, SearchRegistry } from './data/data.js';
import { CoreRetentionCategories } from './retention/core-categories.js';
import { RetentionCaseEntity } from './retention/retention-case.entity.js';
import { RetentionController } from './retention/retention.controller.js';
import { RetentionExport } from './retention/retention-export.js';
import { RetentionRegistry } from './retention/retention-registry.js';
import { RetentionService } from './retention/retention.service.js';
import { EmailConfirmationController, PasswordReset, PasswordResetController, PasswordResetService } from './security/password-reset.js';
import { AttachmentEntity, Attachments, AttachmentsController } from './attachments/attachments.js';
import { BrigadeAsset, BrigadeAssetsController } from './settings/assets.js';
import { TasksController } from './tasks/tasks.controller.js';
import { HistoryEntry } from './history/history.entity.js';
import { HistorySubscriber } from './history/history.subscriber.js';
import { type EntityDefinition, type ForgaModule, sortModules } from './module/forga-module.js';
import { ModuleGateMiddleware, ModulesController, ModuleState, ModuleStateService } from './module/modules.js';
import { FORGA_CORE_OPTIONS, type ForgaCoreOptions } from './options.js';
import { AuthController } from './security/auth.controller.js';
import { OidcController, OidcService } from './security/oidc.js';
import { PluginsController } from './plugins/plugins.controller.js';
import { AuthGuard } from './security/auth.guard.js';
import { CookiePolicy } from './security/cookie-policy.js';
import { SecurityStatusController } from './security/security-status.js';
import { assertStage } from './stage.js';
import { AuthService } from './security/auth.service.js';
import { OrganizationDirectory } from './security/organization-directory.js';
import { PermissionRegistry } from './security/permission-registry.js';
import { RoleTemplates } from './security/role-templates.js';
import { RolesController } from './security/roles.controller.js';
import { MfaController, MfaService } from './security/mfa.js';
import { StepUpCheck } from './security/step-up-check.js';
import { ApiToken, Role, RoleAssignment, Session, User, UserMfa } from './security/security.entities.js';
import { TokenDeadlines, TokensController } from './security/tokens.controller.js';
import { UsersController } from './security/users.controller.js';
import { OnboardingController } from './settings/onboarding.js';
import { Setting, SettingsController, SettingsService } from './settings/settings.js';
import { userContextMiddleware } from './user-context.js';

/** Entities of the core itself. */
export const CORE_ENTITIES: EntityDefinition[] = [
  ModuleState,
  HistoryEntry,
  AuditEntry,
  Setting,
  User,
  Role,
  RoleAssignment,
  Session,
  ApiToken,
  UserMfa,
  ImportUploadEntity,
  ImportUrlEntity,
  ImportMappingEntity,
  PasswordReset,
  BrigadeAsset,
  AttachmentEntity,
  RetentionCaseEntity,
  PrivacyDocument,
  PrivacyRequestEntity,
  PrivacyNoticeEntity,
  PrivacyBreachEntity,
  ConsentEntity,
  AccessLogEntity,
  RateLimitEntity,
];

function className(entity: EntityDefinition): string {
  return 'meta' in entity ? entity.meta.className : entity.name;
}

/**
 * Everything MikroORM needs for core and modules.
 * Migrations run in load order: core first, then each module after its requirements.
 */
export function ormParts(modules: ForgaModule[]) {
  const sorted = sortModules(modules);
  const historized = new Map(
    [...CORE_HISTORIZED, ...sorted.flatMap((m) => m.historized)].map((h) =>
      'entity' in h ? [className(h.entity), h.parent] : [className(h), null],
    ),
  );
  return {
    entities: [...CORE_ENTITIES, ...sorted.flatMap((m) => m.entities)],
    subscribers: [new HistorySubscriber(historized)],
    extensions: [Migrator],
    migrations: {
      tableName: 'forga_migrations',
      migrationsList: [...CORE_MIGRATIONS, ...sorted.flatMap((m) => m.migrations)],
      snapshot: false,
      silent: true,
    },
  };
}

@Module({})
export class ForgaCoreModule implements NestModule, OnModuleInit {
  constructor(
    private readonly historyAccess: HistoryAccessRegistry,
    private readonly exports: ExportRegistry,
    private readonly coreExport: CoreExport,
    private readonly coreDescription: CoreDescription,
    private readonly personData: PersonDataRegistry,
    private readonly imports: ImportRegistry,
    private readonly settings: SettingsService,
    private readonly consents: ConsentService,
  ) {}

  onModuleInit(): void {
    assertStage();
    this.exports.register('core', {
      all: (user) => this.coreExport.all(user),
      person: (id) => this.coreExport.person(id),
      describePerson: (id, ctx) => this.coreDescription.describePerson(id, ctx),
    });
    this.personData.register('core', { anonymize: (ids) => this.coreExport.anonymize(ids) });
    this.historyAccess.registerPermission('core.user', 'core.users.manage');
    this.historyAccess.registerPermission('core.role', 'core.roles.manage');
    this.historyAccess.registerPermission('core.retention_case', RETENTION_PERMISSION);
    // Remembered mappings of the table import: for users of any import profile.
    this.historyAccess.register('core.import_mapping', async (user) => ({ allowed: this.imports.available(user).length > 0 }));
    // Settings of a module: also for the managers of that module's settings; data protection sections for
    // `core.privacy.manage`.
    this.historyAccess.register('core.setting', async (user, section) => {
      const managers = (() => {
        try {
          return this.settings.managerPermissions(section);
        } catch {
          return ['core.settings.manage'];
        }
      })();
      return { allowed: user.can('core.settings.manage') || managers.some((permission) => user.can(permission)) };
    });
    this.historyAccess.registerPermission('core.privacy_request', PRIVACY_PERMISSION);
    this.historyAccess.registerPermission('core.privacy_notice', PRIVACY_PERMISSION);
    this.historyAccess.registerPermission('core.privacy_breach', PRIVACY_PERMISSION);
    // Consents: data protection, or recording consents for a department of the person.
    this.historyAccess.register('core.consent', async (user, id) => {
      const consent = await this.consents.find(id);
      return { allowed: consent !== null && (user.can(PRIVACY_PERMISSION) || (user.grant(CONSENTS_PERMISSION) !== null && (await this.consents.mayRecord(user, consent.personId)))) };
    });
  }

  static forRoot(options: ForgaCoreOptions): DynamicModule {
    const modules = sortModules(options.modules);
    return {
      module: ForgaCoreModule,
      global: true,
      imports: [DiscoveryModule, ...modules.flatMap((m) => (m.nestModule ? [m.nestModule] : []))],
      controllers: [
        AuthController,
        MfaController,
        UsersController,
        RolesController,
        TokensController,
        SettingsController,
        ModulesController,
        HistoryController,
        AuditController,
        ListsController,
        TasksController,
        ImportsController,
        PasswordResetController,
        EmailConfirmationController,
        BrigadeAssetsController,
        AttachmentsController,
        DataController,
        RetentionController,
        OidcController,
        PluginsController,
        OnboardingController,
        SecurityStatusController,
        AccessReportsController,
        MyAccessReportsController,
        PrivacyNoticeController,
        PrivacyTextsController,
        PrivacyRequestsController,
        PrivacyRegisterController,
        PrivacyBreachesController,
        BreachToolsController,
        ConsentsController,
        RectificationsController,
        AccessLogController,
        ImpersonationsController,
        MySessionsController,
      ],
      providers: [
        { provide: FORGA_CORE_OPTIONS, useValue: { ...options, modules } },
        { provide: APP_GUARD, useClass: AuthGuard },
        AuthService,
        CookiePolicy,
        MfaService,
        StepUpCheck,
        OidcService,
        OrganizationDirectory,
        PermissionRegistry,
        RoleTemplates,
        SettingsService,
        ModuleStateService,
        ModuleGateMiddleware,
        Audit,
        AuditReferenceRegistry,
        CoreAuditReferences,
        DomainEvents,
        HistoryAccessRegistry,
        ListRegistry,
        DeadlineRegistry,
        MailService,
        Notifications,
        Attachments,
        DigestService,
        ImportRegistry,
        ImportService,
        ImportMappings,
        PasswordResetService,
        SearchRegistry,
        CodeRegistry,
        ExportRegistry,
        RetentionRegistry,
        PersonDataRegistry,
        RetentionService,
        RetentionExport,
        CoreRetentionCategories,
        CoreExport,
        CoreDescription,
        AccessReportTexts,
        AccessReportService,
        PrivacyNoticeService,
        PrivacyRequests,
        PrivacyAssignees,
        RetentionTexts,
        TechnicalMeasureRegistry,
        CoreMeasures,
        PrivacyRegister,
        PrivacyBreaches,
        ProtocolRegistry,
        BreachTools,
        ConsentService,
        { provide: CONSENTS, useExisting: ConsentService },
        Rectifications,
        AccessLog,
        Impersonations,
        RateLimits,
        TokenDeadlines,
        LockdownRegistry,
        ProcessorRegistry,
      ],
      exports: [
        RateLimits,
        LockdownRegistry,
        ProcessorRegistry,
        TechnicalMeasureRegistry,
        ProtocolRegistry,
        PrivacyRegister,
        AccessLog,
        ConsentService,
        CONSENTS,
        PrivacyNoticeService,
        PrivacyRequests,
        FORGA_CORE_OPTIONS,
        CookiePolicy,
        ModuleStateService,
        Audit,
        AuditReferenceRegistry,
        SettingsService,
        PermissionRegistry,
        OrganizationDirectory,
        DomainEvents,
        HistoryAccessRegistry,
        ListRegistry,
        DeadlineRegistry,
        MailService,
        Notifications,
        Attachments,
        DigestService,
        ImportRegistry,
        ImportService,
        SearchRegistry,
        CodeRegistry,
        ExportRegistry,
        RetentionRegistry,
        PersonDataRegistry,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(userContextMiddleware, ModuleGateMiddleware).forRoutes('{*path}');
  }
}
