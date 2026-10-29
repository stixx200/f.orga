import { type DynamicModule, type MiddlewareConsumer, Module, type NestModule, type OnModuleInit } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Migrator } from '@mikro-orm/migrations';
import { CORE_MIGRATIONS } from '../migrations/index.js';
import { Audit, AuditController, AuditEntry } from './audit/audit.js';
import { AuditReferenceRegistry } from './audit/audit-references.js';
import { CoreAuditReferences } from './audit/core-references.js';
import { DomainEvents } from './events/domain-events.js';
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
import { CodeRegistry, DataController, ExportRegistry, PersonDataRegistry, RetentionRegistry, RetentionService, SearchRegistry } from './data/data.js';
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
import { AuthService } from './security/auth.service.js';
import { OrganizationDirectory } from './security/organization-directory.js';
import { PermissionRegistry } from './security/permission-registry.js';
import { RoleTemplates } from './security/role-templates.js';
import { RolesController } from './security/roles.controller.js';
import { ApiToken, Role, RoleAssignment, Session, User } from './security/security.entities.js';
import { TokensController } from './security/tokens.controller.js';
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
  ImportUploadEntity,
  ImportUrlEntity,
  ImportMappingEntity,
  PasswordReset,
  BrigadeAsset,
  AttachmentEntity,
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
    private readonly personData: PersonDataRegistry,
    private readonly imports: ImportRegistry,
  ) {}

  onModuleInit(): void {
    this.exports.register('core', { all: (user) => this.coreExport.all(user), person: (id) => this.coreExport.person(id) });
    this.personData.register('core', { anonymize: (ids) => this.coreExport.anonymize(ids) });
    this.historyAccess.registerPermission('core.user', 'core.users.manage');
    this.historyAccess.registerPermission('core.role', 'core.roles.manage');
    // Remembered mappings of the table import: for users of any import profile.
    this.historyAccess.register('core.import_mapping', async (user) => ({ allowed: this.imports.available(user).length > 0 }));
    // Settings of a module: also for the managers of that module's settings.
    this.historyAccess.register('core.setting', async (user, section) => {
      const module = section.includes('.') ? section.slice(0, section.indexOf('.')) : null;
      return { allowed: user.can('core.settings.manage') || (module !== null && module !== 'core' && user.can(`${module}.settings.manage`)) };
    });
  }

  static forRoot(options: ForgaCoreOptions): DynamicModule {
    const modules = sortModules(options.modules);
    return {
      module: ForgaCoreModule,
      global: true,
      imports: modules.flatMap((m) => (m.nestModule ? [m.nestModule] : [])),
      controllers: [
        AuthController,
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
        OidcController,
        PluginsController,
        OnboardingController,
      ],
      providers: [
        { provide: FORGA_CORE_OPTIONS, useValue: { ...options, modules } },
        { provide: APP_GUARD, useClass: AuthGuard },
        AuthService,
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
        CoreExport,
      ],
      exports: [
        FORGA_CORE_OPTIONS,
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
