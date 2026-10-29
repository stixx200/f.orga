import { Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { zipSync } from 'fflate';
import type { BrigadeSettings, Language, ListData } from '@forga/core-contracts';
import { AttachmentEntity } from '../attachments/attachments.js';
import { renderCsv, renderLetterPdf, renderPdf } from '../lists/renderers.js';
import { brigadeLogoDataUrl } from '../settings/assets.js';
import { SettingsService } from '../settings/settings.js';
import { RetentionCaseEntity } from './retention-case.entity.js';
import { type RetentionExportRecord, RetentionRegistry } from './retention-registry.js';

const TEXTS = {
  de: {
    list: 'Anbietungsverzeichnis',
    listSubtitle: (archive: string, date: string) => `Angeboten an: ${archive} · ${date}`,
    overview: 'uebersicht.csv',
    listFile: 'anbietungsverzeichnis.pdf',
    data: 'daten.json',
    record: 'datensatz.pdf',
    attachments: 'anhaenge',
    columns: { number: 'Nr.', category: 'Kategorie', record: 'Datensatz', dueSince: 'Fällig seit', reason: 'Grund', attachments: 'Anhänge', folder: 'Ordner' },
    allData: 'Alle gespeicherten Daten',
    noRecord: 'Der Datensatz ist in f.orga nicht mehr vorhanden.',
  },
  en: {
    list: 'List of records offered',
    listSubtitle: (archive: string, date: string) => `Offered to: ${archive} · ${date}`,
    overview: 'overview.csv',
    listFile: 'offer-list.pdf',
    data: 'data.json',
    record: 'record.pdf',
    attachments: 'attachments',
    columns: { number: 'No.', category: 'Category', record: 'Record', dueSince: 'Due since', reason: 'Reason', attachments: 'Attachments', folder: 'Folder' },
    allData: 'All stored data',
    noRecord: 'The record no longer exists in f.orga.',
  },
} satisfies Record<Language, unknown>;

/** Readable lines `path: value` of nested data, for the appendix of the record PDF. */
export function flatten(value: unknown, path = '', lines: [string, string][] = []): [string, string][] {
  if (Array.isArray(value)) {
    if (!value.length) return lines;
    value.forEach((item, index) => flatten(item, `${path}[${index + 1}]`, lines));
  } else if (value && typeof value === 'object' && !(value instanceof Date)) {
    for (const [key, item] of Object.entries(value)) flatten(item, path ? `${path}.${key}` : key, lines);
  } else if (value !== null && value !== undefined && value !== '') {
    lines.push([path, value instanceof Date ? value.toISOString() : String(value)]);
  }
  return lines;
}

/** Two columns „label: value“ for the record PDF. */
const table = (rows: [string, string][]) =>
  rows.length
    ? {
        table: { widths: [150, '*'], body: rows.map(([key, value]) => [{ text: key, bold: true, fontSize: 8 }, { text: value, fontSize: 9 }]) },
        layout: 'lightHorizontalLines',
      }
    : { text: '–' };

/** A file name without characters other systems stumble over. */
const safe = (name: string) => name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(0, 80) || 'datei';

/**
 * Export for the archive: one PDF per record (readable, with the brigade header), its attachments, a CSV overview, all data
 * as JSON (`forga.export`) and the list of records offered as PDF, together as ZIP. The format is a start; the archive may
 * ask for another one (e.g. PDF/A).
 */
@Injectable()
export class RetentionExport {
  constructor(
    private readonly em: EntityManager,
    private readonly registry: RetentionRegistry,
    private readonly settings: SettingsService,
  ) {}

  async offer(offerId: string, language: Language): Promise<{ fileName: string; zip: Buffer; count: number }> {
    const em = this.em.fork();
    const cases = await em.find(RetentionCaseEntity, { offerId }, { orderBy: { category: 'asc', dueSince: 'asc' } });
    if (!cases.length) throw new NotFoundException({ code: 'retention.offerNotFound' });
    const text = TEXTS[language];
    const now = new Date();
    const brigade = await this.settings.get<BrigadeSettings>('brigade');
    const logo = await brigadeLogoDataUrl(this.em);
    const records = new Map<string, RetentionExportRecord>();
    for (const category of new Set(cases.map((c) => c.category))) {
      const definition = this.registry.categories.get(category);
      if (!definition) continue;
      for (const record of await definition.export(cases.filter((c) => c.category === category).map((c) => c.recordId))) records.set(`${category}|${record.id}`, record);
    }
    const files: Record<string, Uint8Array> = {};
    const rows: ListData['rows'] = [];
    const json: Record<string, unknown>[] = [];
    let index = 0;
    for (const c of cases) {
      index++;
      const definition = this.registry.categories.get(c.category);
      const categoryName = definition?.name[language] ?? c.category;
      const record = records.get(`${c.category}|${c.recordId}`);
      const folder = `${String(index).padStart(3, '0')}-${safe(record?.title ?? c.neutralLabel)}`;
      const attachments = record ? [...(await this.attachments(em, record)), ...(record.files ?? []).map((f) => ({ fileName: f.name, data: f.data }))] : [];
      rows.push({
        number: index,
        category: categoryName,
        record: record?.title ?? c.label,
        dueSince: c.dueSince,
        reason: c.reason?.[language] ?? '',
        attachments: attachments.length,
        folder,
      });
      json.push({ category: c.category, caseId: c.id, recordId: c.recordId, dueSince: c.dueSince, data: record?.data ?? null, attachments: attachments.map((a) => a.fileName) });
      files[`${folder}/${text.record}`] = await this.recordPdf(record, categoryName, c.label, brigade, logo, language, now);
      const used = new Set<string>();
      for (const attachment of attachments) {
        let name = safe(attachment.fileName);
        while (used.has(name)) name = `${used.size}-${name}`;
        used.add(name);
        files[`${folder}/${text.attachments}/${name}`] = Buffer.from(attachment.data);
      }
    }
    const first = cases[0];
    const date = (first.offeredAt ?? now).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-GB', { timeZone: 'Europe/Berlin' });
    const list: ListData = {
      title: text.list,
      subtitle: text.listSubtitle(first.archive ?? '', date),
      columns: (['number', 'category', 'record', 'dueSince', 'reason', 'attachments'] as const).map((key) => ({
        key,
        label: { de: TEXTS.de.columns[key], en: TEXTS.en.columns[key] },
        width: key === 'record' ? 3 : key === 'number' || key === 'attachments' ? 0.6 : 1.4,
      })),
      rows,
    };
    const context = { data: list, language, brigade, signatureColumn: false, orientation: 'landscape' as const, now, logo };
    files[text.listFile] = await renderPdf(context);
    files[text.overview] = renderCsv({ ...context, data: { ...list, columns: [...list.columns, { key: 'folder', label: { de: TEXTS.de.columns.folder, en: TEXTS.en.columns.folder } }] } });
    files[text.data] = Buffer.from(
      JSON.stringify({ format: 'forga.export', version: 1, kind: 'retention-offer', offerId, archive: first.archive, exportedAt: now.toISOString(), records: json }, null, 2),
      'utf8',
    );
    const zip = Buffer.from(zipSync(files, { level: 6, mtime: now }));
    return { fileName: `forga-${language === 'de' ? 'anbietung' : 'offer'}-${now.toISOString().slice(0, 10)}.zip`, zip, count: cases.length };
  }

  private async attachments(em: EntityManager, record: RetentionExportRecord): Promise<{ fileName: string; data: Uint8Array }[]> {
    if (!record.attachments.length) return [];
    return em.find(AttachmentEntity, { $or: record.attachments.map((a) => ({ ownerType: a.ownerType, ownerId: a.ownerId })) }, { populate: ['data'], orderBy: { createdAt: 'asc' } });
  }

  private recordPdf(record: RetentionExportRecord | undefined, category: string, label: string, brigade: BrigadeSettings | null, logo: string | null, language: Language, now: Date): Promise<Buffer> {
    const text = TEXTS[language];
    const content: unknown[] = [
      { text: category, style: 'small' },
      { text: record?.title ?? label, style: 'title' },
      ...(record
        ? [
            table(record.fields.filter((f) => f.value).map((f) => [f.label[language], f.value])),
            { text: text.allData, style: 'heading', margin: [0, 16, 0, 4] },
            table(flatten(record.data)),
          ]
        : [{ text: text.noRecord }]),
    ];
    return renderLetterPdf({ brigade, letterhead: null, logo, title: category, content, language, now });
  }
}
