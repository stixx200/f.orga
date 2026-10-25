import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { assertVersion, type AuthenticatedUser, berlinDate, wordsWhere } from '@forga/core-api';
import { normalizeRfid } from '@forga/core-contracts';
import {
  type Article,
  ARTICLE_TEMPLATE,
  ArticleInput,
  type Care,
  CareInput,
  ConsumableIssueInput,
  dueDates,
  type Inspection,
  InspectionInput,
  type IssueRecord,
  type Item,
  type ItemDetail,
  ItemInput,
  ItemIssueInput,
  ItemReturnInput,
  type PersonClothing,
} from '@forga/clothing-contracts';
import { PERSON_DIRECTORY, type PersonDirectory, type PersonSnapshot } from '@forga/masterdata-contracts';
import { ArticleEntity, CareEntity, ClothingInspectionEntity, ClothingItemEntity, IssueEntity } from './clothing.entities.js';

export const READ = 'clothing.read';
export const ISSUE = 'clothing.issue';
export const MANAGE = 'clothing.manage';
export const SELF = 'clothing.self';

type Parsed<T extends { parse: (v: unknown) => unknown }> = ReturnType<T['parse']>;

export const toArticleDto = (a: ArticleEntity): Article => ({
  id: a.id, key: a.key, name: a.name, kind: a.kind, sizes: a.sizes, textile: a.textile, impregnationMonths: a.impregnationMonths ?? null,
  inspectionMonths: a.inspectionMonths ?? null, active: a.active, sortOrder: a.sortOrder, version: a.version,
});

const toIssueDto = (i: IssueEntity): IssueRecord => ({
  id: i.id, personId: i.personId, kind: i.kind, articleKey: i.articleKey, itemId: i.itemId ?? null, inventoryNumber: i.inventoryNumber ?? null,
  size: i.size, quantity: i.quantity, date: i.date, notes: i.notes, recordedBy: i.recordedBy,
});

const toCareDto = (c: CareEntity): Care => ({ id: c.id, itemId: c.item.id, kind: c.kind, date: c.date, place: c.place, notes: c.notes, recordedBy: c.recordedBy });
const toInspectionDto = (i: ClothingInspectionEntity): Inspection => ({ id: i.id, itemId: i.item.id, date: i.date, passed: i.passed, inspector: i.inspector, notes: i.notes, recordedBy: i.recordedBy });

const latest = (dates: string[]) => dates.toSorted().at(-1) ?? null;

/** Articles, pieces, issues, washing and inspections of the clothing store. */
@Injectable()
export class ClothingService {
  constructor(
    private readonly em: EntityManager,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  // ----- access -----

  /** Pieces of the departments the user has the permission for. */
  visible(user: AuthenticatedUser, permission = READ): FilterQuery<ClothingItemEntity> | null {
    const grant = user.grant(permission);
    if (!grant) return null;
    return grant === 'brigade' ? {} : { departmentId: { $in: grant } };
  }

  private require(user: AuthenticatedUser, permission: string, departmentId: string): void {
    if (!user.can(permission, departmentId)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [permission] });
  }

  private requireBrigade(user: AuthenticatedUser, permission: string): void {
    if (user.grant(permission) !== 'brigade') throw new ForbiddenException({ code: 'auth.forbidden', permissions: [permission] });
  }

  private async person(personId: string): Promise<PersonSnapshot> {
    const [person] = await this.directory.snapshots([personId]);
    if (!person) throw new BadRequestException({ code: 'clothing.unknownPerson' });
    return person;
  }

  /** The permission in one of the person's departments. */
  private canForPerson(user: AuthenticatedUser, permission: string, person: PersonSnapshot): boolean {
    return user.grant(permission) === 'brigade' || person.departmentIds.some((d) => user.can(permission, d));
  }

  // ----- articles -----

  async articles(): Promise<Article[]> {
    return (await this.em.fork().find(ArticleEntity, {}, { orderBy: { sortOrder: 'asc', key: 'asc' } })).map(toArticleDto);
  }

  async createArticle(user: AuthenticatedUser, input: Parsed<typeof ArticleInput>): Promise<Article> {
    this.requireBrigade(user, MANAGE);
    const em = this.em.fork();
    if (await em.count(ArticleEntity, { key: input.key })) throw new ConflictException({ code: 'clothing.articleKeyTaken', key: input.key });
    const article = em.create(ArticleEntity, this.articleFields(input));
    await em.flush();
    return toArticleDto(article);
  }

