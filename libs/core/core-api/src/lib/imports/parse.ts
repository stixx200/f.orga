import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

export interface ParsedTable {
  headers: string[];
  rows: string[][];
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  // Excel stores local date-times without zone; exceljs returns them as UTC.
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.slice(11, 19) === '00:00:00' ? iso.slice(0, 10) : iso.slice(0, 19);
  }
  if (typeof value === 'object') {
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    if ('text' in value) return String(value.text);
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('hyperlink' in value) return String((value as { text?: string }).text ?? value.hyperlink);
  }
  return String(value).trim();
}

/** Repeated headings get a counter, e.g. MP-Feuer's two "Bezeichnung" columns → "Bezeichnung", "Bezeichnung (2)". */
function uniqueHeadings(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    const count = (seen.get(h) ?? 0) + 1;
    seen.set(h, count);
    return count === 1 ? h : `${h} (${count})`;
  });
}

function trimTable(headers: string[], rows: string[][]): ParsedTable {
  const width = headers.length;
  return {
    headers: uniqueHeadings(headers),
    rows: rows.map((r) => Array.from({ length: width }, (_, i) => (r[i] ?? '').trim())).filter((r) => r.some(Boolean)),
  };
}

/** Largest unpacked size of an Excel file (all parts together). */
export const MAX_UNPACKED_XLSX = 100 * 1024 * 1024;

/**
 * Sum of the uncompressed sizes in the zip's central directory, read without unpacking anything.
 * `null` if it is no readable zip or uses ZIP64 (sizes beyond 4 GB) – both are refused.
 */
export function zipUnpackedSize(buffer: Buffer): number | null {
  const searchFrom = Math.max(0, buffer.length - 65_557);
  let end = -1;
  for (let i = buffer.length - 22; i >= searchFrom; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) return null;
    const size = buffer.readUInt32LE(offset + 24);
    if (size === 0xffffffff) return null;
    total += size;
    offset += 46 + buffer.readUInt16LE(offset + 28) + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32);
  }
  return total;
}

/** Reads the first worksheet; the first non-empty row holds the column headings. Zip bombs are refused before unpacking. */
export async function parseXlsx(buffer: Buffer): Promise<ParsedTable> {
  const unpacked = zipUnpackedSize(buffer);
  if (unpacked === null || unpacked > MAX_UNPACKED_XLSX) throw new BadRequestException({ code: 'imports.fileTooLarge' });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return { headers: [], rows: [] };
  const all: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = row.values as ExcelJS.CellValue[];
    all.push(values.slice(1).map(cellText));
  });
  const [headers = [], ...rows] = all;
  return trimTable(headers.map((h) => h.trim()), rows);
}

