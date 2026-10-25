import { dueDates, usagePeriods } from './clothing.js';

const article = { impregnationMonths: 12, inspectionMonths: 12 };
const piece = { purchasedOn: '2024-01-15', createdOn: '2024-01-20', lastImpregnatedOn: null, lastInspectedOn: null };

describe('due dates of clothing', () => {
  it('needs no washing or impregnation while the piece is in stock', () => {
    expect(dueDates(article, { ...piece, usage: [] })).toEqual({ impregnationDueOn: null, inspectionDueOn: '2025-01-15' });
    expect(dueDates(article, { ...piece, usage: [{ from: '2024-02-01', to: '2024-06-01' }] }).impregnationDueOn).toBeNull();
  });

  it('counts the first year in use from the issue', () => {
    expect(dueDates(article, { ...piece, usage: [{ from: '2026-02-01', to: null }] }).impregnationDueOn).toBe('2027-02-01');
    expect(dueDates(article, { ...piece, lastImpregnatedOn: '2026-06-10', usage: [{ from: '2026-02-01', to: null }] }).impregnationDueOn).toBe('2027-06-10');
  });

  it('does not count the time in stock between two holders', () => {
    // 30 days in use, then in stock, issued again: 30 days of the year are used up.
    const usage = usagePeriods([
      { kind: 'issue', date: '2025-01-01' },
      { kind: 'return', date: '2025-01-31' },
      { kind: 'issue', date: '2026-03-01' },
    ]);
    expect(usage).toEqual([{ from: '2025-01-01', to: '2025-01-31' }, { from: '2026-03-01', to: null }]);
    expect(dueDates(article, { ...piece, usage }).impregnationDueOn).toBe('2027-01-30');
    // Impregnated during the first period: only the use after it counts.
    expect(dueDates(article, { ...piece, lastImpregnatedOn: '2025-01-21', usage }).impregnationDueOn).toBe('2027-02-19');
  });

  it('keeps an issued piece in use even if an issue is dated before the last return', () => {
    const records = [
      { kind: 'issue' as const, date: '2025-01-01' },
      { kind: 'return' as const, date: '2025-03-01' },
      { kind: 'issue' as const, date: '2025-02-01' },
    ];
    // Without the current issue the records end with the return: no period in use.
    expect(usagePeriods(records).at(-1)?.to).toBe('2025-03-01');
    const usage = usagePeriods(records, '2025-02-01');
    expect(usage.at(-1)).toEqual({ from: '2025-03-01', to: null });
    expect(dueDates(article, { ...piece, usage }).impregnationDueOn).not.toBeNull();
  });
});
