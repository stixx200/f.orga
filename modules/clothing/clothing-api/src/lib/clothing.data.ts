import { Inject, Injectable } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { z } from 'zod';
import { type ListColumn, normalizeRfid, type SearchHit } from '@forga/core-contracts';
import { type AuthenticatedUser, berlinDate, type DeadlineInput, type DeadlineProvider, type ListDefinition, wordsWhere } from '@forga/core-api';
import { PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { ArticleEntity, CareEntity, ClothingInspectionEntity, ClothingItemEntity, IssueEntity } from './clothing.entities.js';
import { ClothingService, ISSUE, READ } from './clothing.service.js';

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
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  private async names(): Promise<Map<string, { de: string; en: string }>> {
    return new Map((await this.em.fork().find(ArticleEntity, {})).map((a) => [a.key, a.name]));
  }

  async deadlines(): Promise<DeadlineInput[]> {
    const em = this.em.fork();
    const items = await this.clothing.toDtos(em, await em.find(ClothingItemEntity, { status: { $ne: 'retired' } }));
    const names = await this.names();
    const deadlines: DeadlineInput[] = [];
    for (const item of items) {
      const name = names.get(item.articleKey) ?? { de: item.articleKey, en: item.articleKey };
      const subject = { type: 'clothing.item', id: item.id, label: `${item.inventoryNumber} ${name.de}` };
      const group = { de: name.de, en: name.en || name.de };
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

  /** Scanned code: label URL of f.orga, barcode, RFID chip, inventory or serial number (exact, ignoring case). */
  async code(user: AuthenticatedUser, code: string): Promise<SearchHit[]> {
    const visible = this.clothing.visible(user);
    if (!visible) return [];
    const label = /\/clothing\/items\/([0-9a-f-]{36})/i.exec(code);
    const exact = code.replace(/[\\%_]/g, '\\$&');
    const where = label
      ? { id: label[1].toLowerCase() }
      : { $or: [{ barcode: { $ilike: exact } }, { rfid: normalizeRfid(code) }, { inventoryNumber: { $ilike: exact } }, { serialNumber: { $ilike: exact } }] };
    const found = await this.em.fork().find(ClothingItemEntity, { $and: [visible, where] }, { limit: 20, orderBy: { inventoryNumber: 'asc' } });
    const names = await this.names();
    return found.map((i) => this.hit(i, names));
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
    };
  }

  lists(): ListDefinition<never>[] {
    return [this.issued(), this.due()] as ListDefinition<never>[];
  }

  /** Pieces issued to persons, e.g. to check before someone leaves. */
  private issued(): ListDefinition<Filter> {
    return {
      id: 'clothing.issued',
      name: { de: 'Ausgegebene Schutzausrüstung', en: 'Issued protective equipment' },
      permission: READ,
      parameters: [department],
      schema: Filter,
      columns: [col('person', 'Person', 'Person', 2), col('article', 'Artikel', 'Article', 2), col('number', 'Inventar-Nr.', 'Inventory no.'), col('size', 'Größe', 'Size', 0.6), col('issuedOn', 'Ausgegeben', 'Issued')],
      rows: async (user, params, language) => {
        const names = await this.names();
        const items = (await this.clothing.items(user, { status: 'issued' })).filter((i) => !params.departmentId || i.departmentId === params.departmentId);
        const persons = new Map((await this.directory.snapshots([...new Set(items.map((i) => i.holderId!))])).map((p) => [p.id, `${p.lastName}, ${p.firstName}`]));
        return {
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
      permission: ISSUE,
      parameters: [{ key: 'until', label: { de: 'Fällig bis', en: 'Due until' }, type: 'date' }, department],
      schema: Filter,
      columns: [col('due', 'Fällig', 'Due'), col('what', 'Was', 'What', 1.5), col('article', 'Artikel', 'Article', 2), col('number', 'Inventar-Nr.', 'Inventory no.'), col('holder', 'Bei', 'Held by', 2)],
      rows: async (user, params, language) => {
        const until = params.until ?? berlinDate(new Date(Date.now() + 30 * 86_400_000));
        const names = await this.names();
        const items = (await this.clothing.items(user, {})).filter((i) => !params.departmentId || i.departmentId === params.departmentId);
        const persons = new Map((await this.directory.snapshots([...new Set(items.flatMap((i) => (i.holderId ? [i.holderId] : [])))])).map((p) => [p.id, `${p.lastName}, ${p.firstName}`]));
        const what = { impregnation: { de: 'Waschen und imprägnieren', en: 'Wash and impregnate' }, inspection: { de: 'Prüfung', en: 'Inspection' } };
        return {
          subtitle: `≤ ${until}`,
          rows: items
            .flatMap((i) => [
              ...(i.impregnationDueOn && i.impregnationDueOn <= until ? [{ due: i.impregnationDueOn, what: what.impregnation[language], i }] : []),
              ...(i.inspectionDueOn && i.inspectionDueOn <= until ? [{ due: i.inspectionDueOn, what: what.inspection[language], i }] : []),
            ])
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