/** CSV with `;` or `,` (detected from the heading row), optional BOM and quoted fields. */
export function parseCsv(text: string): ParsedTable {
  const content = text.replace(/^﻿/, '');
  const firstLine = content.split(/\r?\n/, 1)[0] ?? '';
  const separator = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (quoted) {
      if (char === '"' && content[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && content[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [headers = [], ...data] = rows.filter((r) => r.some((c) => c.trim()));
  return trimTable(headers.map((h) => h.trim()), data);
}

/** Lowercase, umlauts transcribed, everything but letters and digits removed. */
export function normalizeHeading(text: string): string {
  return text
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Normalized form of a blank cell. `normalizeHeading` drops everything that is not a letter or digit, so a blank
 * cell would otherwise have nothing to remember a mapping under. The result always contains `#`, which
 * `normalizeHeading` never produces.
 */
export const BLANK_MAPPING = '#empty';

/** What remembered mappings compare: headings like `normalizeHeading`, and `BLANK_MAPPING` for a blank cell. */
export function mappingNormalized(value: string): string {
  return normalizeHeading(value) || BLANK_MAPPING;
}

/** Converts `TT.MM.JJJJ`, `JJJJ-MM-TT` (and `TT.MM.JJ`) to `JJJJ-MM-TT`; `null` if not a date. */
export function parseDate(text: string): string | null {
  const value = text.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(value);
  if (!german) return null;
  const [, d, m, y] = german;
  const year = y.length === 2 ? (Number(y) > 30 ? `19${y}` : `20${y}`) : y;
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** Columns of a calendar file as offered to the column mapping. */
export const ICS_HEADERS = ['UID', 'SUMMARY', 'DTSTART', 'DTEND', 'DESCRIPTION', 'LOCATION'];

/**
 * Converts an iCalendar date value: all-day `20261102` → `2026-11-02`,
 * local `20261102T080000` (with or without TZID) → `2026-11-02T08:00:00`, UTC `…Z` → ISO with `Z`.
 */
function icsDate(value: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!match) return value.trim();
  const [, y, m, d, hh, mm, ss, utc] = match;
  if (!hh) return `${y}-${m}-${d}`;
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}${utc ? 'Z' : ''}`;
}

function icsText(value: string): string {
  return value.replaceAll('\\n', '\n').replaceAll('\\N', '\n').replace(/\\([,;\\])/g, '$1').trim();
}

/** Reads the events (VEVENT) of an iCalendar file as a table, one row per event. */
export function parseIcs(text: string): ParsedTable {
  // Unfold continuation lines (RFC 5545: a line starting with a space or tab continues the previous one).
  const lines = text.replace(/^\uFEFF/, '').replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
  const rows: string[][] = [];
  let event: Record<string, string> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') event = {};
    else if (line === 'END:VEVENT' && event) {
      rows.push(ICS_HEADERS.map((h) => event?.[h] ?? ''));
      event = null;
    } else if (event) {
      const separator = line.indexOf(':');
      if (separator < 0) continue;
      const name = line.slice(0, separator).split(';')[0].toUpperCase();
      const value = line.slice(separator + 1);
      if (name === 'DTSTART' || name === 'DTEND') event[name] = icsDate(value);
      else if (ICS_HEADERS.includes(name)) event[name] = icsText(value);
    }
  }
  return { headers: ICS_HEADERS, rows };
}

/**
 * Converts a date-time like `21.10.2026 13:05`, `2026-10-21T13:05:00` or `2026-10-21 13:05`
 * to the local form `2026-10-21T13:05:00`; `null` if it is no date-time. A date without time gives midnight.
 */
export function parseLocalDateTime(text: string): string | null {
  const value = text.trim();
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  const german = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  let date: string | null = null;
  let time: [string?, string?, string?] = [];
  if (iso) {
    date = iso[1];
    time = [iso[2], iso[3], iso[4]];
  } else if (german) {
    date = parseDate(`${german[1]}.${german[2]}.${german[3]}`);
    time = [german[4], german[5], german[6]];
  }
  if (!date) return null;
  const [h = '0', m = '00', sec = '00'] = time;
  return `${date}T${h.padStart(2, '0')}:${m}:${sec}`;
}

/** Interprets a local date-time (`YYYY-MM-DDTHH:MM:SS`) in Europe/Berlin, including summer time. */
export function berlinTime(local: string): Date {
  const asUtc = new Date(`${local}Z`);
  const zoned = (zone: string) => new Date(asUtc.toLocaleString('en-US', { timeZone: zone })).getTime();
  return new Date(asUtc.getTime() - (zoned('Europe/Berlin') - zoned('UTC')));
}

/** Calendar date (`YYYY-MM-DD`) of an instant in Europe/Berlin. */
export function berlinDate(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(instant);
}

/** Start of a calendar day (`YYYY-MM-DD`) in Europe/Berlin, independent of the server's time zone. */
export function berlinDayStart(date: string): Date {
  return berlinTime(`${date}T00:00:00`);
}

/** Start of the following day in Europe/Berlin: the exclusive end of `date`. */
export function berlinDayAfter(date: string): Date {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return berlinDayStart(next.toISOString().slice(0, 10));
}

/** Last millisecond of a calendar day in Europe/Berlin. */
export function berlinDayEnd(date: string): Date {
  return new Date(berlinDayAfter(date).getTime() - 1);
}

/** The same wall-clock time in Europe/Berlin `days` later, e.g. a weekly session at 19:00 also after a daylight saving change. */
export function addBerlinDays(instant: Date, days: number): Date {
  const local = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .format(instant)
    .replace(' ', 'T');
  const date = new Date(`${local.slice(0, 10)}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return new Date(berlinTime(`${date.toISOString().slice(0, 10)}${local.slice(10)}`).getTime() + instant.getMilliseconds());
}
