import type { TransferArchive } from '../archive/transfer-archive.js';
import { readEquipment } from './equipment.reader.js';

/** An archive with the given tables; only what the reader asks for. */
function archive(tables: Record<string, Record<string, string>[]>): TransferArchive {
  return {
    key: 'test',
    label: 'Test',
    has: (table: string) => table in tables,
    query: (sql: string) => tables[/from (\w+)/.exec(sql)?.[1] ?? ''] ?? [],
  } as unknown as TransferArchive;
}

const device = (prefix: string, values: Record<string, string>) => ({
  [`${prefix}_ID`]: crypto.randomUUID(),
  [`${prefix}_NR`]: '1',
  [`${prefix}_STATUS`]: '',
  [`${prefix}_ARCHIV_DAT`]: '',
  [`${prefix}_TYP`]: '',
  [`${prefix}_GRUPPE`]: 'Gruppe',
  ...Object.fromEntries(Object.entries(values).map(([key, value]) => [`${prefix}_${key}`, value])),
});

describe('readEquipment', () => {
  it('names the type after the model where a designation has several models', () => {
    const rows = readEquipment([
      archive({
        GAS_STAMM: [
          device('GAS', { BEZEICHNUNG: 'Feuerlöscher', TYP: '12kg ABC Pulver' }),
          device('GAS', { BEZEICHNUNG: 'Feuerlöscher', TYP: '5kg B Kohlendioxid' }),
          device('GAS', { BEZEICHNUNG: 'Feuerlöscher', TYP: '' }),
          device('GAS', { BEZEICHNUNG: 'AirGo', TYP: '' }),
          device('GAS', { BEZEICHNUNG: 'Kombinationsfilter', TYP: '10097232' }),
        ],
      }),
      archive({
        GAS_STAMM: [device('GAS', { BEZEICHNUNG: 'Feuerlöscher', TYP: '5kg B Kohlendioxid' })],
      }),
    ]);
    expect(rows.map((row) => row.values['type'])).toEqual([
      'Feuerlöscher 12kg ABC Pulver',
      'Feuerlöscher 5kg B Kohlendioxid',
      'Feuerlöscher',
      'AirGo',
      'Kombinationsfilter',
      'Feuerlöscher 5kg B Kohlendioxid',
    ]);
  });

  it('keeps the designation as name and leaves out retired devices when counting models', () => {
    const rows = readEquipment([
      archive({
        GAS_STAMM: [
          device('GAS', { BEZEICHNUNG: 'Altair-CO', TYP: 'Altair CO 30/60ppm' }),
          device('GAS', { BEZEICHNUNG: 'Altair-CO', TYP: 'ALTAIR 2X CO', STATUS: 'außer Betrieb' }),
        ],
      }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].values).toMatchObject({ name: 'Altair-CO', type: 'Altair-CO' });
  });
});