  async updateArticle(user: AuthenticatedUser, id: string, input: Parsed<typeof ArticleInput>): Promise<Article> {
    this.requireBrigade(user, MANAGE);
    const em = this.em.fork();
    const article = await em.findOne(ArticleEntity, id);
    if (!article) throw new NotFoundException();
    if (article.key !== input.key) throw new BadRequestException({ code: 'clothing.articleKeyFixed' });
    // Pieces exist only for inventory articles; the kind of an article with pieces stays.
    if (article.kind !== input.kind && (await em.count(ClothingItemEntity, { articleKey: article.key }))) throw new BadRequestException({ code: 'clothing.articleKindFixed' });
    em.assign(article, this.articleFields(input));
    await em.flush();
    return toArticleDto(article);
  }

  /** Adds the articles of the template whose key is missing. */
  async applyTemplate(user: AuthenticatedUser): Promise<{ added: number }> {
    this.requireBrigade(user, MANAGE);
    const em = this.em.fork();
    const existing = new Set((await em.find(ArticleEntity, {})).map((a) => a.key));
    const missing = ARTICLE_TEMPLATE.filter((a) => !existing.has(a.key));
    for (const article of missing) em.create(ArticleEntity, this.articleFields(ArticleInput.parse(article)));
    await em.flush();
    return { added: missing.length };
  }

  private articleFields(input: Parsed<typeof ArticleInput>) {
    const inventory = input.kind === 'inventory';
    return {
      key: input.key,
      name: input.name,
      kind: input.kind,
      sizes: input.sizes,
      // Washing and inspections are recorded for pieces only.
      textile: inventory && input.textile,
      impregnationMonths: inventory && input.textile ? input.impregnationMonths : null,
      inspectionMonths: inventory ? input.inspectionMonths : null,
      active: input.active,
      sortOrder: input.sortOrder,
    };
  }

  private async article(em: EntityManager, key: string): Promise<ArticleEntity> {
    const article = await em.findOne(ArticleEntity, { key });
    if (!article) throw new BadRequestException({ code: 'clothing.unknownArticle', key });
    return article;
  }

  // ----- pieces -----

  /** Pieces with the dates of the last washing, impregnation and inspection and the next due dates. */
  async toDtos(em: EntityManager, items: ClothingItemEntity[]): Promise<Item[]> {
    if (!items.length) return [];
    const ids = items.map((i) => i.id);
    const [articles, care, inspections] = await Promise.all([
      em.find(ArticleEntity, {}),
      em.find(CareEntity, { item: { $in: ids } }),
      em.find(ClothingInspectionEntity, { item: { $in: ids } }),
    ]);
    const byKey = new Map(articles.map((a) => [a.key, a]));
    return items.map((item) => {
      const own = care.filter((c) => c.item.id === item.id);
      const lastImpregnatedOn = latest(own.filter((c) => c.kind === 'impregnation').map((c) => c.date));
      const lastWashedOn = latest(own.map((c) => c.date));
      const lastInspectedOn = latest(inspections.filter((i) => i.item.id === item.id).map((i) => i.date));
      const article = byKey.get(item.articleKey);
      const due = article && item.status !== 'retired'
        ? dueDates({ impregnationMonths: article.impregnationMonths ?? null, inspectionMonths: article.inspectionMonths ?? null }, { purchasedOn: item.purchasedOn ?? null, createdOn: item.createdOn, lastImpregnatedOn, lastInspectedOn })
        : { impregnationDueOn: null, inspectionDueOn: null };
      return {
        id: item.id, articleKey: item.articleKey, inventoryNumber: item.inventoryNumber, size: item.size, serialNumber: item.serialNumber,
        barcode: item.barcode ?? null, rfid: item.rfid ?? null,
        manufacturer: item.manufacturer, purchasedOn: item.purchasedOn ?? null, departmentId: item.departmentId, notes: item.notes, status: item.status,
        holderId: item.holderId ?? null, issuedOn: item.issuedOn ?? null, lastWashedOn, lastImpregnatedOn, lastInspectedOn, ...due, version: item.version,
      };
    });
  }

  async items(user: AuthenticatedUser, filter: { status?: string; articleKey?: string; holderId?: string; query?: string }): Promise<Item[]> {
    const visible = this.visible(user);
    if (!visible) return [];
    const where: FilterQuery<ClothingItemEntity>[] = [visible];
    if (filter.status) where.push({ status: filter.status as ClothingItemEntity['status'] });
    else where.push({ status: { $ne: 'retired' } });
    if (filter.articleKey) where.push({ articleKey: filter.articleKey });
    if (filter.holderId) where.push({ holderId: filter.holderId });
    const words = filter.query ? wordsWhere(filter.query, ['inventoryNumber', 'serialNumber', 'barcode']) : null;
    if (filter.query) where.push({ $or: [...(words ? [words] : []), { rfid: { $ilike: `%${normalizeRfid(filter.query) || filter.query}%` } }] } as FilterQuery<ClothingItemEntity>);
    const em = this.em.fork();
    return this.toDtos(em, await em.find(ClothingItemEntity, { $and: where }, { orderBy: { inventoryNumber: 'asc' } }));
  }

