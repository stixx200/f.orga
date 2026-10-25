import { groupRows, type TransferArchive, transferFlag, transferPersonName, transferPersons, type TransferRow } from '@forga/core-api';

/** "Excused", "ill" and "on leave" flags of `UPE_PERS`. */
const EXCUSED = ['UPE_PER_MERKMAL_EN', 'UPE_PER_MERKMAL_KR', 'UPE_PER_MERKMAL_UR'];

/** Sessions (`UPE_STAMM`) with their participants (`UPE_PERS`, child rows with `UPE_INDEX` = `UPE_ID`). */
export function readSessions(archives: readonly TransferArchive[]): TransferRow[] {
  const persons = transferPersons(archives);
  const rows: TransferRow[] = [];
  for (const archive of archives) {
    if (!archive.has('UPE_STAMM') || !archive.has('UPE_PERS')) continue;
    const participants = groupRows(archive.query(`select * from UPE_PERS`), 'UPE_INDEX');
    for (const s of archive.query(`select * from UPE_STAMM where UPE_ZEIT_V <> '' order by UPE_ZEIT_V`)) {
      // The topic is free text; the first line serves as title.
      const topic = s['UPE_THEMA'].split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
      const session = {
        department: archive.label,
        date: s['UPE_ZEIT_V'].slice(0, 10),
        start: s['UPE_ZEIT_V'].slice(11, 16),
        end: s['UPE_ZEIT_B'].slice(11, 16),
        type: s['UPE_ART'],
        title: (topic || s['UPE_ART'] || 'Dienst').slice(0, 200),
      };
      rows.push({ archive: archive.key, values: session });
      for (const p of participants.get(s['UPE_ID']) ?? []) {
        const person = persons.get(p['UPE_PER_INDEX']);
        rows.push({
          archive: archive.key,
          values: {
            ...session,
            personName: person ? transferPersonName(person) : p['UPE_PER_NAME'],
            attendance: EXCUSED.some((flag) => p[flag] === '1') ? 'entschuldigt' : 'anwesend',
            breathingApparatus: transferFlag(p['UPE_PER_MERKMAL_AS']),
          },
        });
      }
    }
  }
  return rows;
}
