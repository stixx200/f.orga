import type { TransferArchive, TransferRow } from '../archive/transfer-archive.js';

const cell = (row: Record<string, string>, column: string) => (row[column] ?? '').trim();

/**
 * Pieces of the clothing store (`KLD_STAMM`) for `clothing.inventory`. Archived pieces and pieces out of service
 * stay out. A current assignment (`ZUTEIL_NAME` and date) is the person holding the piece; the issue history
 * (`PER_AUSR`) is not repeated, so a re-import does not record the same handover twice.
 */
export function readClothing(archives: readonly TransferArchive[]): TransferRow[] {
  const rows: TransferRow[] = [];
  for (const archive of archives) {
    if (!archive.has('KLD_STAMM')) continue;
    for (const item of archive.query(`select * from KLD_STAMM`)) {
      if (retired(item)) continue;
      const name = cell(item, 'KLD_BEZEICHNUNG');
      if (!name) continue;
      const holder = cell(item, 'KLD_ZUTEIL_NAME');
      const issuedOn = cell(item, 'KLD_ZUTEIL_DAT').slice(0, 10);
      rows.push({
        archive: archive.key,
        values: {
          inventoryNumber: inventoryNumber(item),
          article: name,
          size: cell(item, 'KLD_GROESSE'),
          department: archive.label,
          manufacturer: cell(item, 'KLD_HERSTELLER'),
          serialNumber: cell(item, 'KLD_HERST_NR'),
          barcode: cell(item, 'KLD_BARCODE_NR'),
          personName: issuedOn ? holder : '',
          issuedOn,
        },
      });
    }
  }
  return rows;
}

function retired(item: Record<string, string>): boolean {
  const status = cell(item, 'KLD_STATUS').toLowerCase();
  if (status === 'außer betrieb' || status === 'ausser betrieb') return true;
  return Boolean(cell(item, 'KLD_ARCHIV_DAT'));
}

function inventoryNumber(item: Record<string, string>): string {
  const inventory = cell(item, 'KLD_INVENTAR_NR');
  if (inventory) return inventory;
  const barcode = cell(item, 'KLD_BARCODE_NR');
  if (barcode) return barcode;
  const number = cell(item, 'KLD_NR');
  const id = cell(item, 'KLD_ID').replace(/-/g, '').slice(0, 8).toLowerCase();
  return number ? `KLD-${number}-${id}` : `KLD-${id}`;
}
