import { type TransferArchive, transferPersonName, transferPersons, type TransferRow } from '../archive/transfer-archive.js';

/** Checks of current members from `PER_PRUEF` whose short or long name matches. */
function readChecks(archives: readonly TransferArchive[], pattern: RegExp, values: (check: Record<string, string>) => Record<string, string>): TransferRow[] {
  const persons = transferPersons(archives);
  const rows: TransferRow[] = [];
  for (const archive of archives) {
    if (!archive.has('PER_PRUEF')) continue;
    for (const check of archive.query(`select * from PER_PRUEF where PER_PRUEF_DAT <> '' order by PER_PRUEF_DAT`)) {
      const person = persons.get(check['PER_INDEX']);
      if (!person || person.left || !pattern.test(`${check['PER_PRUEF_KURZ']} ${check['PER_PRUEF_LANG']}`)) continue;
      rows.push({ archive: archive.key, values: { personName: transferPersonName(person), date: check['PER_PRUEF_DAT'].slice(0, 10), ...values(check) } });
    }
  }
  return rows;
}

/** G 26 examinations, e.g. "G26.3(3)", "G-26 Untersuchung". */
export const readExaminations = (archives: readonly TransferArchive[]) =>
  readChecks(archives, /\bG\s*-?\s*26/i, (c) => ({ validUntil: c['PER_GUELTIG_BD'].slice(0, 10), examiner: c['PER_PRUEF_ORT'] }));

/** Stress exercises; "AS-Strecke" ("Atemschutz-Belastungsübung (Strecke)") are runs of the breathing apparatus track. */
export const readStressExercises = (archives: readonly TransferArchive[]) =>
  readChecks(archives, /AS-Strecke|Belastungs(ü|ue)bung/i, (c) => ({
    kind: /strecke/i.test(`${c['PER_PRUEF_KURZ']} ${c['PER_PRUEF_LANG']}`) ? 'Atemschutzstrecke' : 'Belastungsübung',
    passed: c['PER_PRUEF_OK'] === '0' ? 'nein' : 'ja',
    facility: c['PER_PRUEF_ORT'],
  }));
