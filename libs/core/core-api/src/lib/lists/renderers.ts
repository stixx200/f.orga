import ExcelJS from 'exceljs';
import pdfmake from 'pdfmake';
import type { BrigadeSettings, Language, ListCell, ListColumn, ListData } from '@forga/core-contracts';

/** Colors from the style guide (Stil.md). */
const SERVICE_RED = '#8C1D18';
const TEXT = '#222222';
const META = '#595959';
const ALTERNATE_ROW = '#FBF7F6';
const GRID = '#E0D2D0';

const SIGNATURE_LABEL = { de: 'Unterschrift', en: 'Signature' } as const;
const PAGE_LABEL = { de: 'Seite', en: 'Page' } as const;
const CREATED_LABEL = { de: 'Erstellt am', en: 'Created on' } as const;
const PURPOSE_LABEL = { de: 'Zweck', en: 'Purpose' } as const;
/** Footer of lists naming persons (L11 of the data protection concept). */
export const PERSONAL_DATA_NOTICE = {
  de: 'Personenbezogene Daten – nur für den Dienstgebrauch, nach Gebrauch vernichten',
  en: 'Personal data – for official use only, destroy after use',
} as const;

// Helvetica is one of the PDF standard fonts (no embedding) and the fallback named in Stil.md.
const HELVETICA = { normal: 'Helvetica', bold: 'Helvetica-Bold', italics: 'Helvetica-Oblique', bolditalics: 'Helvetica-BoldOblique' };
const STANDARD_FONTS = new Set(Object.values(HELVETICA));
pdfmake.addFonts({ Helvetica: HELVETICA });
// Documents never load external resources; the only "local" resources are the standard font names.
pdfmake.setUrlAccessPolicy(() => false);
(pdfmake as unknown as { setLocalAccessPolicy(policy: (path: string) => boolean): void }).setLocalAccessPolicy((path) =>
  STANDARD_FONTS.has(path),
);

export interface RenderContext {
  data: ListData;
  language: Language;
  brigade: BrigadeSettings | null;
  signatureColumn: boolean;
  orientation: 'portrait' | 'landscape';
  /** Reference time for the "created on" line. */
  now: Date;
  /** Coat of arms as data URL (PNG/JPEG), shown at the right of the page header. */
  logo?: string | null;
}

/** Formats a cell for display: ISO dates per language, booleans as words. */
export function formatCell(value: ListCell, language: Language): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return language === 'de' ? (value ? 'ja' : 'nein') : value ? 'yes' : 'no';
  if (typeof value === 'number') return value.toLocaleString(language === 'de' ? 'de-DE' : 'en-GB');
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (date) return language === 'de' ? `${date[3]}.${date[2]}.${date[1]}` : value;
  return value;
}

function columnsWithSignature(context: RenderContext): ListColumn[] {
  const columns = context.data.columns;
  return context.signatureColumn
    ? [...columns, { key: '__signature', label: SIGNATURE_LABEL, width: 2.5 }]
    : columns;
}

function footerLines(brigade: BrigadeSettings | null): string[] {
  if (!brigade) return [];
  const address = [brigade.name, brigade.street, [brigade.postalCode, brigade.city].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(' · ');
  const contact = [
    brigade.phone && `Telefon ${brigade.phone}`,
    brigade.fax && `Fax ${brigade.fax}`,
    brigade.website,
  ]
    .filter(Boolean)
    .join(' · ');
  return [address, contact].filter(Boolean);
}

function timestamp(now: Date, language: Language): string {
  return now.toLocaleString(language === 'de' ? 'de-DE' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Europe/Berlin',
  });
}

