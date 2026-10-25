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
  CancelInput,
  ConsumableCountInput,
  ConsumableIssueInput,
  ConsumableReceiptInput,
  dueDates,
  type Inspection,
  InspectionInput,
  InspectionsInput,
  IssueManyInput,
  type IssueRecord,
  type Item,
  type ItemBlock,
  type ItemDetail,
  ItemInput,
  ItemIssueInput,
  ItemReturnInput,
  type PersonClothing,
  ReturnManyInput,
  SizeProfileInput,
  type StockRow,
  usagePeriods,
} from '@forga/clothing-contracts';
import { PERSON_DIRECTORY, type PersonDirectory, type PersonSnapshot } from '@forga/masterdata-contracts';
import { ArticleEntity, CareEntity, ClothingInspectionEntity, ClothingItemEntity, ConsumableReceiptEntity, IssueEntity, SizeProfileEntity } from './clothing.entities.js';

export const READ = 'clothing.read';
export const ISSUE = 'clothing.issue';
export const MANAGE = 'clothing.manage';
export const SELF = 'clothing.self';

type Parsed<T extends { parse: (v: unknown) => unknown }> = ReturnType<T['parse']>;

export const toArticleDto = (a: ArticleEntity): Article => ({
  id: a.id, key: a.key, name: a.name, kind: a.kind, sizes: a.sizes, textile: a.textile, impregnationMonths: a.impregnationMonths ?? null,
  inspectionMonths: a.inspectionMonths ?? null, active: a.active, sortOrder: a.sortOrder, minimumStock: a.minimumStock ?? {}, version: a.version,
});

type Recorded = Pick<IssueEntity, 'recordedBy' | 'recordedById' | 'cancelledAt' | 'cancelledBy' | 'cancelReason'>;
const recorded = (r: Recorded) => ({
  recordedBy: r.recordedBy, recordedById: r.recordedById ?? null, cancelledAt: r.cancelledAt ? r.cancelledAt.toISOString() : null, cancelledBy: r.cancelledBy ?? null, cancelReason: r.cancelReason,
});

const toIssueDto = (i: IssueEntity): IssueRecord => ({
  id: i.id, personId: i.personId, kind: i.kind, articleKey: i.articleKey, itemId: i.itemId ?? null, inventoryNumber: i.inventoryNumber ?? null,
  size: i.size, quantity: i.quantity, date: i.date, notes: i.notes, retire: i.retire, laundry: i.laundry, ...recorded(i),
});

const toCareDto = (c: CareEntity): Care => ({ id: c.id, itemId: c.item.id, kind: c.kind, date: c.date, place: c.place, notes: c.notes, ...recorded(c) });
const toInspectionDto = (i: ClothingInspectionEntity): Inspection => ({ id: i.id, itemId: i.item.id, date: i.date, passed: i.passed, inspector: i.inspector, notes: i.notes, ...recorded(i) });

