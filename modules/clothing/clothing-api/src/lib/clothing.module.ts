import { Inject, Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { CodeRegistry, DeadlineRegistry, defineModule, ExportRegistry, HistoryAccessRegistry, ListRegistry, PersonDataRegistry, SearchRegistry } from '@forga/core-api';
import { CLOTHING_MANIFEST } from '@forga/clothing-contracts';
import { ORGANIZATION_REFERENCES, type OrganizationReferences, PERSON_HOLDINGS, type PersonHoldings } from '@forga/masterdata-contracts';
import { CLOTHING_MIGRATIONS } from '../migrations/index.js';
import { ClothingController } from './clothing.controller.js';
import { ClothingData } from './clothing.data.js';
import { ArticleEntity, CareEntity, ClothingInspectionEntity, ClothingItemEntity, ConsumableReceiptEntity, IssueEntity, SizeProfileEntity } from './clothing.entities.js';
import { ClothingService, ISSUE, MANAGE, READ } from './clothing.service.js';

@Module({ controllers: [ClothingController], providers: [ClothingService, ClothingData] })
export class ClothingModule implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly service: ClothingService,
    private readonly data: ClothingData,
    private readonly lists: ListRegistry,
    private readonly deadlines: DeadlineRegistry,
    private readonly search: SearchRegistry,
    private readonly codes: CodeRegistry,
    private readonly exports: ExportRegistry,
    private readonly historyAccess: HistoryAccessRegistry,
    @Inject(ORGANIZATION_REFERENCES) private readonly references: OrganizationReferences,
    @Inject(PERSON_HOLDINGS) private readonly holdings: PersonHoldings,
    private readonly personData: PersonDataRegistry,
  ) {}

  onModuleInit(): void {
    for (const definition of this.data.lists()) this.lists.register('clothing', definition);
    this.deadlines.register(this.data);
    this.search.register('clothing', (user, query) => this.data.search(user, query));
    this.codes.register('clothing', (user, code) => this.data.code(user, code));
    this.exports.register('clothing', { all: () => this.data.exportAll(), person: (id) => this.data.exportPerson(id) });
    this.personData.register('clothing', { anonymize: (ids) => this.data.anonymize(ids) });
    this.historyAccess.register('clothing.item', async (user, id) => {
      const item = await this.em.fork().findOne(ClothingItemEntity, id);
      return { allowed: Boolean(item) && user.can(READ, item!.departmentId) };
    });
    this.historyAccess.registerPermission('clothing.article', MANAGE);
    this.historyAccess.registerPermission('clothing.size_profile', ISSUE);
    this.historyAccess.registerPermission('clothing.consumable_receipt', READ);
    // Leaving the brigade or moving to the veterans: no protective equipment may still be assigned.
    this.holdings.register('clothing', (personId) => this.service.held(personId));
    this.references.register('clothing', (kind, id) => (kind === 'department' ? this.data.countDepartment(id) : Promise.resolve(0)));
  }
}

export const clothingModule = defineModule({
  manifest: CLOTHING_MANIFEST,
  nestModule: ClothingModule,
  entities: [ArticleEntity, ClothingItemEntity, IssueEntity, CareEntity, ClothingInspectionEntity, SizeProfileEntity, ConsumableReceiptEntity],
  historized: [ArticleEntity, ClothingItemEntity, { entity: CareEntity, parent: 'item' }, { entity: ClothingInspectionEntity, parent: 'item' }, SizeProfileEntity, ConsumableReceiptEntity],
  migrations: CLOTHING_MIGRATIONS,
});
