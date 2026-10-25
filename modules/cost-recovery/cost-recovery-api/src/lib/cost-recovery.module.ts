import { Module, type OnModuleInit } from '@nestjs/common';
import { defineModule, ExportRegistry, HistoryAccessRegistry, ImportRegistry, ListRegistry } from '@forga/core-api';
import { COST_RECOVERY_MANIFEST, COST_RECOVERY_SETTINGS } from '@forga/cost-recovery-contracts';
import { EntityManager, wrap } from '@mikro-orm/core';
import { COST_RECOVERY_MIGRATIONS } from '../migrations/index.js';
import { AddressBookEntity, IncidentOffenseEntity, NoticeEntity } from './cost-recovery.entities.js';
import { PaymentsImport } from './imports/payments.import.js';
import { CostRecoveryLists } from './lists/cost-recovery.lists.js';
import { NoticesController } from './notices/notices.controller.js';
import { NoticesService } from './notices/notices.service.js';

@Module({
  controllers: [NoticesController],
  providers: [NoticesService, CostRecoveryLists, PaymentsImport],
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
  ) {}

  onModuleInit(): void {
    for (const definition of this.moduleLists.definitions()) this.lists.register('cost-recovery', definition);
    this.historyAccess.registerPermission('cost_recovery.notice', 'cost-recovery.read');
    this.imports.register('cost-recovery', this.payments.profile());
    this.historyAccess.registerPermission('cost_recovery.address_book', 'cost-recovery.write');
    this.historyAccess.registerPermission('cost_recovery.incident_offense', 'cost-recovery.read');
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
