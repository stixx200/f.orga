import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { zipSync } from 'fflate';

/**
 * Synthetic MP-Feuer transfer archives for the e2e tests, built like the ones of the integration tests
 * (`apps/server/src/testing/mp-feuer.ts`): a ZIP with `transfer.db` (SQLite, all columns as text), `MPTRA.IFO` and
 * `content.xml`. Only made-up persons.
 */
export type Tables = Record<string, Record<string, string | number>[]>;

/** A transfer archive with the given tables. */
export function transferZip(tables: Tables): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'forga-e2e-mptra-'));
  try {
    const path = join(dir, 'transfer.db');
    const db = new DatabaseSync(path);
    for (const [table, rows] of Object.entries(tables)) {
      const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      db.exec(`create table ${table} (${columns.map((c) => `${c} TEXT`).join(', ')})`);
      for (const row of rows) {
        db.prepare(`insert into ${table} (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`).run(...columns.map((c) => (row[c] === undefined ? null : String(row[c]))));
      }
    }
    db.close();
    const info = new TextEncoder().encode('[content]\r\ntype=transfer\r\ntraversion=1\r\nencrypted=0\r\n');
    return Buffer.from(zipSync({ 'transfer.db': readFileSync(path), 'MPTRA.IFO': info, 'content.xml': new Uint8Array() }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** A row of `PER_STAMM`. */
export const mpPerson = (id: string, nr: string, firstName: string, lastName: string, extra: Record<string, string> = {}) => ({
  PER_ID: id, PER_NR: nr, PER_ANREDE: '', PER_VORNAME: firstName, PER_NACHNAME: lastName, PER_STRASSE: 'Hauptstr. 1', PER_PLZ: '12345', PER_ORT: 'Musterstadt',
  PER_TEL_PRIV: '', PER_TEL_GES: '', PER_MOB_PRIV: '', PER_MOB_GES: '', PER_MAIL_PRIV: '', PER_MAIL_GES: '', PER_GEB_DAT: '1990-01-02', PER_GESCHLECHT_OW: 'M',
  PER_AKTIV_VD: '2010-03-01', PER_AKTIV_BD: '', PER_AKTIV_GRUND: '', PER_ARCHIV_DAT: '',
  ...extra,
});

/** A row of `EIN_STAMM`: an incident report beginning on `date` (`YYYY-MM-DD`) at 10:00. */
export const mpIncident = (id: string, dispatchNumber: string, date: string, alarmKeyword: string) => ({
  EIN_ID: id, EIN_NR: id, EIN_LS_NR: dispatchNumber, EIN_ZEIT_V: `${date} 10:00:00.000`, EIN_ZEIT_B: `${date} 11:00:00.000`, EIN_ALARMSTICHWORT: alarmKeyword, EIN_ART: '',
  EIN_KATEGORIE_OW: '', EIN_ERLAEUTERUNG: '', EIN_ORT: '', EIN_ORT_STRASSE: 'Am Markt 1', EIN_ORT_PLZ: '12345', EIN_ORT_ORT: 'Musterstadt', EIN_ORT_ORTSTEIL: '', EIN_ORT_ZUSATZ: '',
  EIN_ORT_OBJEKT: '', EIN_MERKMAL_ST_GLOBAL: 1, EIN_MERKMAL_KO: 0, EIN_ZUSATZ_2: '', EIN_LAGE: '', EIN_VERLAUF: '', EIN_BERICHT: '', EIN_URSACHE: '', EIN_LEITUNG: '', EIN_STATISTIK: '',
  EIN_RETTUNG_P_S: '', EIN_VERLUSTE_S: '', EIN_RETTUNG_T_S: '',
});

/** A row of `EIN_PERS`: a person of `PER_STAMM` in the report. */
export const mpCrew = (id: string, reportId: string, personId: string, date: string) => ({
  EIN_ID: id, EIN_INDEX: reportId, EIN_PER_INDEX: personId, EIN_PER_NR: '', EIN_PER_NAME: '', EIN_PER_ZEIT_V: `${date} 10:00:00.000`, EIN_PER_ZEIT_B: `${date} 11:00:00.000`,
  EIN_PER_MERKMAL_BE: 0, EIN_PER_MERKMAL_AS: 0, EIN_PER_MERKMAL_VA: 0, EIN_PER_AUFGABE: '', EIN_FZG_RUFNAME: '', EIN_FZG_BEZEICHNUNG: '',
});