  private async load(em: EntityManager, user: AuthenticatedUser, id: string, permission = READ): Promise<ClothingItemEntity> {
    const item = await em.findOne(ClothingItemEntity, id);
    if (!item || !user.can(READ, item.departmentId)) throw new NotFoundException();
    this.require(user, permission, item.departmentId);
    return item;
  }

  async item(user: AuthenticatedUser, id: string): Promise<ItemDetail> {
    const em = this.em.fork();
    const item = await this.load(em, user, id);
    const [dto] = await this.toDtos(em, [item]);
    const [care, inspections, history] = await Promise.all([
      em.find(CareEntity, { item }, { orderBy: { date: 'desc' } }),
      em.find(ClothingInspectionEntity, { item }, { orderBy: { date: 'desc' } }),
      em.find(IssueEntity, { itemId: item.id }, { orderBy: { date: 'desc', recordedAt: 'desc' } }),
    ]);
    return { ...dto, care: care.map(toCareDto), inspections: inspections.map(toInspectionDto), history: history.map(toIssueDto) };
  }

  async createItem(user: AuthenticatedUser, input: Parsed<typeof ItemInput>): Promise<Item> {
    this.require(user, MANAGE, input.departmentId);
    const em = this.em.fork();
    const article = await this.article(em, input.articleKey);
    if (article.kind !== 'inventory') throw new BadRequestException({ code: 'clothing.notInventoried' });
    if (await em.count(ClothingItemEntity, { inventoryNumber: input.inventoryNumber })) throw new ConflictException({ code: 'clothing.inventoryNumberTaken', number: input.inventoryNumber });
    await this.assertCodesFree(em, input);
    const { version: _version, ...fields } = input;
    const item = em.create(ClothingItemEntity, { ...fields, status: 'stock', holderId: null, issuedOn: null, createdOn: berlinDate() });
    await em.flush();
    return (await this.toDtos(em, [item]))[0];
  }

  async updateItem(user: AuthenticatedUser, id: string, input: Parsed<typeof ItemInput>): Promise<Item> {
    const em = this.em.fork();
    const item = await this.load(em, user, id, MANAGE);
    assertVersion(item, input.version);
    this.require(user, MANAGE, input.departmentId);
    if (input.articleKey !== item.articleKey) throw new BadRequestException({ code: 'clothing.articleFixed' });
    if (input.inventoryNumber !== item.inventoryNumber && (await em.count(ClothingItemEntity, { inventoryNumber: input.inventoryNumber }))) {
      throw new ConflictException({ code: 'clothing.inventoryNumberTaken', number: input.inventoryNumber });
    }
    await this.assertCodesFree(em, input, id);
    const { version: _version, articleKey: _article, ...fields } = input;
    em.assign(item, fields);
    await em.flush();
    return (await this.toDtos(em, [item]))[0];
  }

  /** Barcode and RFID chip belong to one piece only. */
  private async assertCodesFree(em: EntityManager, input: Parsed<typeof ItemInput>, id?: string): Promise<void> {
    for (const field of ['barcode', 'rfid'] as const) {
      const value = input[field];
      if (value && (await em.count(ClothingItemEntity, { [field]: value, ...(id ? { id: { $ne: id } } : {}) }))) {
        throw new ConflictException({ code: 'codes.taken', field, value });
      }
    }
  }

  // ----- issue and return -----

