import { type TransferArchive, transferFlag, transferPersonName, transferPersons, type TransferRow } from '../archive/transfer-archive.js';

/** Passed courses (`PER_LEHRG`) and the ranks and honors of the person history (`PER_HIST`). */
export function readCareer(archives: readonly TransferArchive[]): TransferRow[] {
  const persons = transferPersons(archives);
  const rows: TransferRow[] = [];
  const push = (archive: TransferArchive, personId: string, kind: string, name: string, date: string, validUntil = '') => {
    const person = persons.get(personId);
    if (!person || !name.trim() || !date) return;
    rows.push({
      archive: archive.key,
      values: { personName: transferPersonName(person), birthDate: person.birthDate, kind, name: name.trim(), date: date.slice(0, 10), validUntil: validUntil.slice(0, 10) },
    });
  };
  for (const archive of archives) {
    if (archive.has('PER_LEHRG')) {
      for (const c of archive.query(`select * from PER_LEHRG`)) {
        if (!transferFlag(c['PER_LEHRG_OK'])) continue;
        push(archive, c['PER_INDEX'], 'Lehrgang', c['PER_LEHRG_LANG'] || c['PER_LEHRG_KURZ'], c['PER_ZEITRAUM_BD'] || c['PER_ZEITRAUM_VD'] || c['PER_BESTAETIG_DAT'], c['PER_GUELTIG_BD']);
      }
    }
    if (archive.has('PER_HIST')) {
      for (const h of archive.query(`select * from PER_HIST where PER_HIST_KATEGORIE_OW in ('Dienstgrad', 'Ehrung')`)) {
        push(archive, h['PER_INDEX'], h['PER_HIST_KATEGORIE_OW'], h['PER_HIST_LANG'] || h['PER_HIST_KURZ'], h['PER_ZEITRAUM_VD']);
      }
    }
  }
  return rows;
}
