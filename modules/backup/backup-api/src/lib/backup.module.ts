import { type MiddlewareConsumer, Module, type NestModule, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { AuditReferenceRegistry, defineModule, DeadlineRegistry, ProcessorRegistry, TechnicalMeasureRegistry } from '@forga/core-api';
import { BACKUP_MANIFEST, BACKUP_SETTINGS_SECTION } from '@forga/backup-contracts';
import { BACKUP_MIGRATIONS } from '../migrations/index.js';
import { registerAuditReferences } from './audit/audit.references.js';
import { BackupController } from './backup.controller.js';
import { BackupRestore, BackupRun } from './backup.entities.js';
import { BackupsService } from './backups/backups.service.js';
import { BackupOverviewService } from './backups/overview.service.js';
import { BackupScheduler } from './backups/scheduler.js';
import { Maintenance, MaintenanceMiddleware } from './restore/maintenance.js';
import { RestoreService } from './restore/restore.service.js';
import { PgTools } from './runtime/pg-tools.js';
import { BackupSettingsService } from './settings/backup-settings.service.js';
import { backupEnvironment } from './runtime/environment.js';

@Module({
  controllers: [BackupController],
  providers: [PgTools, BackupSettingsService, BackupsService, RestoreService, Maintenance, MaintenanceMiddleware, BackupScheduler, BackupOverviewService],
})
export class BackupModule implements NestModule, OnModuleInit {
  constructor(
    private readonly deadlines: DeadlineRegistry,
    private readonly overview: BackupOverviewService,
    private readonly auditReferences: AuditReferenceRegistry,
    private readonly em: EntityManager,
    private readonly measures: TechnicalMeasureRegistry,
    private readonly processors: ProcessorRegistry,
    private readonly backupSettings: BackupSettingsService,
  ) {}

  onModuleInit(): void {
    this.deadlines.register({ module: 'backup', deadlines: (asOf) => this.overview.deadlines(asOf) });
    // Register of processing activities: backup set up and encrypted.
    this.measures.register({ module: 'backup', measures: () => this.overview.measures() });
    // Register of processing activities: the backup target is a technical recipient (e.g. an NAS of a service provider).
    this.processors.register({
      module: 'backup',
      processors: async () => {
        const loaded = await this.backupSettings.load();
        const root = backupEnvironment.root();
        if (!loaded.saved || !root) return [];
        const target = `${root.replace(/\/$/, '')}/${loaded.settings.targetPath}`;
        const encrypted = loaded.settings.encryption;
        return [
          {
            id: 'processor:backup',
            name: {
              de: `Sicherungsziel ${target} (${encrypted ? 'verschlüsselt' : 'unverschlüsselt'}; Datenträger bzw. NAS, ggf. Dienstleister)`,
              en: `Backup target ${target} (${encrypted ? 'encrypted' : 'unencrypted'}; disk or NAS, possibly a service provider)`,
            },
            note: '',
            source: 'processor' as const,
          },
        ];
      },
    });
    registerAuditReferences(this.auditReferences, this.em);
  }

  /** Maintenance mode during a restore: every API request except the status of the restore gets 503. */
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MaintenanceMiddleware).forRoutes('{*path}');
  }
}

export const backupModule = defineModule({
  manifest: BACKUP_MANIFEST,
  nestModule: BackupModule,
  entities: [BackupRun, BackupRestore],
  // Records of backups and restores are a protocol and not historized; changes of the settings are (core.setting).
  historized: [],
  migrations: BACKUP_MIGRATIONS,
  // The section is not registered as module settings: the backup is optional and does not appear as open in the
  // setup list; it is read and written only through /api/backup/settings.
  settingsAccess: { [BACKUP_SETTINGS_SECTION]: { managersOnly: true } },
});
