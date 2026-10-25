import { columnWidths, csvText } from './renderers.js';

describe('csvText', () => {
  it('keeps text that looks like a formula as text, but leaves numbers alone', () => {
    expect(csvText('=HYPERLINK("x")', '=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(csvText('@SUM(A1)', '@SUM(A1)')).toBe(`'@SUM(A1)`);
    expect(csvText(-12.5, '-12,50')).toBe('-12,50');
    expect(csvText('Müller', 'Müller')).toBe('Müller');
  });
});

const column = (key: string, de: string) => ({ key, label: { de, en: de } });

describe('columnWidths', () => {
  it('fills the width and gives every column at least its longest word', () => {
    const columns = [column('name', 'Name'), column('phone', 'Mobiltelefon'), column('rank', 'Dienstgrad')];
    const rows = [['Muster, Max', '0151 123456', 'Oberfeuerwehrmann/-frau']];
    const widths = columnWidths(columns, rows, 515);
    expect(widths.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(515);
    expect(widths.reduce((a, b) => a + b, 0)).toBeGreaterThan(470);
    // "MOBILTELEFON" in the header and "Oberfeuerwehrmann/-frau" in a cell are not split.
    expect(widths[1]).toBeGreaterThan(60);
    expect(widths[2]).toBeGreaterThan(100);
  });
});
