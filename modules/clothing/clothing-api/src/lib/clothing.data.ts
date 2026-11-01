import { Inject, Injectable } from '@nestjs/common';
import { EntityManager, type FilterQuery, wrap } from '@mikro-orm/core';
import { z } from 'zod';
import { type ListColumn, normalizeRfid, type SearchHit } from '@forga/core-contracts';
import { addBerlinDays, type AuthenticatedUser, berlinDate, type DeadlineInput, type DeadlineProvider, type DescribeContext, type ErasureArea, type ErasureAreaInput, HistoryEntry, type ListDefinition, type PersonDataSection, SettingsService, wordsWhere } from '@forga/core-api';
import { ClothingSettings } from '@forga/clothing-contracts';
import { PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { ArticleEntity, CareEntity, ClothingInspectionEntity, ClothingItemEntity, ConsumableReceiptEntity, IssueEntity, SizeProfileEntity } from './clothing.entities.js';
import { ClothingService, ISSUE, MANAGE, READ, SELF } from './clothing.service.js';

const col = (key: string, de: string, en: string, width?: number): ListColumn => ({ key, label: { de, en }, ...(width ? { width } : {}) });
const department = { key: 'departmentId', label: { de: 'Abteilung', en: 'Department' }, type: 'department' as const };
const Filter = z.object({ departmentId: z.uuid().optional(), until: z.iso.date().optional() });
type Filter = z.infer<typeof Filter>;

/** Deadlines (impregnation, inspection), search, export and lists of the clothing store. */
@Injectable()
export class ClothingData implements DeadlineProvider {
  readonly module = 'clothing';

  constructor(
    private readonly em: EntityManager,
    private readonly clothing: ClothingService,
    private readonly settings: SettingsService,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  private async names(): Promise<Map<string, { de: string; en: string }>> {
    return new Map((await this.em.fork().find(ArticleEntity, {})).map((a) => [a.key, a.name]));
  }

  /**
   * Impregnation and inspection per piece (30 days ahead); at once a piece still issued although its last inspection
   * failed (to fetch back and repair); a piece taken back to the laundry and not washed after `laundryReminderDays`.
   */
  async deadlines(): Promise<DeadlineInput[]> {
    const em = this.em.fork();
    const items = await this.clothing.toDtos(em, await em.find(ClothingItemEntity, { status: { $ne: 'retired' } }));
    const names = await this.names();
    const { laundryReminderDays } = ClothingSettings.parse((await this.settings.get('clothing.settings')) ?? {});
    const laundry = items.filter((i) => i.blockedBy.includes('laundry'));
    const returns = laundry.length && laundryReminderDays
      ? await em.find(IssueEntity, { itemId: { $in: laundry.map((i) => i.id) }, kind: 'return', laundry: true, cancelledAt: null })
      : [];
    const deadlines: DeadlineInput[] = [];
    for (const item of items) {
      const name = names.get(item.articleKey) ?? { de: item.articleKey, en: item.articleKey };
      const subject = { type: 'clothing.item', id: item.id, label: `${item.inventoryNumber} ${name.de}` };
      const group = { de: name.de, en: name.en || name.de };
      const to = `/clothing/items/${item.id}`;
      if (item.status === 'issued' && item.blockedBy.includes('inspection') && item.lastInspectedOn) {
        deadlines.push({ id: `defective:${item.id}`, kind: 'clothing-defective', title: { de: 'Stück zurückholen und reparieren lassen', en: 'Fetch back the piece and have it repaired' }, subject, dueOn: item.lastInspectedOn, leadDays: 0, departmentIds: [item.departmentId], permission: ISSUE, group, to });
      }
      const returnedOn = returns.filter((r) => r.itemId === item.id).map((r) => r.date).toSorted().at(-1);
      if (returnedOn) {
        const dueOn = berlinDate(addBerlinDays(new Date(`${returnedOn}T12:00:00Z`), laundryReminderDays));
        deadlines.push({ id: `laundry:${item.id}`, kind: 'clothing-laundry', title: { de: 'Zur Wäsche: Wäsche erfassen', en: 'To the laundry: record the washing' }, subject, dueOn, leadDays: 0, departmentIds: [item.departmentId], permission: ISSUE, group, to });
      }
      if (item.impregnationDueOn) {
        deadlines.push({ id: `impregnation:${item.id}`, kind: 'clothing-impregnation', title: { de: 'Waschen und imprägnieren', en: 'Wash and impregnate' }, subject, dueOn: item.impregnationDueOn, leadDays: 30, departmentIds: [item.departmentId], permission: ISSUE, group });
      }
      if (item.inspectionDueOn) {
        deadlines.push({ id: `inspection:${item.id}`, kind: 'clothing-inspection', title: { de: 'Prüfung Schutzausrüstung', en: 'Inspection of protective equipment' }, subject, dueOn: item.inspectionDueOn, leadDays: 30, departmentIds: [item.departmentId], permission: ISSUE, group });
      }
    }
    return deadlines;
  }

  async search(user: AuthenticatedUser, query: string): Promise<SearchHit[]> {
    const visible = this.clothing.visible(user);
    if (!visible) return [];
    const names = await this.names();
    const words = wordsWhere(query, ['inventoryNumber', 'serialNumber', 'barcode']);
    const found = await this.em.fork().find(ClothingItemEntity, { $and: [visible, { $or: [...(words ? [words] : []), { rfid: { $ilike: `%${normalizeRfid(query) || query}%` } }] }] } as never, { limit: 6 });
    return found.map((i) => this.hit(i, names));
  }

  /**
   * Scanned code: label URL of f.orga, barcode, RFID chip, inventory or serial number (exact, ignoring case).
   * Members with `clothing.self` find the pieces they hold themselves, leading to "My area".
   */
  async code(user: AuthenticatedUser, code: string): Promise<SearchHit[]> {
    const visible = this.clothing.visible(user);
    const own = user.personId && user.can(SELF) ? { holderId: user.personId, status: 'issued' as const } : null;
    if (!visible && !own) return [];
    const label = /\/clothing\/items\/([0-9a-f-]{36})/i.exec(code);
    const exact = code.replace(/[\\%_]/g, '\\$&');
    const where = label
      ? { id: label[1].toLowerCase() }
      : { $or: [{ barcode: { $ilike: exact } }, { rfid: normalizeRfid(code) }, { inventoryNumber: { $ilike: exact } }, { serialNumber: { $ilike: exact } }] };
    const scope = [...(visible ? [visible] : []), ...(own ? [own] : [])];
    const found = await this.em.fork().find(ClothingItemEntity, { $and: [{ $or: scope }, where] } as FilterQuery<ClothingItemEntity>, { limit: 20, orderBy: { inventoryNumber: 'asc' } });
    const names = await this.names();
    return found.map((i) => (visible && user.can(READ, i.departmentId) ? this.hit(i, names) : this.ownHit(i, names)));
  }

  /** A piece the member holds: only article, number and size, opening "My area". */
  private ownHit(i: ClothingItemEntity, names: Map<string, { de: string; en: string }>): SearchHit {
    return { ...this.hit(i, names), to: '/me' };
  }

  private hit(i: ClothingItemEntity, names: Map<string, { de: string; en: string }>): SearchHit {
    const name = names.get(i.articleKey);
    return { id: i.id, group: { de: 'Kleiderkammer', en: 'Clothing store' }, title: `${i.inventoryNumber} ${name?.de ?? i.articleKey}`, description: i.size, to: `/clothing/items/${i.id}` };
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const plain = async <T extends object>(entity: new () => T) => (await em.find(entity, {})).map((e) => wrap(e).toObject());
    return {
      articles: await plain(ArticleEntity),
      items: await plain(ClothingItemEntity),
      issues: await plain(IssueEntity),
      care: await plain(CareEntity),
      inspections: await plain(ClothingInspectionEntity),
      sizeProfiles: await plain(SizeProfileEntity),
      consumableReceipts: await plain(ConsumableReceiptEntity),
    };
  }

  /** Data access request: what was issued to and returned by the person, pieces held now, and the size profile. */
  async exportPerson(personId: string): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    return {
      issues: (await em.find(IssueEntity, { personId }, { orderBy: { date: 'asc', recordedAt: 'asc' } })).map((e) => wrap(e).toObject()),
      heldItems: (await em.find(ClothingItemEntity, { holderId: personId }, { orderBy: { inventoryNumber: 'asc' } })).map((e) => wrap(e).toObject()),
      sizeProfile: (await em.findOne(SizeProfileEntity, { personId }))?.sizes ?? null,
    };
  }

  /**
   * Access report: issues and returns (with notes and cancellation reasons), the pieces the person holds now and the
   * clothing sizes. Who recorded an entry is not named.
   */
  async describePerson(personId: string, ctx: DescribeContext): Promise<PersonDataSection[]> {
    const em = this.em.fork();
    const issues = await em.find(IssueEntity, { personId }, { orderBy: { date: 'desc', recordedAt: 'desc' } });
    const held = await em.find(ClothingItemEntity, { holderId: personId }, { orderBy: { inventoryNumber: 'asc' } });
    const profile = await em.findOne(SizeProfileEntity, { personId });
    const sizes = Object.entries(profile?.sizes ?? {}).filter(([, size]) => size);
    if (!issues.length && !held.length && !sizes.length) return [];
    const names = await this.names();
    const article = (key: string) => {
      const name = names.get(key);
      return name ? ctx.text(name) : ctx.t('Artikel', 'Article');
    };
    const blocks: PersonDataSection['blocks'] = [];
    if (held.length) {
      blocks.push({
        kind: 'table',
        title: ctx.t('Bei Ihnen ausgegebene Stücke', 'Pieces issued to you'),
        columns: [ctx.t('Artikel', 'Article'), ctx.t('Inventarnummer', 'Inventory number'), ctx.t('Größe', 'Size'), ctx.t('Ausgegeben am', 'Issued on')],
        rows: held.map((i) => [article(i.articleKey), i.inventoryNumber, ctx.value(i.size), ctx.date(i.issuedOn)]),
      });
    }
    if (issues.length) {
      blocks.push({
        kind: 'table',
        title: ctx.t('Ausgaben und Rücknahmen', 'Issues and returns'),
        columns: [ctx.t('Datum', 'Date'), ctx.t('Vorgang', 'Action'), ctx.t('Artikel', 'Article'), ctx.t('Inventarnummer', 'Inventory number'), ctx.t('Größe', 'Size'), ctx.t('Menge', 'Quantity'), ctx.t('Bemerkung', 'Remark')],
        rows: issues.map((e) => [
          ctx.date(e.date),
          [
            e.kind === 'issue' ? ctx.t('Ausgabe', 'issue') : ctx.t('Rücknahme', 'return'),
            e.kind === 'return' && e.retire ? ctx.t('ausgesondert', 'retired') : '',
            e.kind === 'return' && e.laundry ? ctx.t('zur Wäsche', 'to the laundry') : '',
            e.cancelledAt ? ctx.t(`storniert am ${ctx.date(e.cancelledAt)}`, `cancelled on ${ctx.date(e.cancelledAt)}`) : '',
          ]
            .filter(Boolean)
            .join(', '),
          article(e.articleKey),
          ctx.value(e.inventoryNumber),
          ctx.value(e.size),
          ctx.number(e.quantity),
          [e.notes, e.cancelReason && ctx.t(`Grund der Stornierung: ${e.cancelReason}`, `reason of the cancellation: ${e.cancelReason}`)].filter(Boolean).join('; ') || '–',
        ]),
      });
    }
    if (sizes.length) {
      blocks.push({ kind: 'fields', title: ctx.t('Ihre Größen', 'Your sizes'), rows: sizes.map(([key, size]) => ({ label: article(key), value: size })) });
    }
    return [
      {
        key: 'clothing',
        title: ctx.t('Kleiderkammer', 'Clothing store'),
        activity: 'clothing.issues',
        categories: [ctx.t('Ausgegebene Schutzausrüstung', 'Issued protective equipment'), ctx.t('Größen', 'Sizes')],
        blocks,
        records: profile ? [{ entity: 'clothing.size_profile', ids: [profile.id], label: ctx.t('Größen', 'Sizes') }] : [],
      },
    ];
  }

  /** Anonymised persons: the size profile is deleted, notes and cancel reasons of their issues are emptied. */
  async anonymize(personIds: readonly string[]): Promise<void> {
    const em = this.em.fork();
    const ids = [...personIds];
    const profiles = await em.find(SizeProfileEntity, { personId: { $in: ids } });
    if (profiles.length) {
      await em.nativeDelete(HistoryEntry, { entity: 'clothing.size_profile', entityId: { $in: profiles.map((p) => p.id) } });
      await em.nativeDelete(SizeProfileEntity, { personId: { $in: ids } });
    }
    const issues = await em.find(IssueEntity, { personId: { $in: ids } });
    if (issues.length) {
      await em.nativeDelete(HistoryEntry, { entity: 'clothing.issue', entityId: { $in: issues.map((i) => i.id) } });
      await em.nativeUpdate(IssueEntity, { personId: { $in: ids } }, { notes: '', cancelReason: '' });
    }
  }

  /**
   * Erasure check: the sizes may be deleted; issues and returns stay for the stock without notes, but only once the
   * person holds no piece any more.
   */
  async erasure(personId: string): Promise<ErasureAreaInput[]> {
    const em = this.em.fork();
    const areas: ErasureAreaInput[] = [];
    const profile = await em.findOne(SizeProfileEntity, { personId });
    if (profile && Object.keys(profile.sizes).length) {
      areas.push({ key: 'clothing.sizes', title: { de: 'Kleiderkammer', en: 'Clothing store' }, data: { de: 'Größen', en: 'Sizes' }, count: 1, outcome: 'delete', keepUntil: null, reason: null });
    }
    const issues = await em.count(IssueEntity, { personId });
    if (issues) {
      const held = await em.count(ClothingItemEntity, { holderId: personId, status: 'issued' });
      areas.push({
        key: 'clothing.issues',
        title: { de: 'Kleiderkammer', en: 'Clothing store' },
        data: { de: `${issues} ${issues === 1 ? 'Ausgabe oder Rücknahme' : 'Ausgaben und Rücknahmen'}`, en: `${issues} ${issues === 1 ? 'issue or return' : 'issues and returns'}` },
        count: issues,
        outcome: held ? 'keep' : 'anonymize',
        keepUntil: null,
        reason: held
          ? { de: `${held} ${held === 1 ? 'Stück ist' : 'Stücke sind'} noch ausgegeben: bis zur Rückgabe`, en: `${held} ${held === 1 ? 'piece is' : 'pieces are'} still issued: until returned` }
          : { de: 'Ausgaben bleiben für den Bestand, ohne Notizen und Stornogründe', en: 'Issues stay for the stock, without notes and cancel reasons' },
      });
    }
    return areas;
  }

  async erase(personId: string, areas: readonly ErasureArea[]): Promise<void> {
    const keys = new Set(areas.map((a) => a.key));
    const em = this.em.fork();
    if (keys.has('clothing.sizes')) {
      const profile = await em.findOne(SizeProfileEntity, { personId });
      if (profile) {
        await em.nativeDelete(HistoryEntry, { entity: 'clothing.size_profile', entityId: profile.id });
        await em.nativeDelete(SizeProfileEntity, { id: profile.id });
      }
    }
    if (keys.has('clothing.issues')) {
      const issues = await em.find(IssueEntity, { personId }, { fields: ['id'] });
      if (issues.length) await em.nativeDelete(HistoryEntry, { entity: 'clothing.issue', entityId: { $in: issues.map((i) => i.id) } });
      await em.nativeUpdate(IssueEntity, { personId }, { notes: '', cancelReason: '' });
    }
  }

  lists(): ListDefinition<never>[] {
    return [this.issued(), this.due()] as ListDefinition<never>[];
  }

  /** Pieces issued to persons, e.g. to check before someone leaves. */
  private issued(): ListDefinition<Filter> {
    return {
      id: 'clothing.issued',
      name: { de: 'Ausgegebene Schutzausrüstung', en: 'Issued protective equipment' },
      permission: MANAGE,
      personalData: 'names',
      parameters: [department],
      schema: Filter,
      columns: [col('person', 'Person', 'Person', 2), col('article', 'Artikel', 'Article', 2), col('number', 'Inventar-Nr.', 'Inventory no.'), col('size', 'Größe', 'Size', 0.6), col('issuedOn', 'Ausgegeben', 'Issued')],
      rows: async (user, params, language) => {
        const names = await this.names();
        const issued = (await this.clothing.items(user, { status: 'issued' })).filter((i) => !params.departmentId || i.departmentId === params.departmentId);
        // Persons whose processing is restricted (Art. 18) are left out.
        const restricted = await this.directory.restrictedIds([...new Set(issued.map((i) => i.holderId!))]);
        const items = issued.filter((i) => !restricted.has(i.holderId!));
        const persons = new Map((await this.directory.snapshots([...new Set(items.map((i) => i.holderId!))])).map((p) => [p.id, `${p.lastName}, ${p.firstName}`]));
        return {
          personIds: [...persons.keys()],
          rows: items
            .map((i) => ({ person: persons.get(i.holderId ?? '') ?? '', article: names.get(i.articleKey)?.[language] ?? i.articleKey, number: i.inventoryNumber, size: i.size, issuedOn: i.issuedOn }))
            .toSorted((a, b) => a.person.localeCompare(b.person, 'de') || a.article.localeCompare(b.article, 'de')),
        };
      },
    };
  }

  /** Impregnations and inspections due until a date (default in 30 days). */
  private due(): ListDefinition<Filter> {
    return {
      id: 'clothing.due',
      name: { de: 'Fällige Wäsche und Prüfungen', en: 'Washing and inspections due' },
      permission: MANAGE,
      personalData: 'names',
      parameters: [{ key: 'until', label: { de: 'Fällig bis', en: 'Due until' }, type: 'date' }, department],
      schema: Filter,
      columns: [col('due', 'Fällig', 'Due'), col('what', 'Was', 'What', 1.5), col('article', 'Artikel', 'Article', 2), col('number', 'Inventar-Nr.', 'Inventory no.'), col('holder', 'Bei', 'Held by', 2)],
      rows: async (user, params, language) => {
        const until = params.until ?? berlinDate(new Date(Date.now() + 30 * 86_400_000));
        const names = await this.names();
        const items = (await this.clothing.items(user, {})).filter((i) => !params.departmentId || i.departmentId === params.departmentId);
        const holders = [...new Set(items.flatMap((i) => (i.holderId ? [i.holderId] : [])))];
        // The piece is due anyway; a holder whose processing is restricted (Art. 18) is not named.
        const restricted = await this.directory.restrictedIds(holders);
        const persons = new Map((await this.directory.snapshots(holders)).filter((p) => !restricted.has(p.id)).map((p) => [p.id, `${p.lastName}, ${p.firstName}`]));
        const what = { impregnation: { de: 'Waschen und imprägnieren', en: 'Wash and impregnate' }, inspection: { de: 'Prüfung', en: 'Inspection' } };
        const dueItems = items.flatMap((i) => [
          ...(i.impregnationDueOn && i.impregnationDueOn <= until ? [{ due: i.impregnationDueOn, what: what.impregnation[language], i }] : []),
          ...(i.inspectionDueOn && i.inspectionDueOn <= until ? [{ due: i.inspectionDueOn, what: what.inspection[language], i }] : []),
        ]);
        return {
          subtitle: `≤ ${until}`,
          personIds: [...new Set(dueItems.flatMap(({ i }) => (i.holderId && persons.has(i.holderId) ? [i.holderId] : [])))],
          rows: dueItems
            .map(({ due, what: w, i }) => ({ due, what: w, article: names.get(i.articleKey)?.[language] ?? i.articleKey, number: i.inventoryNumber, holder: i.holderId ? (persons.get(i.holderId) ?? '') : '' }))
            .toSorted((a, b) => String(a.due).localeCompare(String(b.due))),
        };
      },
    };
  }

  /** Departments still referenced by pieces cannot be deleted. */
  async countDepartment(id: string): Promise<number> {
    return this.em.fork().count(ClothingItemEntity, { departmentId: id, status: { $ne: 'retired' } });
  }
}
