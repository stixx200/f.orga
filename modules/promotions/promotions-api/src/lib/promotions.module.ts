import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { AuditReferenceRegistry, defineModule, ExportRegistry, HistoryAccessRegistry, ListRegistry, PersonDataRegistry } from '@forga/core-api';
import { PROMOTIONS_MANIFEST, PROMOTIONS_SETTINGS } from '@forga/promotions-contracts';
import { CATALOG_REFERENCES, type CatalogReferences } from '@forga/masterdata-contracts';
import { PROMOTIONS_MIGRATIONS } from '../migrations/index.js';
import { registerAuditReferences } from './audit/audit.references.js';
import { ruleReferences } from './catalog-usage.js';
import { PromotionsLists } from './lists/promotions.lists.js';
import { PromotionsController } from './promotions/promotions.controller.js';
import { PromotionsData } from './promotions.data.js';
import { PromotionsService } from './promotions/promotions.service.js';
import { ExclusionEntity, PromotionListEntity } from './promotions.entities.js';

@Module({
  controllers: [PromotionsController],
  providers: [PromotionsService, PromotionsLists, PromotionsData],
})
export class PromotionsModule implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly lists: ListRegistry,
    private readonly moduleLists: PromotionsLists,
    private readonly exports: ExportRegistry,
    private readonly historyAccess: HistoryAccessRegistry,
    private readonly data: PromotionsData,
    private readonly personData: PersonDataRegistry,
    private readonly promotions: PromotionsService,
    @Inject(CATALOG_REFERENCES) private readonly catalogReferences: CatalogReferences,
    private readonly auditReferences: AuditReferenceRegistry,
  ) {}

  onModuleInit(): void {
    registerAuditReferences(this.auditReferences, this.em);
    for (const definition of this.moduleLists.definitions()) this.lists.register('promotions', definition);
    this.historyAccess.registerPermission('promotions.promotion_list', 'promotions.decide');
    this.historyAccess.registerPermission('promotions.exclusion', 'promotions.exclude');
    this.exports.register('promotions', {
      all: async () => {
        const em = this.em.fork();
        return {
          lists: (await em.find(PromotionListEntity, {})).map((l) => wrap(l).toObject()),
          exclusions: (await em.find(ExclusionEntity, {})).map((e) => wrap(e).toObject()),
        };
      },
      person: (id) => this.data.exportPerson(id),
      describePerson: (id, ctx) => this.data.describePerson(id, ctx),
    });
    this.personData.register('promotions', { anonymize: (ids) => this.data.anonymize(ids) });
    // Rules (settings), promotion lists and exclusions refer to ranks; the rules also to qualifications and offices.
    // Persons in probation without a rank assignment count with the rank `probation`.
    this.catalogReferences.register('promotions', async (kind, key) => {
      const rules = ruleReferences(await this.promotions.config(), kind, key);
      if (kind !== 'rank') return rules;
      const em = this.em.fork();
      const [exclusions, lists] = await Promise.all([em.count(ExclusionEntity, { targetRank: key }), em.find(PromotionListEntity, {}, { fields: ['entries'] })]);
      const entries = lists.reduce((sum, l) => sum + l.entries.filter((e) => e.rank === key || e.targetRank === key).length, 0);
      return rules + exclusions + entries;
    });
    this.catalogReferences.require('promotions', 'rank', 'probation');
  }
}

export const promotionsModule = defineModule({
  manifest: PROMOTIONS_MANIFEST,
  nestModule: PromotionsModule,
  entities: [PromotionListEntity, ExclusionEntity],
  historized: [PromotionListEntity, ExclusionEntity],
  migrations: PROMOTIONS_MIGRATIONS,
  settings: PROMOTIONS_SETTINGS,
});
