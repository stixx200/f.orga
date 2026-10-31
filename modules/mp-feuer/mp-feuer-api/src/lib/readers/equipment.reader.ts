import { groupRows, type TransferArchive, type TransferRow } from '../archive/transfer-archive.js';

/** Calendar date in Europe/Berlin. Local on purpose: this reader is loaded by a unit test that must not pull the core module. */
const todayInBerlin = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

/**
 * Equipment families of an MP-Feuer transfer file. The prefix is the table name (`GSO_STAMM`, …).
 * Clothing (`KLD`), vehicles (`FZG`) and the few workplace items (`WAS`) are not inventory of this kind.
 */
const FAMILIES: { prefix: string; category: string }[] = [
  { prefix: 'GAS', category: 'Atemschutz' },
  { prefix: 'GEL', category: 'Elektro' },
  { prefix: 'GFU', category: 'Funk' },
  { prefix: 'GHR', category: 'Rettungsgeräte' },
  { prefix: 'GMP', category: 'Rettungsgeräte' },
  { prefix: 'GSL', category: 'Schläuche und Armaturen' },
  { prefix: 'GSO', category: 'Rettungsgeräte' },
];

/** A group name that sits in a more specific f.orga category than its family. */
const GROUP_CATEGORY: Record<string, string> = {
  Leiter: 'Leitern',
  Leitern: 'Leitern',
  Beleuchtung: 'Elektro',
  'Beleuchtung Batterie Ex': 'Elektro',
  'ortsveränderliche el. Betriebsmittel': 'Elektro',
  'ortsfeste el. Betriebsmittel': 'Elektro',
  Sanitätsgerät: 'Rettungsgeräte',
  Schutzkleidung: 'Schutzausrüstung',
  Schutzkleidungen: 'Schutzausrüstung',
};

const cell = (row: Record<string, string>, column: string) => (row[column] ?? '').trim();

/**
 * Rows for `equipment.inventory`: one row per device that is still in service, plus its latest inspection.
 * The inventory number is the one from MP-Feuer, else the barcode, else a stable number from the MP-Feuer id,
 * because the device number is only unique inside one list. The category is the German name of the f.orga
 * category the family (and, where it is clearer, the group) belongs to. The product name is also the
 * equipment type, so a remembered mapping can replace a model name with an abstract type. The latest
 * inspection is the newest date that is not in the future; a later date would drop the whole device.
 */
export function readEquipment(archives: readonly TransferArchive[]): TransferRow[] {
  const rows: TransferRow[] = [];
  for (const archive of archives) {
    for (const family of FAMILIES) {
      const table = `${family.prefix}_STAMM`;
      if (!archive.has(table)) continue;
      const checks = groupRows(archive.has(`${family.prefix}_PRUEF`) ? archive.query(`select * from ${family.prefix}_PRUEF`) : [], `${family.prefix}_INDEX`);
      for (const item of archive.query(`select * from ${table}`)) {
        if (retired(item, family.prefix)) continue;
        const name = cell(item, `${family.prefix}_BEZEICHNUNG`);
        if (!name) continue;
        const group = cell(item, `${family.prefix}_GRUPPE`) || cell(item, `${family.prefix}_KATEGORIE_OW`);
        const inspection = latest(checks.get(item[`${family.prefix}_ID`]) ?? [], family.prefix);
        rows.push({
          archive: archive.key,
          values: {
            inventoryNumber: inventoryNumber(family.prefix, item),
            name,
            type: name,
            category: GROUP_CATEGORY[group] ?? family.category,
            department: archive.label,
            manufacturer: cell(item, `${family.prefix}_HERSTELLER`),
            serialNumber: cell(item, `${family.prefix}_HERST_NR`),
            barcode: cell(item, `${family.prefix}_BARCODE_NR`),
            location: cell(item, `${family.prefix}_STANDORT`),
            loadingPlace: cell(item, `${family.prefix}_ZUTEIL_LADERAUM`),
            quantity: cell(item, `${family.prefix}_ANZAHL`) || '1',
            lastInspection: inspection?.date ?? '',
            nextInspection: inspection?.until ?? '',
          },
        });
      }
    }
  }
  return rows;
}

function retired(item: Record<string, string>, prefix: string): boolean {
  const status = cell(item, `${prefix}_STATUS`).toLowerCase();
  if (status === 'außer betrieb' || status === 'ausser betrieb') return true;
  return Boolean(cell(item, `${prefix}_ARCHIV_DAT`));
}

/** Inventory number, barcode, or `prefix-number-id` so a re-import finds the same device. */
function inventoryNumber(prefix: string, item: Record<string, string>): string {
  const inventory = cell(item, `${prefix}_INVENTAR_NR`);
  if (inventory) return inventory;
  const barcode = cell(item, `${prefix}_BARCODE_NR`);
  if (barcode) return barcode;
  const number = cell(item, `${prefix}_NR`);
  const id = cell(item, `${prefix}_ID`).replace(/-/g, '').slice(0, 8).toLowerCase();
  return number ? `${prefix}-${number}-${id}` : `${prefix}-${id}`;
}

function latest(rows: readonly Record<string, string>[], prefix: string): { date: string; until: string } | null {
  const today = todayInBerlin();
  let best: { date: string; until: string } | null = null;
  for (const row of rows) {
    const date = cell(row, `${prefix}_PRUEF_DAT`).slice(0, 10);
    if (!date || date > today || (best && date < best.date)) continue;
    const until = cell(row, `${prefix}_GUELTIG_BD`).slice(0, 10);
    best = { date, until: until > date ? until : '' };
  }
  return best;
}