  /** Assigns a piece in stock to a person; the issue is recorded in the person's history. */
  async issueItem(user: AuthenticatedUser, id: string, input: Parsed<typeof ItemIssueInput>): Promise<Item> {
    const em = this.em.fork();
    const item = await this.load(em, user, id, ISSUE);
    if (item.status !== 'stock') throw new BadRequestException({ code: 'clothing.notInStock', status: item.status });
    const person = await this.person(input.personId);
    if (person.status === 'left') throw new BadRequestException({ code: 'clothing.personLeft' });
    if (!this.canForPerson(user, ISSUE, person)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [ISSUE] });
    Object.assign(item, { status: 'issued', holderId: person.id, issuedOn: input.date });
    em.create(IssueEntity, {
      personId: person.id, kind: 'issue', articleKey: item.articleKey, itemId: item.id, inventoryNumber: item.inventoryNumber,
      size: item.size, quantity: 1, date: input.date, notes: input.notes, recordedBy: user.displayName, recordedAt: new Date(),
    });
    await em.flush();
    return (await this.toDtos(em, [item]))[0];
  }

  /** Takes a piece back into stock, or out of use with `retire`. */
  async returnItem(user: AuthenticatedUser, id: string, input: Parsed<typeof ItemReturnInput>): Promise<Item> {
    const em = this.em.fork();
    const item = await this.load(em, user, id, ISSUE);
    if (item.status !== 'issued' || !item.holderId) throw new BadRequestException({ code: 'clothing.notIssued' });
    if (item.issuedOn && input.date < item.issuedOn) throw new BadRequestException({ code: 'clothing.returnBeforeIssue' });
    em.create(IssueEntity, {
      personId: item.holderId, kind: 'return', articleKey: item.articleKey, itemId: item.id, inventoryNumber: item.inventoryNumber,
      size: item.size, quantity: 1, date: input.date, notes: input.notes, recordedBy: user.displayName, recordedAt: new Date(),
    });
    Object.assign(item, { status: input.retire ? 'retired' : 'stock', holderId: null, issuedOn: null });
    await em.flush();
    return (await this.toDtos(em, [item]))[0];
  }

  /** Takes a piece in stock out of use. */
  async retireItem(user: AuthenticatedUser, id: string): Promise<Item> {
    const em = this.em.fork();
    const item = await this.load(em, user, id, MANAGE);
    if (item.status !== 'stock') throw new BadRequestException({ code: 'clothing.notInStock', status: item.status });
    item.status = 'retired';
    await em.flush();
    return (await this.toDtos(em, [item]))[0];
  }

  /** Consumables (caps, gloves) are only handed out, not assigned: one entry in the person's history. */
  async issueConsumable(user: AuthenticatedUser, input: Parsed<typeof ConsumableIssueInput>): Promise<IssueRecord> {
    const em = this.em.fork();
    const article = await this.article(em, input.articleKey);
    if (article.kind !== 'consumable') throw new BadRequestException({ code: 'clothing.inventoried' });
    const person = await this.person(input.personId);
    if (person.status === 'left') throw new BadRequestException({ code: 'clothing.personLeft' });
    if (!this.canForPerson(user, ISSUE, person)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [ISSUE] });
    const record = em.create(IssueEntity, {
      personId: person.id, kind: 'issue', articleKey: article.key, itemId: null, inventoryNumber: null, size: input.size,
      quantity: input.quantity, date: input.date, notes: input.notes, recordedBy: user.displayName, recordedAt: new Date(),
    });
    await em.flush();
    return toIssueDto(record);
  }

  // ----- washing and inspections -----

  /** Washing or impregnation of several textile pieces at once (e.g. after collecting them from the laundry). */
  async recordCare(user: AuthenticatedUser, input: Parsed<typeof CareInput>): Promise<Care[]> {
    const em = this.em.fork();
    const items = await em.find(ClothingItemEntity, { id: { $in: input.itemIds } });
    if (items.length !== new Set(input.itemIds).size) throw new BadRequestException({ code: 'clothing.unknownItem' });
    const textile = new Set((await em.find(ArticleEntity, { textile: true })).map((a) => a.key));
    for (const item of items) {
      this.require(user, ISSUE, item.departmentId);
      if (!textile.has(item.articleKey)) throw new BadRequestException({ code: 'clothing.notTextile', number: item.inventoryNumber });
      if (item.status === 'retired') throw new BadRequestException({ code: 'clothing.retired', number: item.inventoryNumber });
    }
    const created = items.map((item) => em.create(CareEntity, { item, kind: input.kind, date: input.date, place: input.place, notes: input.notes, recordedBy: user.displayName }));
    await em.flush();
    return created.map(toCareDto);
  }

  async recordInspection(user: AuthenticatedUser, id: string, input: Parsed<typeof InspectionInput>): Promise<Inspection> {
    const em = this.em.fork();
    const item = await this.load(em, user, id, ISSUE);
    if (item.status === 'retired') throw new BadRequestException({ code: 'clothing.retired', number: item.inventoryNumber });
    const inspection = em.create(ClothingInspectionEntity, { item, ...input, recordedBy: user.displayName });
    await em.flush();
    return toInspectionDto(inspection);
  }

  // ----- persons -----

  /** Pieces a person holds and the history of issues and returns (person file tab, "my area"). */
  async personClothing(user: AuthenticatedUser, personId: string): Promise<PersonClothing> {
    const person = await this.person(personId);
    const own = user.personId === personId && user.can(SELF);
    if (!own && !this.canForPerson(user, READ, person)) throw new NotFoundException();
    const em = this.em.fork();
    const [items, history] = await Promise.all([
      em.find(ClothingItemEntity, { holderId: personId, status: 'issued' }, { orderBy: { articleKey: 'asc' } }),
      em.find(IssueEntity, { personId }, { orderBy: { date: 'desc', recordedAt: 'desc' } }),
    ]);
    return { items: await this.toDtos(em, items), history: history.map(toIssueDto) };
  }

  /** Pieces a person still holds; leaving and the transfer to the veterans are refused while there are any. */
  held(personId: string): Promise<number> {
    return this.em.fork().count(ClothingItemEntity, { holderId: personId, status: 'issued' });
  }
}
