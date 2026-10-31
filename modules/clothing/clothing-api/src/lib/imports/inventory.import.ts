import { Inject, Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type ImportContext, type ImportLookup, type ImportProfile, type ImportRow, type ImportRunResult, normalizeHeading, parseDate } from '@forga/core-api';
import type { ImportRowResult } from '@forga/core-contracts';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { ArticleEntity, ClothingItemEntity, IssueEntity } from '../clothing.entities.js';
import { MANAGE } from '../clothing.service.js';

const field = (key: string, de: string, en: string, aliases: string[], required = false) => ({ key, label: { de, en }, required, aliases });

/** Usual names from MP-Feuer for the articles of the clothing template. */
const ARTICLE_ALIASES: [RegExp, string][] = [
  [/atemschutz.*hose|ueberhose|überhose/, 'breathing-apparatus-trousers'],
  [/jacke/, 'jacket'],
  [/hose|latzhose/, 'trousers'],
  [/stiefel/, 'boots'],
  [/helm/, 'helmet'],
  [/haube|flammschutz/, 'hood'],
  [/handschuh/, 'gloves'],
  [/mütze|muetze/, 'cap'],
  [/t-?shirt/, 't-shirt'],
];

const nameKey = (text: string) => text.toLowerCase().split(/[\s,]+/).filter(Boolean).toSorted().join(' ');

