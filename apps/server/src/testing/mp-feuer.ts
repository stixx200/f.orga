import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { zipSync } from 'fflate';
import { MpFeuerRuns } from '@forga/mp-feuer-api';
import type { MpFeuerRun } from '@forga/mp-feuer-contracts';
import { type TestApp, UI } from './test-app';

export type Tables = Record<string, Record<string, string | number>[]>;

/** A synthetic MP-Feuer transfer archive with the given tables (all columns as text, like MP-Feuer's own types). */
export function transferZip(tables: Tables): Buffer {
  const dir = mkdtempSync(join(tmpdir(), 'forga-mptra-test-'));
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

export const mpPerson = (id: string, nr: string, firstName: string, lastName: string, extra: Record<string, string> = {}) => ({
  PER_ID: id,
  PER_NR: nr,
  PER_ANREDE: '',
  PER_VORNAME: firstName,
  PER_NACHNAME: lastName,
  PER_STRASSE: 'Hauptstr. 1',
  PER_PLZ: '12345',
  PER_ORT: 'Musterstadt',
  PER_TEL_PRIV: '',
  PER_TEL_GES: '',
  PER_MOB_PRIV: '',
  PER_MOB_GES: '',
  PER_MAIL_PRIV: '',
  PER_MAIL_GES: '',
  PER_GEB_DAT: '1990-01-02',
  PER_GESCHLECHT_OW: 'M',
  PER_AKTIV_VD: '2010-03-01',
  PER_AKTIV_BD: '',
  PER_AKTIV_GRUND: '',
  PER_ARCHIV_DAT: '',
  ...extra,
});

/** Calls of the module API as a script would make them. */
export function mpFeuerClient(test: TestApp, cookie: () => string) {
  const runs = () => test.app.get(MpFeuerRuns);
  const get = async (id: string): Promise<MpFeuerRun> => (await test.http.get(`/api/mp-feuer/runs/${id}`).set('Cookie', cookie()).expect(200)).body;
  /** Waits for the background run like a client polling `GET …/:id` until it no longer works. */
  const settle = async (id: string): Promise<MpFeuerRun> => {
    await runs().working.get(id);
    return get(id);
  };
  return {
    runs,
    get,
    settle,
    /** The run read from the files; with another `status` the error body. */
    upload: async (files: [Buffer, string][], status = 201): Promise<MpFeuerRun> => {
      let request = test.http.post('/api/mp-feuer/runs').set('Cookie', cookie()).set(UI);
      for (const [data, name] of files) request = request.attach('files', data, name);
      return (await request.expect(status)).body;
    },
    select: async (id: string, selection: object, status = 200) =>
      (await test.http.put(`/api/mp-feuer/runs/${id}`).set('Cookie', cookie()).set(UI).send(selection).expect(status)).body,
    dryRun: async (id: string): Promise<MpFeuerRun> => {
      await test.http.post(`/api/mp-feuer/runs/${id}/dry-run`).set('Cookie', cookie()).set(UI).send({}).expect(202);
      return settle(id);
    },
    apply: async (id: string): Promise<MpFeuerRun> => {
      await test.http.post(`/api/mp-feuer/runs/${id}/apply`).set('Cookie', cookie()).set(UI).send({}).expect(202);
      return settle(id);
    },
    report: async (id: string) => (await test.http.get(`/api/mp-feuer/runs/${id}/report`).set('Cookie', cookie()).expect(200)).body,
  };
}

/** Counts of a dataset of a run. */
export const countsOf = (run: MpFeuerRun, profile: string) => run.datasets.find((d) => d.profile === profile)?.counts;
