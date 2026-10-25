import { berlinTime, normalizeHeading, parseCsv, parseDate, parseIcs, parseLocalDateTime } from './parse.js';

describe('parseCsv', () => {
  it('detects semicolons, strips the BOM and handles quotes', () => {
    const table = parseCsv('﻿Vorname;Nachname;Bemerkung\r\nJonas;Keller;"sagt ""hallo""; tschüss"\r\n;;\r\nLena;Brenner;\r\n');
    expect(table.headers).toEqual(['Vorname', 'Nachname', 'Bemerkung']);
    expect(table.rows).toEqual([
      ['Jonas', 'Keller', 'sagt "hallo"; tschüss'],
      ['Lena', 'Brenner', ''],
    ]);
  });

  it('detects commas', () => {
    expect(parseCsv('a,b\n1,2').rows).toEqual([['1', '2']]);
  });
});

describe('normalizeHeading', () => {
  it('ignores case, punctuation and umlauts', () => {
    expect(normalizeHeading('Straße')).toBe('strasse');
    expect(normalizeHeading('Pers.-Nr.')).toBe('persnr');
  });
});

describe('parseDate', () => {
  it('accepts German and ISO dates', () => {
    expect(parseDate('1.5.2000')).toBe('2000-05-01');
    expect(parseDate('2000-05-01')).toBe('2000-05-01');
    expect(parseDate('01.05.85')).toBe('1985-05-01');
    expect(parseDate('morgen')).toBeNull();
  });
});

describe('parseIcs', () => {
  it('reads events with all-day, local and UTC times and unfolds long lines', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:evd-1@example.org',
      'SUMMARY:EvD Max Test',
      'DTSTART;VALUE=DATE:20261102',
      'DTEND;VALUE=DATE:20261109',
      'DESCRIPTION:Woche 45\\, Bereitschaft',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:evd-2@example.org',
      'SUMMARY:EvD Lena',
      ' Test',
      'DTSTART;TZID=Europe/Berlin:20261109T080000',
      'DTEND:20261116T070000Z',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(parseIcs(ics).rows).toEqual([
      ['evd-1@example.org', 'EvD Max Test', '2026-11-02', '2026-11-09', 'Woche 45, Bereitschaft', ''],
      ['evd-2@example.org', 'EvD LenaTest', '2026-11-09T08:00:00', '2026-11-16T07:00:00Z', '', ''],
    ]);
  });
});

describe('parseLocalDateTime and berlinTime', () => {
  it('reads German and ISO date-times and converts them in Europe/Berlin', () => {
    expect(parseLocalDateTime('21.10.2026 13:05')).toBe('2026-10-21T13:05:00');
    expect(parseLocalDateTime('2026-10-21T13:05:00')).toBe('2026-10-21T13:05:00');
    expect(parseLocalDateTime('21.10.2026')).toBe('2026-10-21T00:00:00');
    expect(parseLocalDateTime('gestern')).toBeNull();
    expect(berlinTime('2026-10-21T13:05:00').toISOString()).toBe('2026-10-21T11:05:00.000Z');
    expect(berlinTime('2026-12-21T13:05:00').toISOString()).toBe('2026-12-21T12:05:00.000Z');
  });
});

describe('duplicate headings', () => {
  it('are numbered', () => {
    expect(parseCsv('Bezeichnung;Name;Bezeichnung\nLF;Keller;Abt. Musterstadt').headers).toEqual(['Bezeichnung', 'Name', 'Bezeichnung (2)']);
  });
});

describe('Berlin day boundaries', () => {
  it('starts and ends days in German time, also across daylight saving changes', async () => {
    const { berlinDayAfter, berlinDayEnd, berlinDayStart } = await import('./parse.js');
    expect(berlinDayStart('2026-07-01').toISOString()).toBe('2026-06-30T22:00:00.000Z');
    expect(berlinDayStart('2026-01-01').toISOString()).toBe('2025-12-31T23:00:00.000Z');
    expect(berlinDayAfter('2026-10-24').toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(berlinDayAfter('2026-10-25').toISOString()).toBe('2026-10-25T23:00:00.000Z');
    expect(berlinDayEnd('2026-12-31').toISOString()).toBe('2026-12-31T22:59:59.999Z');
  });
});

describe('addBerlinDays', () => {
  it('keeps the local time across the change to winter time', async () => {
    const { addBerlinDays } = await import('./parse.js');
    // Friday 23 Oct 2026 19:00 CEST → Friday 30 Oct 2026 19:00 CET.
    expect(addBerlinDays(new Date('2026-10-23T17:00:00Z'), 7).toISOString()).toBe('2026-10-30T18:00:00.000Z');
  });
});

describe('zipUnpackedSize', () => {
  it('reads the unpacked size of an Excel file and refuses other data', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const { zipUnpackedSize } = await import('./parse.js');
    const workbook = new ExcelJS.Workbook();
    workbook.addWorksheet('A').addRow(['x']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    expect(zipUnpackedSize(buffer)).toBeGreaterThan(buffer.length);
    expect(zipUnpackedSize(Buffer.from('no zip at all, just text'))).toBeNull();
  });
});
