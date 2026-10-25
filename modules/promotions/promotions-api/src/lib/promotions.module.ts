import { Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { defineModule, ExportRegistry, HistoryAccessRegistry, ListRegistry, PersonDataRegistry } from '@forga/core-api';
import { PROMOTIONS_MANIFEST, PROMOTIONS_SETTINGS } from '@forga/promotions-contracts';
import { PROMOTIONS_MIGRATIONS } from '../migrations/index.js';
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
  ) {}

  onModuleInit(): void {
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
    });
    this.personData.register('promotions', { anonymize: (ids) => this.data.anonymize(ids) });
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
