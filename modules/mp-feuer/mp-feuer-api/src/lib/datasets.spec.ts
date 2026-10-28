import { DATASETS, splitIntoParts } from './datasets.js';

/** The report row carries the dispatch number, the personnel rows only the key of the report. */
const row = (dispatchNumber: string, personName = '') => ({
  values: { dispatchNumber: personName ? '' : dispatchNumber, personName, department: 'Abt. A', incidentNumber: dispatchNumber, begin: '2026-01-01 10:00' },
});
const incidents = DATASETS.find((d) => d.profile === 'incidents.personnel')!;

describe('splitIntoParts', () => {
  it('fills parts up to the size and keeps the rows of an incident together', () => {
    const rows = [row('1'), row('1', 'A'), row('2'), row('2', 'B'), row('3'), row('1', 'C')];
    const parts = splitIntoParts(rows, 3, incidents.groups);
    expect(parts.map((p) => p.map((r) => r.values.incidentNumber))).toEqual([['1', '1', '1'], ['2', '2', '3']]);
  });

  it('puts a group larger than the size into a part of its own', () => {
    const rows = [row('9'), row('1'), row('1', 'A'), row('1', 'B'), row('2')];
    expect(splitIntoParts(rows, 2, incidents.groups).map((p) => p.length)).toEqual([1, 3, 1]);
  });

  it('splits rows without groups freely', () => {
    expect(splitIntoParts([row('1'), row('1'), row('1')], 2).map((p) => p.length)).toEqual([2, 1]);
  });
});