/** Pieces of the clothing store, e.g. from the MP-Feuer clothing list, with the person holding one. */
@Injectable()
export class ClothingInventoryImport {
  constructor(
    private readonly em: EntityManager,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  profile(): ImportProfile {
    return {
      id: 'clothing.inventory',
      name: { de: 'Kleiderkammer', en: 'Clothing store' },
      description: {
        de: 'Eine Zeile je Kleidungsstück. Die Bezeichnung wird einem Artikel zugeordnet (z. B. „Einsatz-Jacke“ → Einsatzjacke); unbekannte Bezeichnungen lassen sich nach der Prüfung zuordnen. Eine Person und ein Datum geben das Stück aus. Vorhandene Inventarnummern bleiben unverändert.',
        en: 'One row per piece of clothing. The name is matched to an article (e.g. "Einsatz-Jacke" → turnout jacket); unknown names can be assigned after the check. A person and a date issue the piece. Existing inventory numbers stay unchanged.',
      },
      permission: MANAGE,
      fields: [
        field('inventoryNumber', 'Inventarnummer', 'Inventory number', ['Inventar-Nr.', 'Nummer'], true),
        field('article', 'Artikel', 'Article', ['Bezeichnung', 'Artikel'], true),
        field('size', 'Größe', 'Size', ['Größe', 'Groesse']),
        field('department', 'Abteilung', 'Department', ['Abteilung', 'Abt.'], true),
        field('manufacturer', 'Hersteller', 'Manufacturer', ['Hersteller']),
        field('serialNumber', 'Seriennummer', 'Serial number', ['Seriennummer', 'Hersteller-Nr.']),
        field('barcode', 'Barcode', 'Barcode', ['Barcode']),
        field('personName', 'Träger', 'Holder', ['Name', 'Träger', 'Zugeteilt']),
        field('issuedOn', 'Ausgegeben am', 'Issued on', ['Ausgabe', 'zugeteilt am']),
      ],
      run: (rows, context) => this.run(rows, context),
    };
  }

  lookups(): ImportLookup[] {
    return [{
      kind: 'clothing-article',
      name: { de: 'Artikel der Kleiderkammer', en: 'Clothing articles' },
      keyFormat: 'slug',
      entries: async () => (await this.em.fork().find(ArticleEntity, { active: true }, { orderBy: { sortOrder: 'asc' } })).map((a) => ({ key: a.key, name: a.name })),
      all: async () => (await this.em.fork().find(ArticleEntity, {})).map((a) => ({ key: a.key, name: a.name })),
    }];
  }

  private async run(rows: ImportRow[], context: ImportContext): Promise<ImportRunResult> {
    const { user, dryRun } = context;
    const em = this.em.fork();
    const articles = await em.find(ArticleEntity, {});
    const departments = await this.organization.departments();
    const persons = await this.directory.memberPeriods();
    const results: ImportRowResult[] = [];
    for (const { row, values } of rows) {
      const label = `${values['inventoryNumber'] ?? ''} ${values['article'] ?? ''}`.trim();
      const fail = (code: string, params?: Record<string, string>) => results.push({ row, action: 'error', label, messages: [{ code, params }] });
      const inventoryNumber = (values['inventoryNumber'] ?? '').trim();
      if (!inventoryNumber) { fail('clothing.inventoryNumberRequired'); continue; }
      const stored = await em.findOne(ClothingItemEntity, { inventoryNumber });
      if (stored) { results.push({ row, action: 'unchanged', label, messages: [] }); continue; }

      const departmentName = (values['department'] ?? '').trim();
      const department = this.department(departments, departmentName, context);
      const articleName = (values['article'] ?? '').trim();
      const article = this.article(articles, articleName, context);
      if (!department || !article) {
        results.push({
          row,
          action: 'error',
          label,
          messages: [
            ...(!department ? [{ code: 'masterdata.import.unknownDepartment', params: { name: departmentName } }] : []),
            ...(!article ? [{ code: 'clothing.unknownArticle', params: { name: articleName } }] : []),
          ],
        });
        continue;
      }
      if (!user.can(MANAGE, department.id)) { fail('auth.forbidden'); continue; }
      if (article.kind !== 'inventory') { fail('clothing.notInventoried'); continue; }
      const size = (values['size'] ?? '').trim();
      if (size && article.sizes.length && !article.sizes.includes(size)) { fail('clothing.unknownSize', { size }); continue; }
      const issuedOn = (values['issuedOn'] ?? '').trim();
      const issued = issuedOn ? parseDate(issuedOn) : null;
      if (issuedOn && !issued) { fail('imports.invalidDate'); continue; }
      const messages: ImportRowResult['messages'] = [];
      const holderName = (values['personName'] ?? '').trim();
      const holders = issued && holderName ? persons.filter((p) => nameKey(`${p.lastName} ${p.firstName}`) === nameKey(holderName)) : [];
      const holder = holders.length === 1 ? holders[0] : undefined;
      if (holderName && !holder) messages.push({ code: 'masterdata.import.unknownPerson', params: { name: holderName } });

      if (!dryRun) {
        const item = em.create(ClothingItemEntity, {
          articleKey: article.key,
          inventoryNumber,
          size,
          serialNumber: values['serialNumber'] ?? '',
          barcode: (values['barcode'] ?? '').trim() || null,
          rfid: null,
          manufacturer: values['manufacturer'] ?? '',
          purchasedOn: null,
          departmentId: department.id,
          notes: '',
          status: holder && issued ? 'issued' : 'stock',
          holderId: holder && issued ? holder.id : null,
          issuedOn: holder && issued ? issued : null,
          createdOn: issued ?? new Date().toISOString().slice(0, 10),
        });
        if (holder && issued) {
          em.create(IssueEntity, {
            personId: holder.id, kind: 'issue', articleKey: article.key, itemId: item.id, inventoryNumber, size, quantity: 1,
            date: issued, notes: '', retire: false, laundry: false, recordedBy: user.displayName, recordedById: user.id, recordedAt: new Date(),
          });
        }
      }
      results.push({ row, action: 'create', label, messages });
    }
    if (!dryRun) await em.flush();
    const counts = { create: 0, update: 0, unchanged: 0, error: 0 };
    for (const r of results) counts[r.action]++;
    return { dryRun, counts, rows: results };
  }

  private article(articles: ArticleEntity[], name: string, context: ImportContext): ArticleEntity | undefined {
    const mappedKey = name ? context.mapped('clothing-article', name) : undefined;
    const mapped = mappedKey ? articles.find((a) => a.key === mappedKey) : undefined;
    if (mapped) return mapped;
    const alias = ARTICLE_ALIASES.find(([pattern]) => pattern.test(name.toLowerCase()))?.[1];
    const wanted = normalizeHeading(alias ?? name);
    const found = articles.find((a) => [a.key, a.name.de, a.name.en].some((n) => normalizeHeading(n) === wanted));
    if (found) return found;
    if (name) context.unmatched('clothing-article', name);
    return undefined;
  }

  private department(departments: { id: string; name: string; shortName: string }[], name: string, context: ImportContext) {
    const text = name.trim().toLowerCase();
    const stripped = text.replace(/^(abteilung|abt\.?)\s*/, '');
    const found = departments.find((d) => [d.name, d.shortName].some((n) => n.toLowerCase() === text || n.toLowerCase() === stripped));
    if (found) return found;
    const id = context.mapped('department', name);
    const mapped = id ? departments.find((d) => d.id === id) : undefined;
    if (mapped) return mapped;
    context.unmatched('department', name);
    return undefined;
  }
}
