import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { AuditReferenceRegistry, DeadlineRegistry, defineModule, ExportRegistry, HistoryAccessRegistry, ListRegistry, PersonDataRegistry, RetentionRegistry } from '@forga/core-api';
import { COMPENSATION_MANIFEST, COMPENSATION_SETTINGS, COMPENSATION_STATUTE } from '@forga/compensation-contracts';
import { CATALOG_REFERENCES, type CatalogReferences } from '@forga/masterdata-contracts';
import { COMPENSATION_MIGRATIONS } from '../migrations/index.js';
import { registerAuditReferences } from './audit/audit.references.js';
import { FunctionHolderEntity, ItemEntity, RunEntity } from './compensation.entities.js';
import { CompensationData } from './data/compensation.data.js';
import { CompensationRetention } from './data/compensation.retention.js';
import { FunctionsController } from './functions/functions.controller.js';
import { FunctionsService } from './functions/functions.service.js';
import { ItemsController } from './items/items.controller.js';
import { ItemsService } from './items/items.service.js';
import { CompensationLists } from './lists/compensation.lists.js';
import { YearTotals } from './lists/year-totals.js';
import { PreviewController } from './preview/preview.controller.js';
import { RunsController } from './runs/runs.controller.js';
import { RunsService } from './runs/runs.service.js';

/** Global, so the incidents module can use the statute parameters (`COMPENSATION_STATUTE`). */
@Global()
@Module({
  controllers: [ItemsController, RunsController, FunctionsController, PreviewController],
  providers: [ItemsService, RunsService, FunctionsService, YearTotals, CompensationLists, CompensationData, CompensationRetention, { provide: COMPENSATION_STATUTE, useExisting: ItemsService }],
  exports: [COMPENSATION_STATUTE],
})
export class CompensationModule implements OnModuleInit {
  constructor(
    private readonly lists: ListRegistry,
    private readonly moduleLists: CompensationLists,
    private readonly deadlines: DeadlineRegistry,
    private readonly exports: ExportRegistry,
    private readonly data: CompensationData,
    private readonly historyAccess: HistoryAccessRegistry,
    private readonly items: ItemsService,
    @Inject(CATALOG_REFERENCES) private readonly catalogReferences: CatalogReferences,
    private readonly auditReferences: AuditReferenceRegistry,
    private readonly em: EntityManager,
    private readonly retention: RetentionRegistry,
    private readonly retentionCategory: CompensationRetention,
    private readonly personData: PersonDataRegistry,
  ) {}

  onModuleInit(): void {
    registerAuditReferences(this.auditReferences, this.em);
    for (const definition of this.moduleLists.definitions()) this.lists.register('compensation', definition);
    this.deadlines.register(this.data);
    this.exports.register('compensation', {
      all: () => this.data.exportAll(),
      person: (id) => this.data.exportPerson(id),
      describePerson: (id, ctx) => this.data.describePerson(id, ctx),
    });
    this.retentionCategory.register(this.retention);
    this.personData.register('compensation', { anonymize: (ids) => this.retentionCategory.anonymize(ids) });
    // Function allowances paid to the holders of an office (settings) refer to the office catalog.
    this.catalogReferences.register('compensation', async (kind, key) =>
      kind === 'office' ? (await this.items.config()).functionAllowances.filter((a) => a.office === key).length : 0,
    );
    for (const entity of ['compensation.run', 'compensation.item', 'compensation.function_holder']) this.historyAccess.registerPermission(entity, 'compensation.runs');
  }
}

export const compensationModule = defineModule({
  manifest: COMPENSATION_MANIFEST,
  nestModule: CompensationModule,
  entities: [RunEntity, ItemEntity, FunctionHolderEntity],
  historized: [RunEntity, ItemEntity, FunctionHolderEntity],
  migrations: COMPENSATION_MIGRATIONS,
  settings: COMPENSATION_SETTINGS,
});