const latest = (dates: string[]) => dates.toSorted().at(-1) ?? null;
/** Entries not cancelled. */
const valid = <T extends { cancelledAt?: Date | null }>(list: T[]) => list.filter((e) => !e.cancelledAt);
/** Order of the issue and return records of a piece as they were recorded. */
const byRecording = (a: IssueEntity, b: IssueEntity) => a.recordedAt.getTime() - b.recordedAt.getTime() || a.id.localeCompare(b.id);

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

  /**
   * Pieces go to active members only: not to persons who left, and not to the veterans (whose transfer is refused
   * while they hold pieces). Passive members and the youth get a hint in the issue desk.
   */
  private async recipient(user: AuthenticatedUser, personId: string): Promise<PersonSnapshot> {
    const person = await this.person(personId);
    if (person.status === 'left') throw new BadRequestException({ code: 'clothing.personLeft' });
    if (person.status === 'veterans') throw new BadRequestException({ code: 'clothing.personVeteran' });
    if (!this.canForPerson(user, ISSUE, person)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [ISSUE] });
    return person;
  }

  /** Issues, returns, washing and inspections are recorded when they happened, never in advance. */
  private notFuture(date: string): void {
    if (date > berlinDate()) throw new BadRequestException({ code: 'clothing.dateInFuture', date });
  }

  /** The size must be one of the article's sizes (when it has any). */
  private assertSize(article: ArticleEntity, size: string): void {
    if (size && article.sizes.length && !article.sizes.includes(size)) throw new BadRequestException({ code: 'clothing.unknownSize', size });
  }

  /** Consumables of an article with sizes are counted per size: handing out, receiving and counting need one. */
  private assertConsumableSize(article: ArticleEntity, size: string): void {
    if (article.sizes.length && !size) throw new BadRequestException({ code: 'clothing.sizeRequired', articleKey: article.key });
    this.assertSize(article, size);
  }

  /** Washing and inspections of a piece are recorded after its purchase. */
  private notBeforePurchase(item: ClothingItemEntity, date: string): void {
    if (item.purchasedOn && date < item.purchasedOn) throw new BadRequestException({ code: 'clothing.dateBeforePurchase', number: item.inventoryNumber, purchasedOn: item.purchasedOn });
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
      // Minimum stock only for the article's sizes (or `''` without sizes); 0 means none.
      minimumStock: Object.fromEntries(Object.entries(input.minimumStock).filter(([size, count]) => count > 0 && (input.sizes.length ? input.sizes.includes(size) : size === ''))),
    };
  }

  private async article(em: EntityManager, key: string): Promise<ArticleEntity> {
    const article = await em.findOne(ArticleEntity, { key });
    if (!article) throw new BadRequestException({ code: 'clothing.unknownArticle', key });
    return article;
  }

  // ----- pieces -----

  /**
   * Pieces with the dates of the last washing, impregnation and inspection, the next due dates and why they may not
   * be issued. Cancelled entries do not count.
   */
  async toDtos(em: EntityManager, items: ClothingItemEntity[]): Promise<Item[]> {
    if (!items.length) return [];
    const ids = items.map((i) => i.id);
    const [articles, care, inspections, records] = await Promise.all([
      em.find(ArticleEntity, {}),
      em.find(CareEntity, { item: { $in: ids }, cancelledAt: null }),
      em.find(ClothingInspectionEntity, { item: { $in: ids }, cancelledAt: null }, { orderBy: { date: 'asc', id: 'asc' } }),
      em.find(IssueEntity, { itemId: { $in: ids }, cancelledAt: null }),
    ]);
    const byKey = new Map(articles.map((a) => [a.key, a]));
    return items.map((item) => {
      const own = care.filter((c) => c.item.id === item.id);
      const lastImpregnatedOn = latest(own.filter((c) => c.kind === 'impregnation').map((c) => c.date));
      const lastWashedOn = latest(own.map((c) => c.date));
      const checks = inspections.filter((i) => i.item.id === item.id);
      const last = checks.at(-1);
      const lastPassedOn = latest(checks.filter((i) => i.passed).map((i) => i.date));
      const history = records.filter((r) => r.itemId === item.id).toSorted(byRecording);
      const article = byKey.get(item.articleKey);
      const retired = item.status === 'retired';
      const due = article && !retired
        ? dueDates(
            { impregnationMonths: article.impregnationMonths ?? null, inspectionMonths: article.inspectionMonths ?? null },
            { purchasedOn: item.purchasedOn ?? null, createdOn: item.createdOn, lastImpregnatedOn, lastInspectedOn: lastPassedOn, usage: item.status === 'issued' ? usagePeriods(history, item.issuedOn ?? null) : [] },
          )
        : { impregnationDueOn: null, inspectionDueOn: null };
      const blockedBy: ItemBlock[] = [];
      if (!retired && last && !last.passed) blockedBy.push('inspection');
      const lastReturn = history.findLast((r) => r.kind === 'return');
      if (!retired && item.status === 'stock' && lastReturn?.laundry && !own.some((c) => c.date >= lastReturn.date)) blockedBy.push('laundry');
      return {
        id: item.id, articleKey: item.articleKey, inventoryNumber: item.inventoryNumber, size: item.size, serialNumber: item.serialNumber,
        barcode: item.barcode ?? null, rfid: item.rfid ?? null,
        manufacturer: item.manufacturer, purchasedOn: item.purchasedOn ?? null, departmentId: item.departmentId, notes: item.notes, status: item.status,
        holderId: item.holderId ?? null, issuedOn: item.issuedOn ?? null, lastWashedOn, lastImpregnatedOn, lastInspectedOn: last?.date ?? null,
        lastInspectionPassed: last ? last.passed : null, ...due, blockedBy, version: item.version,
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
      em.find(CareEntity, { item }, { orderBy: { date: 'desc', id: 'desc' } }),
      em.find(ClothingInspectionEntity, { item }, { orderBy: { date: 'desc', id: 'desc' } }),
      em.find(IssueEntity, { itemId: item.id }, { orderBy: { date: 'desc', recordedAt: 'desc' } }),
    ]);
    return { ...dto, care: care.map(toCareDto), inspections: inspections.map(toInspectionDto), history: history.map(toIssueDto) };
  }

  async createItem(user: AuthenticatedUser, input: Parsed<typeof ItemInput>): Promise<Item> {
    this.require(user, MANAGE, input.departmentId);
    const em = this.em.fork();
    const article = await this.article(em, input.articleKey);
    if (article.kind !== 'inventory') throw new BadRequestException({ code: 'clothing.notInventoried' });
    if (!article.active) throw new BadRequestException({ code: 'clothing.articleInactive' });
    this.assertSize(article, input.size);
    if (input.purchasedOn) this.notFuture(input.purchasedOn);
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
    // Pieces recorded before the article's sizes were set keep their size.
    if (input.size !== item.size) this.assertSize(await this.article(em, item.articleKey), input.size);
    if (input.purchasedOn && input.purchasedOn !== item.purchasedOn) this.notFuture(input.purchasedOn);
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
    return (await this.issueMany(user, { ...input, itemIds: [id] }))[0];
  }

  /**
   * Assigns several pieces in stock to a person in one step (all or none). Refused for pieces that are blocked (failed
   * inspection, to wash) or of an inactive article, before the purchase or the last return, and in the future; a
   * piece whose inspection is overdue needs `acceptOverdueInspection`.
   */
  async issueMany(user: AuthenticatedUser, input: Parsed<typeof IssueManyInput>): Promise<Item[]> {
    const em = this.em.fork();
    const ids = [...new Set(input.itemIds)];
    const items = await Promise.all(ids.map((id) => this.load(em, user, id, ISSUE)));
    this.notFuture(input.date);
    const articles = new Map((await em.find(ArticleEntity, { key: { $in: items.map((i) => i.articleKey) } })).map((a) => [a.key, a]));
    const dtos = await this.toDtos(em, items);
    const returns = valid(await em.find(IssueEntity, { itemId: { $in: ids }, kind: 'return' }));
    const today = berlinDate();
    for (const [index, item] of items.entries()) {
      const dto = dtos[index];
      const number = item.inventoryNumber;
      if (item.status !== 'stock') throw new BadRequestException({ code: 'clothing.notInStock', status: item.status, number });
      if (!articles.get(item.articleKey)?.active) throw new BadRequestException({ code: 'clothing.articleInactive', number });
      if (dto.blockedBy.length) throw new BadRequestException({ code: dto.blockedBy[0] === 'inspection' ? 'clothing.failedInspection' : 'clothing.awaitingLaundry', number });
      if (dto.inspectionDueOn && dto.inspectionDueOn < today && !input.acceptOverdueInspection) {
        throw new ConflictException({ code: 'clothing.inspectionOverdue', number, dueOn: dto.inspectionDueOn });
      }
      if (item.purchasedOn && input.date < item.purchasedOn) throw new BadRequestException({ code: 'clothing.issueBeforePurchase', number });
      const lastReturn = latest(returns.filter((r) => r.itemId === item.id).map((r) => r.date));
      if (lastReturn && input.date < lastReturn) throw new BadRequestException({ code: 'clothing.issueBeforeReturn', number, date: lastReturn });
    }
    // The pieces first: a piece not in stock is the more useful answer than the person.
    const person = await this.recipient(user, input.personId);
    const recordedAt = new Date();
    for (const item of items) {
      Object.assign(item, { status: 'issued', holderId: person.id, issuedOn: input.date });
      em.create(IssueEntity, {
        personId: person.id, kind: 'issue', articleKey: item.articleKey, itemId: item.id, inventoryNumber: item.inventoryNumber,
        size: item.size, quantity: 1, date: input.date, notes: input.notes, recordedBy: user.displayName, recordedById: user.id, recordedAt,
      });
    }
    await em.flush();
    return this.toDtos(em, items);
  }

  /** Takes a piece back into stock, out of use with `retire`, or to the laundry with `laundry`. */
  async returnItem(user: AuthenticatedUser, id: string, input: Parsed<typeof ItemReturnInput>): Promise<Item> {
    return (await this.returnMany(user, { date: input.date, notes: input.notes, items: [{ itemId: id, retire: input.retire, laundry: input.laundry }] }))[0];
  }

  /** Takes several pieces back in one step (all or none), e.g. everything a person holds; retiring needs `clothing.manage`. */
  async returnMany(user: AuthenticatedUser, input: Parsed<typeof ReturnManyInput>): Promise<Item[]> {
    const em = this.em.fork();
    this.notFuture(input.date);
    const entries = [...new Map(input.items.map((e) => [e.itemId, e])).values()];
    const items = await Promise.all(entries.map((e) => this.load(em, user, e.itemId, ISSUE)));
    const textile = new Set((await em.find(ArticleEntity, { textile: true })).map((a) => a.key));
    for (const [index, item] of items.entries()) {
      const entry = entries[index];
      if (item.status !== 'issued' || !item.holderId) throw new BadRequestException({ code: 'clothing.notIssued', number: item.inventoryNumber });
      if (item.issuedOn && input.date < item.issuedOn) throw new BadRequestException({ code: 'clothing.returnBeforeIssue', number: item.inventoryNumber });
      if (entry.laundry && !entry.retire && !textile.has(item.articleKey)) throw new BadRequestException({ code: 'clothing.notTextile', number: item.inventoryNumber });
      // Taking a piece out of use is managing the stock, as with `retireItem`.
      if (entry.retire) this.require(user, MANAGE, item.departmentId);
    }
    const recordedAt = new Date();
    for (const [index, item] of items.entries()) {
      const { retire, laundry } = entries[index];
      em.create(IssueEntity, {
        personId: item.holderId!, kind: 'return', articleKey: item.articleKey, itemId: item.id, inventoryNumber: item.inventoryNumber, size: item.size, quantity: 1,
        date: input.date, notes: input.notes, retire, laundry: laundry && !retire, recordedBy: user.displayName, recordedById: user.id, recordedAt,
      });
      Object.assign(item, { status: retire ? 'retired' : 'stock', holderId: null, issuedOn: null });
    }
    await em.flush();
    return this.toDtos(em, items);
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
    if (!article.active) throw new BadRequestException({ code: 'clothing.articleInactive' });
    this.assertConsumableSize(article, input.size);
    this.notFuture(input.date);
    const person = await this.recipient(user, input.personId);
    // Only a store that keeps a counter for the article (any receipt) warns; handing out stays possible when confirmed.
    if (!input.acceptLowStock && (await em.count(ConsumableReceiptEntity, { articleKey: article.key }))) {
      const available = await this.counter(em, article.key, input.size);
      if (available < input.quantity) throw new ConflictException({ code: 'clothing.stockInsufficient', available });
    }
    const record = em.create(IssueEntity, {
      personId: person.id, kind: 'issue', articleKey: article.key, itemId: null, inventoryNumber: null, size: input.size,
      quantity: input.quantity, date: input.date, notes: input.notes, recordedBy: user.displayName, recordedById: user.id, recordedAt: new Date(),
    });
    await em.flush();
    return toIssueDto(record);
  }

  /** Counter of a consumable in one size: received (and corrected) minus handed out, for the whole brigade. */
  private async counter(em: EntityManager, articleKey: string, size: string): Promise<number> {
    const [receipts, handedOut] = await Promise.all([
      em.find(ConsumableReceiptEntity, { articleKey, size }),
      em.find(IssueEntity, { kind: 'issue', itemId: null, cancelledAt: null, articleKey, size }),
    ]);
    return receipts.reduce((sum, r) => sum + r.quantity, 0) - handedOut.reduce((sum, r) => sum + r.quantity, 0);
  }

  private async consumable(user: AuthenticatedUser, em: EntityManager, input: { articleKey: string; size: string; date: string }): Promise<ArticleEntity> {
    if (!user.can(MANAGE)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [MANAGE] });
    const article = await this.article(em, input.articleKey);
    if (article.kind !== 'consumable') throw new BadRequestException({ code: 'clothing.inventoried' });
    this.assertConsumableSize(article, input.size);
    this.notFuture(input.date);
    return article;
  }

  /** Consumables received into the store; the stock is kept for the whole brigade. */
  async receiveConsumable(user: AuthenticatedUser, input: Parsed<typeof ConsumableReceiptInput>): Promise<StockRow[]> {
    const em = this.em.fork();
    await this.consumable(user, em, input);
    em.create(ConsumableReceiptEntity, { ...input, counted: null, recordedBy: user.displayName, recordedAt: new Date() });
    await em.flush();
    return this.stock(user, {});
  }

  /** Counting in the store sets the counter to the count; the difference is recorded with the count. */
  async countConsumable(user: AuthenticatedUser, input: Parsed<typeof ConsumableCountInput>): Promise<StockRow[]> {
    const em = this.em.fork();
    await this.consumable(user, em, input);
    const quantity = input.counted - (await this.counter(em, input.articleKey, input.size));
    em.create(ConsumableReceiptEntity, { articleKey: input.articleKey, size: input.size, quantity, counted: input.counted, date: input.date, notes: input.notes, recordedBy: user.displayName, recordedAt: new Date() });
    await em.flush();
    return this.stock(user, {});
  }

  /**
   * Stock per article and size with the minimum stock: pieces of the visible departments (available, blocked,
   * issued) and the counter of the consumables (received minus handed out).
   */
  async stock(user: AuthenticatedUser, filter: { departmentId?: string }): Promise<StockRow[]> {
    const visible = this.visible(user);
    if (!visible) return [];
    const em = this.em.fork();
    const where: FilterQuery<ClothingItemEntity>[] = [visible, { status: { $ne: 'retired' } }];
    if (filter.departmentId) where.push({ departmentId: filter.departmentId });
    const [articles, items, receipts, handedOut] = await Promise.all([
      em.find(ArticleEntity, {}, { orderBy: { sortOrder: 'asc', key: 'asc' } }),
      em.find(ClothingItemEntity, { $and: where }).then((found) => this.toDtos(em, found)),
      em.find(ConsumableReceiptEntity, {}),
      em.find(IssueEntity, { kind: 'issue', itemId: null, cancelledAt: null }),
    ]);
    const rows: StockRow[] = [];
    for (const article of articles) {
      const own = <T extends { articleKey: string; size: string }>(list: T[]) => list.filter((x) => x.articleKey === article.key);
      const sizes = [...new Set([...article.sizes, ...Object.keys(article.minimumStock ?? {}), ...own(items).map((i) => i.size), ...own(receipts).map((r) => r.size), ...own(handedOut).map((r) => r.size)])];
      for (const size of sizes.length ? sizes : ['']) {
        const minimum = article.minimumStock?.[size] ?? null;
        const pieces = own(items).filter((i) => i.size === size);
        const sum = (list: { size: string; quantity: number }[]) => list.filter((x) => x.size === size).reduce((total, x) => total + x.quantity, 0);
        const available = article.kind === 'inventory'
          ? pieces.filter((i) => i.status === 'stock' && !i.blockedBy.length).length
          : sum(own(receipts)) - sum(own(handedOut));
        const row = {
          articleKey: article.key, kind: article.kind, size, available,
          blocked: pieces.filter((i) => i.status === 'stock' && i.blockedBy.length).length,
          issued: pieces.filter((i) => i.status === 'issued').length,
          minimum, reorder: minimum !== null && available < minimum,
        };
        // Inactive articles and sizes without anything are left out.
        if ((article.active && (article.sizes.includes(size) || size === '' || minimum !== null)) || row.available || row.blocked || row.issued) rows.push(row);
      }
    }
    return rows;
  }

  // ----- washing and inspections -----

  /** Washing or impregnation of several textile pieces at once (e.g. after collecting them from the laundry). */
  async recordCare(user: AuthenticatedUser, input: Parsed<typeof CareInput>): Promise<Care[]> {
    this.notFuture(input.date);
    const em = this.em.fork();
    const items = await em.find(ClothingItemEntity, { id: { $in: input.itemIds } });
    if (items.length !== new Set(input.itemIds).size) throw new BadRequestException({ code: 'clothing.unknownItem' });
    const textile = new Set((await em.find(ArticleEntity, { textile: true })).map((a) => a.key));
    for (const item of items) {
      this.require(user, ISSUE, item.departmentId);
      if (!textile.has(item.articleKey)) throw new BadRequestException({ code: 'clothing.notTextile', number: item.inventoryNumber });
      if (item.status === 'retired') throw new BadRequestException({ code: 'clothing.retired', number: item.inventoryNumber });
      this.notBeforePurchase(item, input.date);
    }
    const created = items.map((item) => em.create(CareEntity, { item, kind: input.kind, date: input.date, place: input.place, notes: input.notes, recordedBy: user.displayName, recordedById: user.id }));
    await em.flush();
    return created.map(toCareDto);
  }

  async recordInspection(user: AuthenticatedUser, id: string, input: Parsed<typeof InspectionInput>): Promise<Inspection> {
    return (await this.recordInspections(user, { date: input.date, inspector: input.inspector, results: [{ itemId: id, passed: input.passed, notes: input.notes }] }))[0];
  }

  /**
   * Inspections of several pieces, one result each. A failed inspection does not restart the interval and blocks the
   * piece (to repair) until an inspection is passed.
   */
  async recordInspections(user: AuthenticatedUser, input: Parsed<typeof InspectionsInput>): Promise<Inspection[]> {
    this.notFuture(input.date);
    const em = this.em.fork();
    const results = [...new Map(input.results.map((r) => [r.itemId, r])).values()];
    const items = await Promise.all(results.map((r) => this.load(em, user, r.itemId, ISSUE)));
    for (const item of items) {
      if (item.status === 'retired') throw new BadRequestException({ code: 'clothing.retired', number: item.inventoryNumber });
      this.notBeforePurchase(item, input.date);
    }
    const created = items.map((item, index) =>
      em.create(ClothingInspectionEntity, { item, date: input.date, passed: results[index].passed, inspector: input.inspector, notes: results[index].notes, recordedBy: user.displayName, recordedById: user.id }),
    );
    await em.flush();
    return created.map(toInspectionDto);
  }

  // ----- cancelling wrong entries -----

  /** The one who recorded an entry may cancel it, as may those managing the clothing store of the department. */
  private assertMayCancel(user: AuthenticatedUser, entry: Recorded, departmentIds: string[]): void {
    if (entry.cancelledAt) throw new ConflictException({ code: 'clothing.alreadyCancelled' });
    const own = entry.recordedById === user.id && (user.grant(ISSUE) === 'brigade' || departmentIds.some((d) => user.can(ISSUE, d)));
    const manager = user.grant(MANAGE) === 'brigade' || departmentIds.some((d) => user.can(MANAGE, d));
    if (!own && !manager) throw new ForbiddenException({ code: 'clothing.notOwnEntry' });
  }

  private cancel(user: AuthenticatedUser, entry: Recorded, reason: string): void {
    Object.assign(entry, { cancelledAt: new Date(), cancelledBy: user.displayName, cancelReason: reason });
  }

  async cancelCare(user: AuthenticatedUser, id: string, input: Parsed<typeof CancelInput>): Promise<Care> {
    const em = this.em.fork();
    const care = await em.findOne(CareEntity, id, { populate: ['item'] });
    if (!care || !user.can(READ, care.item.departmentId)) throw new NotFoundException();
    this.assertMayCancel(user, care, [care.item.departmentId]);
    this.cancel(user, care, input.reason);
    await em.flush();
    return toCareDto(care);
  }

  async cancelInspection(user: AuthenticatedUser, id: string, input: Parsed<typeof CancelInput>): Promise<Inspection> {
    const em = this.em.fork();
    const inspection = await em.findOne(ClothingInspectionEntity, id, { populate: ['item'] });
    if (!inspection || !user.can(READ, inspection.item.departmentId)) throw new NotFoundException();
    this.assertMayCancel(user, inspection, [inspection.item.departmentId]);
    this.cancel(user, inspection, input.reason);
    await em.flush();
    return toInspectionDto(inspection);
  }

  /**
   * Cancels a consumable handed out, or the last issue or return of a piece: cancelling the issue puts the piece back
   * into stock, cancelling the return gives it back to the person.
   */
  async cancelIssue(user: AuthenticatedUser, id: string, input: Parsed<typeof CancelInput>): Promise<IssueRecord> {
    const em = this.em.fork();
    const record = await em.findOne(IssueEntity, id);
    if (!record) throw new NotFoundException();
    if (!record.itemId) {
      const person = await this.person(record.personId);
      if (!this.canForPerson(user, READ, person)) throw new NotFoundException();
      this.assertMayCancel(user, record, person.departmentIds);
    } else {
      const item = await this.load(em, user, record.itemId);
      this.assertMayCancel(user, record, [item.departmentId]);
      const records = valid(await em.find(IssueEntity, { itemId: item.id })).toSorted(byRecording);
      if (records.at(-1)?.id !== record.id) throw new ConflictException({ code: 'clothing.notLastEntry' });
      if (record.kind === 'issue') {
        if (item.status !== 'issued' || item.holderId !== record.personId) throw new ConflictException({ code: 'clothing.notLastEntry' });
        Object.assign(item, { status: 'stock', holderId: null, issuedOn: null });
      } else {
        if (!(item.status === 'stock' || (item.status === 'retired' && record.retire))) throw new ConflictException({ code: 'clothing.notLastEntry' });
        // The piece goes back to the person: only to whom it could be issued now (not left, not in the veterans).
        await this.recipient(user, record.personId);
        const issuedOn = records.findLast((r) => r.kind === 'issue')?.date ?? record.date;
        Object.assign(item, { status: 'issued', holderId: record.personId, issuedOn });
      }
    }
    this.cancel(user, record, input.reason);
    await em.flush();
    return toIssueDto(record);
  }

  // ----- persons -----

  /** Pieces a person holds, the history of issues and returns and the sizes (person file tab, "my area"). */
  async personClothing(user: AuthenticatedUser, personId: string): Promise<PersonClothing> {
    const person = await this.person(personId);
    const own = user.personId === personId && user.can(SELF);
    if (!own && !this.canForPerson(user, READ, person)) throw new NotFoundException();
    const em = this.em.fork();
    const [items, history, profile] = await Promise.all([
      em.find(ClothingItemEntity, { holderId: personId, status: 'issued' }, { orderBy: { articleKey: 'asc' } }),
      em.find(IssueEntity, { personId }, { orderBy: { date: 'desc', recordedAt: 'desc' } }),
      em.findOne(SizeProfileEntity, { personId }),
    ]);
    return { items: await this.toDtos(em, items), history: history.map(toIssueDto), sizes: profile?.sizes ?? {} };
  }

  /**
   * Clothing sizes of a person by article key; empty sizes and unknown articles are removed. A size must be one of the
   * article's sizes, unless it is the one stored before (recorded before the article's sizes were set).
   */
  async setSizes(user: AuthenticatedUser, personId: string, input: Parsed<typeof SizeProfileInput>): Promise<PersonClothing> {
    const person = await this.person(personId);
    if (!this.canForPerson(user, ISSUE, person)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [ISSUE] });
    const em = this.em.fork();
    const articles = new Map((await em.find(ArticleEntity, {})).map((a) => [a.key, a]));
    const profile = await em.findOne(SizeProfileEntity, { personId });
    const sizes = Object.fromEntries(Object.entries(input.sizes).filter(([key, size]) => size && articles.has(key)));
    for (const [key, size] of Object.entries(sizes)) {
      const article = articles.get(key)!;
      if (article.sizes.length && !article.sizes.includes(size) && profile?.sizes[key] !== size) throw new BadRequestException({ code: 'clothing.unknownSize', articleKey: key, size });
    }
    if (profile) profile.sizes = sizes;
    else em.create(SizeProfileEntity, { personId, sizes });
    await em.flush();
    return this.personClothing(user, personId);
  }

  /** Pieces a person still holds; leaving and the transfer to the veterans are refused while there are any. */
  held(personId: string): Promise<number> {
    return this.em.fork().count(ClothingItemEntity, { holderId: personId, status: 'issued' });
  }
}