function escapeCsv(text: string): string {
  return /[";\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * Text that a spreadsheet would read as a formula (`=`, `+`, `-`, `@`, tab, carriage return) gets a leading
 * apostrophe, so a name like `=HYPERLINK(…)` stays text. Numbers are not affected.
 */
export function csvText(value: unknown, formatted: string): string {
  return typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${formatted}` : formatted;
}

/** CSV with semicolons and a BOM, so German Excel opens it correctly. */
export function renderCsv(context: RenderContext): Buffer {
  const columns = context.data.columns;
  const lines = [
    columns.map((c) => escapeCsv(c.label[context.language])).join(';'),
    ...context.data.rows.map((row) => columns.map((c) => escapeCsv(csvText(row[c.key], formatCell(row[c.key] ?? null, context.language)))).join(';')),
  ];
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

export async function renderXlsx(context: RenderContext): Promise<Buffer> {
  const { data, language } = context;
  const columns = columnsWithSignature(context);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'f.orga';
  const sheet = workbook.addWorksheet(data.title.slice(0, 31) || 'Liste', {
    pageSetup: { paperSize: 9, orientation: context.orientation, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    views: [{ state: 'frozen', ySplit: (data.subtitle ? 4 : 3) + (data.purpose ? 1 : 0) }],
    ...(data.personalData ? { headerFooter: { oddFooter: `&L${PERSONAL_DATA_NOTICE[language]}&RSeite &P/&N`.replace('Seite', PAGE_LABEL[language]) } } : {}),
  });

  sheet.addRow([data.title]).font = { name: 'Arial', bold: true, size: 14, color: { argb: 'FF8C1D18' } };
  sheet.addRow([data.subtitle ?? `${CREATED_LABEL[language]} ${timestamp(context.now, language)}`]).font = {
    name: 'Arial',
    size: 10,
    color: { argb: 'FF595959' },
  };
  if (data.subtitle) sheet.addRow([`${CREATED_LABEL[language]} ${timestamp(context.now, language)}`]).font = { name: 'Arial', size: 10, color: { argb: 'FF595959' } };
  if (data.purpose) sheet.addRow([`${PURPOSE_LABEL[language]}: ${data.purpose}`]).font = { name: 'Arial', size: 10, color: { argb: 'FF595959' } };

  const header = sheet.addRow(columns.map((c) => c.label[language].toUpperCase()));
  header.eachCell((cell) => {
    cell.font = { name: 'Arial', bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8C1D18' } };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0D2D0' } } };
  });

  data.rows.forEach((row, index) => {
    const excelRow = sheet.addRow(
      columns.map((c) => {
        const value = row[c.key] ?? null;
        return typeof value === 'number' ? value : formatCell(value, language);
      }),
    );
    excelRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF222222' } };
      cell.alignment = { vertical: 'top', wrapText: true };
      cell.border = { bottom: { style: 'thin', color: { argb: 'FFE0D2D0' } } };
      if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBF7F6' } };
    });
    if (context.signatureColumn) excelRow.height = 24;
  });

  if (data.personalData) {
    sheet.addRow([]);
    sheet.addRow([PERSONAL_DATA_NOTICE[language]]).font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF595959' } };
  }
  columns.forEach((c, i) => {
    sheet.getColumn(i + 1).width = Math.round(14 * (c.width ?? 1));
  });
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** Image node for a data URL: PNG/JPEG as image, SVG as vector graphic. */
function picture(dataUrl: string, size: number): Record<string, unknown> {
  const svg = /^data:image\/svg\+xml;base64,(.*)$/.exec(dataUrl);
  return svg ? { svg: Buffer.from(svg[1], 'base64').toString('utf8'), fit: [size, size] } : { image: dataUrl, fit: [size, size] };
}

/** Page frame of all documents (Stil.md): coat of arms at the left, brigade name and title, a line in the service color. */
interface Frame {
  brigade: BrigadeSettings | null;
  logo?: string | null;
  title: string;
  language: Language;
  now: Date;
  /** Width of the text area in points. */
  width: number;
  margin: number;
  /** Smaller title, e.g. for long titles naming a person. */
  compactTitle?: boolean;
  /** Line above the address in the footer, e.g. the note on personal data. */
  notice?: string;
}

function pageHeader(frame: Frame): Record<string, unknown> {
  return {
    margin: [frame.margin, 22, frame.margin, 0],
    stack: [
      {
        columns: [
          ...(frame.logo ? [{ ...picture(frame.logo, 38), width: 38, margin: [0, 0, 10, 0] }] : []),
          {
            width: '*',
            stack: [
              { text: frame.brigade?.name ?? '', color: SERVICE_RED, bold: true, fontSize: 8, characterSpacing: 0.3 },
              { text: frame.title, color: SERVICE_RED, bold: true, fontSize: frame.compactTitle ? 11 : 15, margin: [0, 2, 0, 0] },
            ],
            margin: [0, frame.logo ? 4 : 0, 0, 0],
          },
        ],
      },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: frame.width, y2: 0, lineColor: SERVICE_RED, lineWidth: 1.2 }], margin: [0, 6, 0, 0] },
    ],
  };
}

function pageFooter(frame: Frame, page: number, pages: number): Record<string, unknown> {
  return {
    margin: [frame.margin, 12, frame.margin, 0],
    stack: [
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: frame.width, y2: 0, lineColor: SERVICE_RED, lineWidth: 1 }] },
      {
        columns: [
          {
            stack: [
              ...(frame.notice ? [{ text: frame.notice, fontSize: 7, bold: true, color: TEXT }] : []),
              ...footerLines(frame.brigade).map((line) => ({ text: line, fontSize: 7, color: META })),
            ],
            width: '*',
          },
          {
            stack: [
              { text: `${PAGE_LABEL[frame.language]} ${page}/${pages}`, alignment: 'right', fontSize: 7, color: META },
              { text: `${CREATED_LABEL[frame.language]} ${timestamp(frame.now, frame.language)}`, alignment: 'right', fontSize: 7, color: META },
            ],
            width: 'auto',
          },
        ],
        margin: [0, 4, 0, 0],
      },
    ],
  };
}

/** Approximate glyph width of Helvetica in em: narrow, capitals, digits and the rest. */
function glyph(char: string): number {
  if (/[iljtf.,:;'|!()[\] ]/.test(char)) return 0.3;
  if (/[mwMW]/.test(char)) return 0.85;
  if (/[A-ZÄÖÜ]/.test(char)) return 0.68;
  if (/[0-9]/.test(char)) return 0.56;
  return 0.52;
}

/** Text width in points (bold glyphs are about 6 % wider). */
const textWidth = (text: string, size: number, bold = false) => [...text].reduce((sum, c) => sum + glyph(c), 0) * size * (bold ? 1.06 : 1);
const PADDING = 5;
const HEADER_SIZE = 7.5;

/**
 * Column widths in points from the content: every column gets at least its longest word (so words are not split)
 * and the header, the rest of the width goes to the columns with long texts.
 */
export function columnWidths(columns: ListColumn[], rows: string[][], available: number): number[] {
  const space = available - columns.length * 2 * PADDING;
  const needs = columns.map((c, i) => {
    if (c.key === '__signature') return { min: 90, preferred: 90 };
    const header = c.label.de.toUpperCase();
    const cells = rows.map((r) => r[i] ?? '');
    const longestWord = Math.max(
      ...header.split(/\s+/).map((w) => textWidth(w, HEADER_SIZE, true) + 0.4 * w.length + 2),
      ...cells.flatMap((t) => t.split(/\s+/)).map((w) => textWidth(w, 9)),
    );
    const lengths = cells.map((t) => textWidth(t, 9)).toSorted((a, b) => a - b);
    const typical = lengths[Math.floor(lengths.length * 0.9)] ?? 0;
    return { min: Math.min(longestWord, space / 2), preferred: Math.max(longestWord, Math.min(typical, 220)) };
  });
  const min = needs.reduce((sum, n) => sum + n.min, 0);
  const preferred = needs.reduce((sum, n) => sum + n.preferred, 0);
  if (preferred <= space) return needs.map((n) => Math.floor((n.preferred * space) / preferred));
  if (min >= space) return needs.map((n) => Math.floor((n.min * space) / min));
  const extra = needs.reduce((sum, n) => sum + (n.preferred - n.min), 0);
  return needs.map((n) => Math.floor(n.min + ((n.preferred - n.min) * (space - min)) / extra));
}

/** Table layout of lists and letters: header in the service color, thin horizontal lines, alternating rows. */
export const PDF_TABLE_LAYOUT = {
  hLineColor: (i: number) => (i === 1 ? SERVICE_RED : GRID),
  vLineColor: () => GRID,
  hLineWidth: (i: number, node: { table: { body: unknown[] } }) => (i === 0 || i === node.table.body.length ? 0 : 0.5),
  vLineWidth: () => 0,
  paddingLeft: () => PADDING,
  paddingRight: () => PADDING,
  paddingTop: (i: number) => (i === 0 ? 5 : 3),
  paddingBottom: (i: number) => (i === 0 ? 4 : 3),
  fillColor: (rowIndex: number) => (rowIndex > 0 && rowIndex % 2 === 0 ? ALTERNATE_ROW : null),
};

/** Header cell: white on the service color, capitals with a little letter spacing (Stil.md). */
export const pdfHeaderCell = (text: string, alignment?: 'left' | 'right' | 'center') => ({
  text: text.toUpperCase(),
  bold: true,
  fontSize: HEADER_SIZE,
  color: '#FFFFFF',
  fillColor: SERVICE_RED,
  characterSpacing: 0.4,
  ...(alignment ? { alignment } : {}),
});

export async function renderPdf(context: RenderContext): Promise<Buffer> {
  const { data, language } = context;
  const columns = columnsWithSignature(context);
  const width = context.orientation === 'portrait' ? 515 : 762;
  const frame: Frame = {
    brigade: context.brigade,
    logo: context.logo,
    title: data.title,
    language,
    now: context.now,
    width,
    margin: 40,
    ...(data.personalData ? { notice: PERSONAL_DATA_NOTICE[language] } : {}),
  };
  const cells = data.rows.map((row) => columns.map((c) => (c.key === '__signature' ? ' ' : formatCell(row[c.key] ?? null, language))));

  const doc = {
    pageSize: 'A4',
    pageOrientation: context.orientation,
    pageMargins: [40, 84, 40, 62],
    defaultStyle: { font: 'Helvetica', fontSize: 9, color: TEXT, lineHeight: 1.15 },
    info: { title: data.title, creator: 'f.orga' },
    header: () => pageHeader(frame),
    footer: (page: number, pages: number) => pageFooter(frame, page, pages),
    content: [
      ...(data.subtitle ? [{ text: data.subtitle, color: META, margin: [0, 0, 0, data.purpose ? 2 : 8] }] : []),
      ...(data.purpose ? [{ text: `${PURPOSE_LABEL[language]}: ${data.purpose}`, color: META, margin: [0, 0, 0, 8] }] : []),
      {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: columnWidths(columns, cells, width),
          body: [
            columns.map((c) => pdfHeaderCell(c.label[language], c.align)),
            ...cells.map((row) =>
              row.map((text, i) => ({ text, alignment: columns[i].align ?? 'left', margin: context.signatureColumn ? [0, 6, 0, 6] : [0, 0, 0, 0] })),
            ),
          ],
        },
        layout: PDF_TABLE_LAYOUT,
      },
    ],
  };
  // The document definition types of pdfmake are not exported in a usable form for ESM.
  return (pdfmake.createPdf(doc as never) as unknown as { getBuffer(): Promise<Buffer> }).getBuffer();
}

/** A letter (e.g. a notice) in the brigade style: letterhead or coat of arms, sender, content, footer with page numbers. */
export interface LetterContext {
  brigade: BrigadeSettings | null;
  /** Data URL of the letterhead (full width) or the coat of arms; `null` = text only. */
  letterhead: string | null;
  logo: string | null;
  title: string;
  /** pdfmake content blocks. */
  content: unknown[];
  language: Language;
  now: Date;
  /** Smaller title in the page header. */
  compactTitle?: boolean;
  /** Files embedded in the PDF (attachments), with the content as data URL. */
  files?: Record<string, { src: string; name: string; description?: string }>;
}

export async function renderLetterPdf(context: LetterContext): Promise<Buffer> {
  const frame: Frame = { brigade: context.brigade, logo: context.logo, title: context.title, language: context.language, now: context.now, width: 483, margin: 56, compactTitle: context.compactTitle };
  const doc = {
    pageSize: 'A4',
    pageMargins: [56, context.letterhead ? 110 : 90, 56, 62],
    defaultStyle: { font: 'Helvetica', fontSize: 10, color: TEXT, lineHeight: 1.2 },
    info: { title: context.title, creator: 'f.orga' },
    ...(context.files ? { files: context.files } : {}),
    header: () => (context.letterhead ? { ...picture(context.letterhead, 483), width: 483, margin: [56, 20, 56, 0] } : pageHeader(frame)),
    footer: (page: number, pages: number) => pageFooter(frame, page, pages),
    content: context.content,
    styles: {
      title: { fontSize: 14, bold: true, color: SERVICE_RED, margin: [0, 12, 0, 8] },
      heading: { fontSize: 10, bold: true, color: SERVICE_RED, margin: [0, 10, 0, 4] },
      small: { fontSize: 8, color: META },
      tableHeader: { bold: true, fontSize: HEADER_SIZE, color: '#FFFFFF', fillColor: SERVICE_RED, characterSpacing: 0.4 },
    },
  };
  return (pdfmake.createPdf(doc as never) as unknown as { getBuffer(): Promise<Buffer> }).getBuffer();
}

/** One certificate page: heading, the name, the text below it, place/date and signature. */
export interface Certificate {
  heading: string;
  name: string;
  text: string;
  placeAndDate: string;
  signer: string;
}

/** Certificates as a serial PDF, one page each (e.g. promotions, honors). */
export async function renderCertificatesPdf(context: { brigade: BrigadeSettings | null; logo: string | null; title: string; certificates: Certificate[] }): Promise<Buffer> {
  const page = (c: Certificate, index: number) => ({
    stack: [
      ...(context.logo ? [{ ...picture(context.logo, 90), alignment: 'center', margin: [0, 0, 0, 16] }] : []),
      { text: context.brigade?.name ?? '', alignment: 'center', fontSize: 14, color: SERVICE_RED, bold: true },
      { text: c.heading.toUpperCase(), alignment: 'center', fontSize: 32, bold: true, characterSpacing: 4, color: SERVICE_RED, margin: [0, 60, 0, 50] },
      { text: c.name, alignment: 'center', fontSize: 22, bold: true, margin: [0, 0, 0, 24] },
      { text: c.text, alignment: 'center', fontSize: 14, lineHeight: 1.4 },
      { text: c.placeAndDate, fontSize: 11, margin: [0, 120, 0, 50] },
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineColor: TEXT, lineWidth: 0.5 }] },
      { text: c.signer, fontSize: 10, margin: [0, 4, 0, 0] },
    ],
    ...(index > 0 ? { pageBreak: 'before' } : {}),
  });
  const doc = {
    pageSize: 'A4',
    pageMargins: [70, 70, 70, 70],
    defaultStyle: { font: 'Helvetica', fontSize: 11, color: TEXT },
    info: { title: context.title, creator: 'f.orga' },
    content: context.certificates.map(page),
  };
  return (pdfmake.createPdf(doc as never) as unknown as { getBuffer(): Promise<Buffer> }).getBuffer();
}
