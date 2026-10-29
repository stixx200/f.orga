import { Module, type OnModuleInit } from '@nestjs/common';
import { AuditReferenceRegistry, DeadlineRegistry, defineModule, ExportRegistry, HistoryAccessRegistry, ImportRegistry, ListRegistry, RetentionRegistry, SearchRegistry } from '@forga/core-api';
import { COST_RECOVERY_MANIFEST, COST_RECOVERY_SETTINGS } from '@forga/cost-recovery-contracts';
import { EntityManager, wrap } from '@mikro-orm/core';
import { COST_RECOVERY_MIGRATIONS } from '../migrations/index.js';
import { registerAuditReferences } from './audit/audit.references.js';
import { AddressBookEntity, IncidentOffenseEntity, NoticeEntity } from './cost-recovery.entities.js';
import { PaymentsImport } from './imports/payments.import.js';
import { CostRecoveryLists } from './lists/cost-recovery.lists.js';
import { TreasuryHandover } from './notices/handover.js';
import { NoticesController } from './notices/notices.controller.js';
import { NoticesService } from './notices/notices.service.js';
import { NoticesRetention } from './notices/notices.retention.js';
import { OverdueNotices } from './notices/overdue.deadlines.js';

@Module({
  controllers: [NoticesController],
  providers: [NoticesService, NoticesRetention, TreasuryHandover, OverdueNotices, CostRecoveryLists, PaymentsImport],
})
export class CostRecoveryModule implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly lists: ListRegistry,
    private readonly moduleLists: CostRecoveryLists,
    private readonly exports: ExportRegistry,
    private readonly historyAccess: HistoryAccessRegistry,
    private readonly imports: ImportRegistry,
    private readonly payments: PaymentsImport,
    private readonly search: SearchRegistry,
    private readonly notices: NoticesService,
    private readonly deadlines: DeadlineRegistry,
    private readonly overdue: OverdueNotices,
    private readonly auditReferences: AuditReferenceRegistry,
    private readonly retention: RetentionRegistry,
    private readonly noticesRetention: NoticesRetention,
  ) {}

  onModuleInit(): void {
    registerAuditReferences(this.auditReferences, this.em);
    for (const definition of this.moduleLists.definitions()) this.lists.register('cost-recovery', definition);
    this.historyAccess.registerPermission('cost_recovery.notice', 'cost-recovery.read');
    this.imports.register('cost-recovery', this.payments.profile());
    this.historyAccess.registerPermission('cost_recovery.address_book', 'cost-recovery.write');
    this.historyAccess.registerPermission('cost_recovery.incident_offense', 'cost-recovery.read');
    this.search.register('cost-recovery', (user, query) => this.notices.search(user, query));
    this.deadlines.register(this.overdue);
    this.noticesRetention.register(this.retention);
    this.exports.register('cost-recovery', {
      all: async () => {
        const em = this.em.fork();
        return {
          notices: (await em.find(NoticeEntity, {})).map((n) => wrap(n).toObject()),
          addressBook: (await em.find(AddressBookEntity, {})).map((n) => wrap(n).toObject()),
        };
      },
    });
  }
}

export const costRecoveryModule = defineModule({
  manifest: COST_RECOVERY_MANIFEST,
  nestModule: CostRecoveryModule,
  entities: [NoticeEntity, AddressBookEntity, IncidentOffenseEntity],
  historized: [NoticeEntity, AddressBookEntity, IncidentOffenseEntity],
  migrations: COST_RECOVERY_MIGRATIONS,
  settings: COST_RECOVERY_SETTINGS,
});
