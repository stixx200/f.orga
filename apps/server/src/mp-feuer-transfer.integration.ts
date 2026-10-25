import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { zipSync } from 'fflate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown) => test.http.post(`/api${path}`).set('Cookie', admin).set(UI).send(body as object);
const get = (path: string) => test.http.get(`/api${path}`).set('Cookie', admin);

const personId = async (lastName: string) =>
  ((await get('/masterdata/persons?includeLeft=true')).body as { id: string; lastName: string }[]).find((p) => p.lastName === lastName)?.id;

type Tables = Record<string, Record<string, string | number>[]>;

/** An MP-Feuer transfer archive with the given tables (all columns as text, like MP-Feuer's own types). */
function transferZip(tables: Tables): Buffer {
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

const person = (id: string, nr: string, firstName: string, lastName: string, extra: Record<string, string> = {}) => ({
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

// Personnel numbers are counted per department in MP-Feuer: "0001" is a different person in each archive.
const musterstadt = transferZip({
  PER_STAMM: [
    person('P-ANNA', '0001', 'Anna', 'Probe', { PER_GESCHLECHT_OW: 'W', PER_MAIL_PRIV: 'anna@example.org' }),
    person('P-OTTO', '0002', 'Otto', 'Weg', { PER_AKTIV_BD: '2018-06-30', PER_ARCHIV_DAT: '2018-07-01', PER_AKTIV_GRUND: 'umgezogen' }),
    // Moved to the veterans: archived here, current in the veterans archive.
    person('P-KARL-OLD', '0003', 'Karl', 'Alt', { PER_GEB_DAT: '1950-05-05', PER_AKTIV_VD: '1975-01-01', PER_AKTIV_BD: '2010-12-31', PER_ARCHIV_DAT: '2011-01-01' }),
  ],
  PER_LEHRG: [
    { PER_ID: 'L1', PER_INDEX: 'P-ANNA', PER_LEHRG_KURZ: '', PER_LEHRG_LANG: 'Truppführer, Lehrgang auf Kreisebene', PER_ZEITRAUM_VD: '2018-05-01', PER_ZEITRAUM_BD: '2018-05-05', PER_BESTAETIG_DAT: '', PER_GUELTIG_BD: '', PER_LEHRG_OK: 1 },
    { PER_ID: 'L2', PER_INDEX: 'P-ANNA', PER_LEHRG_KURZ: '', PER_LEHRG_LANG: 'Motorsägen-Grundlehrgang', PER_ZEITRAUM_VD: '2019-04-01', PER_ZEITRAUM_BD: '', PER_BESTAETIG_DAT: '', PER_GUELTIG_BD: '', PER_LEHRG_OK: 1 },
    { PER_ID: 'L3', PER_INDEX: 'P-ANNA', PER_LEHRG_KURZ: '', PER_LEHRG_LANG: 'Gruppenführer', PER_ZEITRAUM_VD: '2024-04-01', PER_ZEITRAUM_BD: '', PER_BESTAETIG_DAT: '', PER_GUELTIG_BD: '', PER_LEHRG_OK: 0 },
  ],
  PER_HIST: [
    { PER_ID: 'H1', PER_INDEX: 'P-ANNA', PER_HIST_KATEGORIE_OW: 'Dienstgrad', PER_HIST_KURZ: '', PER_HIST_LANG: 'Oberfeuerwehrmann', PER_ZEITRAUM_VD: '2019-01-01' },
    { PER_ID: 'H2', PER_INDEX: 'P-ANNA', PER_HIST_KATEGORIE_OW: 'Ehrung', PER_HIST_KURZ: '', PER_HIST_LANG: 'Feuerwehr-Ehrenzeichen in Silber', PER_ZEITRAUM_VD: '2024-01-01' },
    { PER_ID: 'H3', PER_INDEX: 'P-ANNA', PER_HIST_KATEGORIE_OW: 'Funktion', PER_HIST_KURZ: '', PER_HIST_LANG: 'Maschinist', PER_ZEITRAUM_VD: '2020-01-01' },
  ],
  PER_PRUEF: [
    { PER_ID: 'C1', PER_INDEX: 'P-ANNA', PER_PRUEF_KURZ: 'G26.3(3)', PER_PRUEF_LANG: 'G26.3 - Untersuchung (3 Jahre)', PER_PRUEF_DAT: '2025-02-01', PER_GUELTIG_BD: '2028-02-01', PER_PRUEF_OK: 1, PER_PRUEF_ORT: 'Betriebsarzt' },
    { PER_ID: 'C2', PER_INDEX: 'P-ANNA', PER_PRUEF_KURZ: 'AS-Strecke', PER_PRUEF_LANG: 'Atemschutz-Belastungsübung (Strecke)', PER_PRUEF_DAT: '2025-03-01', PER_GUELTIG_BD: '2026-03-01', PER_PRUEF_OK: 1, PER_PRUEF_ORT: 'Kreisstadt' },
    { PER_ID: 'C3', PER_INDEX: 'P-ANNA', PER_PRUEF_KURZ: 'FS-Prüf', PER_PRUEF_LANG: 'Führerschein-Prüfung', PER_PRUEF_DAT: '2025-03-01', PER_GUELTIG_BD: '', PER_PRUEF_OK: 1, PER_PRUEF_ORT: '' },
  ],
  UPE_STAMM: [{ UPE_ID: 'U1', UPE_ZEIT_V: '2025-05-05 19:00:00.000', UPE_ZEIT_B: '2025-05-05 21:00:00.000', UPE_ART: 'Übung', UPE_THEMA: 'Löschangriff\r\nmit zwei Rohren' }],
  UPE_PERS: [
    { UPE_ID: 'UP1', UPE_INDEX: 'U1', UPE_PER_INDEX: 'P-ANNA', UPE_PER_NAME: 'Probe Anna', UPE_PER_MERKMAL_EN: 0, UPE_PER_MERKMAL_KR: 0, UPE_PER_MERKMAL_UR: 0, UPE_PER_MERKMAL_AS: 1 },
    { UPE_ID: 'UP2', UPE_INDEX: 'U1', UPE_PER_INDEX: 'P-KARL-OLD', UPE_PER_NAME: 'Alt Karl', UPE_PER_MERKMAL_EN: 1, UPE_PER_MERKMAL_KR: 0, UPE_PER_MERKMAL_UR: 0, UPE_PER_MERKMAL_AS: 0 },
  ],
  EIN_STAMM: [
    {
      EIN_ID: 'E1', EIN_NR: '2025-001', EIN_LS_NR: '1250000001', EIN_ZEIT_V: '2025-06-01 10:00:00.000', EIN_ZEIT_B: '2025-06-01 11:30:00.000',
      EIN_ALARMSTICHWORT: 'B1-MPT', EIN_ART: 'Kleinbrand', EIN_KATEGORIE_OW: 'Brand', EIN_ERLAEUTERUNG: 'Mülleimer brennt', EIN_ORT: '', EIN_ORT_STRASSE: 'Bahnhofstr. 3', EIN_ORT_PLZ: '12345',
      EIN_ORT_ORT: 'Musterstadt', EIN_ORT_ORTSTEIL: '', EIN_ORT_ZUSATZ: '', EIN_ORT_OBJEKT: '', EIN_MERKMAL_ST_GLOBAL: 1, EIN_MERKMAL_KO: 0, EIN_ZUSATZ_2: 'zur Abrechnung freigegeben',
      EIN_LAGE: 'Mülleimer in Vollbrand', EIN_VERLAUF: 'Abgelöscht', EIN_BERICHT: 'Mit Kübelspritze gelöscht.', EIN_URSACHE: '', EIN_LEITUNG: 'Probe Anna', EIN_STATISTIK: '#L Kleinbrände A',
      EIN_RETTUNG_P_S: '', EIN_VERLUSTE_S: '', EIN_RETTUNG_T_S: '',
    },
    {
      EIN_ID: 'E2', EIN_NR: '2025-002', EIN_LS_NR: '', EIN_ZEIT_V: '2025-06-02 08:00:00.000', EIN_ZEIT_B: '2025-06-02 09:00:00.000',
      EIN_ALARMSTICHWORT: '', EIN_ART: 'Unterstützung Verwaltung', EIN_KATEGORIE_OW: 'Sonstiges', EIN_ERLAEUTERUNG: '', EIN_ORT: 'Musterstadt', EIN_ORT_STRASSE: '', EIN_ORT_PLZ: '',
      EIN_ORT_ORT: '', EIN_ORT_ORTSTEIL: '', EIN_ORT_ZUSATZ: '', EIN_ORT_OBJEKT: '', EIN_MERKMAL_ST_GLOBAL: 1, EIN_MERKMAL_KO: 0, EIN_ZUSATZ_2: '',
      EIN_LAGE: '', EIN_VERLAUF: '', EIN_BERICHT: '', EIN_URSACHE: '', EIN_LEITUNG: '', EIN_STATISTIK: '', EIN_RETTUNG_P_S: '', EIN_VERLUSTE_S: '', EIN_RETTUNG_T_S: '',
    },
    {
      EIN_ID: 'E3', EIN_NR: '2025-003', EIN_LS_NR: '1250000001', EIN_ZEIT_V: '2025-06-01 10:30:00.000', EIN_ZEIT_B: '2025-06-01 12:00:00.000',
      EIN_ALARMSTICHWORT: 'B1-MPT', EIN_ART: 'Kleinbrand', EIN_KATEGORIE_OW: 'Brand', EIN_ERLAEUTERUNG: '', EIN_ORT: '', EIN_ORT_STRASSE: 'Bahnhofstr. 3', EIN_ORT_PLZ: '12345',
      EIN_ORT_ORT: 'Musterstadt', EIN_ORT_ORTSTEIL: '', EIN_ORT_ZUSATZ: '', EIN_ORT_OBJEKT: '', EIN_MERKMAL_ST_GLOBAL: 0, EIN_MERKMAL_KO: 0, EIN_ZUSATZ_2: 'zur Abrechnung freigegeben',
      EIN_LAGE: 'Nachalarmierung', EIN_VERLAUF: '', EIN_BERICHT: '', EIN_URSACHE: '', EIN_LEITUNG: '', EIN_STATISTIK: '', EIN_RETTUNG_P_S: '', EIN_VERLUSTE_S: '', EIN_RETTUNG_T_S: '',
    },
  ],
  EIN_PERS: [
    // A second MP-Feuer report of the department for the same dispatch number: merged into the one report.
    { EIN_ID: 'EP2', EIN_INDEX: 'E3', EIN_PER_INDEX: 'P-KARL-OLD', EIN_PER_NR: '0003', EIN_PER_NAME: 'Alt Karl', EIN_PER_ZEIT_V: '2025-06-01 10:30:00.000', EIN_PER_ZEIT_B: '2025-06-01 12:00:00.000', EIN_PER_MERKMAL_BE: 0, EIN_PER_MERKMAL_AS: 0, EIN_PER_MERKMAL_VA: 0, EIN_PER_AUFGABE: '', EIN_FZG_RUFNAME: '', EIN_FZG_BEZEICHNUNG: '' },
    { EIN_ID: 'EP1', EIN_INDEX: 'E1', EIN_PER_INDEX: 'P-ANNA', EIN_PER_NR: '0001', EIN_PER_NAME: 'Probe Anna', EIN_PER_ZEIT_V: '2025-06-01 10:00:00.000', EIN_PER_ZEIT_B: '2025-06-01 11:30:00.000', EIN_PER_MERKMAL_BE: 0, EIN_PER_MERKMAL_AS: 1, EIN_PER_MERKMAL_VA: 0, EIN_PER_AUFGABE: 'Maschinist', EIN_FZG_RUFNAME: '', EIN_FZG_BEZEICHNUNG: 'LF 20/16' },
  ],
});

const veterans = transferZip({
  PER_STAMM: [person('P-KARL', '0001', 'Karl', 'Alt', { PER_GEB_DAT: '1950-05-05', PER_AKTIV_VD: '1975-01-01', PER_AKTIV_BD: '2010-12-31' })],
});

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/training/types/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.veterans = (await post('/masterdata/departments', { name: 'Altersabteilung Musterstadt', shortName: 'Alters Musterstadt', type: 'veterans', parentId: ids.musterstadt }).expect(201)).body.id;
  ids.lf = (await post('/masterdata/vehicles', { designation: 'LF 20/16', vehicleType: 'lf-20-16', departmentId: ids.musterstadt }).expect(201)).body.id;
});

afterAll(() => test?.app.close());

describe('MP-Feuer data transfer', () => {
  let transfer: string;
  const departments = { '01': 'Abteilung Musterstadt', '11': 'Altersabteilung Musterstadt' };
  const run = (profile: string, apply: boolean, options: Record<string, boolean> = {}) =>
    post(`/core/imports/transfers/${transfer}/${apply ? 'apply' : 'preview'}`, { profile, departments, options }).expect(200);

  it('rejects files that are no transfer archives', async () => {
    const response = await test.http.post('/api/core/imports/transfers').set('Cookie', admin).set(UI).attach('files', Buffer.from('kein zip'), 'MPTRA_01_x_Abt._Musterstadt.zip').expect(400);
    expect(response.body).toMatchObject({ code: 'imports.transferUnreadable', name: 'MPTRA_01_x_Abt._Musterstadt.zip' });
  });

  it('reads all archives into datasets in import order', async () => {
    const response = await test.http
      .post('/api/core/imports/transfers')
      .set('Cookie', admin)
      .set(UI)
      .attach('files', musterstadt, 'MPTRA_01_2026-10-25-074935_Abt._Musterstadt.zip')
      .attach('files', veterans, 'MPTRA_11_2026-10-25-080043_Altersabt._Musterstadt.zip')
      .expect(201);
    transfer = response.body.id;
    expect(response.body.archives).toEqual([
      { key: '01', fileName: 'MPTRA_01_2026-10-25-074935_Abt._Musterstadt.zip', label: 'Abt. Musterstadt' },
      { key: '11', fileName: 'MPTRA_11_2026-10-25-080043_Altersabt._Musterstadt.zip', label: 'Altersabt. Musterstadt' },
    ]);
    expect(response.body.datasets).toEqual([
      { profile: 'masterdata.persons', rowCount: 3 },
      { profile: 'masterdata.career', rowCount: 4 },
      { profile: 'respiratory-protection.examinations', rowCount: 1 },
      { profile: 'respiratory-protection.stress-exercises', rowCount: 1 },
      { profile: 'training.sessions', rowCount: 3 },
      { profile: 'incidents.mp-feuer', rowCount: 5 },
    ]);
  });

  it('creates current, former and veteran members without the department-local numbers', async () => {
    const preview = await run('masterdata.persons', false);
    expect(preview.body.counts).toMatchObject({ create: 3, error: 0 });
    expect(await personId('Probe')).toBeUndefined();

    expect((await run('masterdata.persons', true)).body.counts).toMatchObject({ create: 3, error: 0 });
    const anna = (await get(`/masterdata/persons/${await personId('Probe')}`)).body;
    expect(anna).toMatchObject({ status: 'active', personnelNumber: null, gender: 'female', joinedOn: '2010-03-01', email: 'anna@example.org' });
    const otto = (await get(`/masterdata/persons/${await personId('Weg')}`)).body;
    expect(otto).toMatchObject({ status: 'left', leftOn: '2018-06-30', exitReason: 'relocation' });
    const karl = (await get(`/masterdata/persons/${await personId('Alt')}`)).body;
    expect(karl).toMatchObject({ status: 'veterans', joinedOn: '1975-01-01' });
    expect(karl.memberships).toMatchObject([{ departmentId: ids.veterans, to: null }]);

    // A second transfer of the same data changes nothing.
    expect((await run('masterdata.persons', false)).body.counts).toMatchObject({ create: 0, update: 0, unchanged: 3 });
  });

  it('matches courses, ranks and honors to the catalog', async () => {
    const result = await run('masterdata.career', true);
    expect(result.body.counts).toMatchObject({ create: 3, error: 1 });
    expect(result.body.rows.find((r: { action: string }) => r.action === 'error').messages[0]).toMatchObject({ code: 'masterdata.import.unknownCatalogEntry', params: { name: 'Motorsägen-Grundlehrgang' } });
    const anna = (await get(`/masterdata/persons/${await personId('Probe')}`)).body;
    expect(anna.qualifications).toMatchObject([{ qualification: 'squad-leader', acquiredOn: '2018-05-05' }]);
    expect(anna.ranks).toMatchObject([{ rank: 'ofm', since: '2019-01-01' }]);
    expect(anna.honors).toMatchObject([{ honor: 'state-honor-silver', awardedOn: '2024-01-01' }]);

    // With the option, unknown names become catalog entries; known entries stay unchanged.
    const again = await run('masterdata.career', true, { createCatalogEntries: true });
    expect(again.body.counts).toMatchObject({ create: 1, unchanged: 3, error: 0 });
  });

  it('takes over G 26 examinations and stress exercises of current members', async () => {
    expect((await run('respiratory-protection.examinations', true)).body.counts).toMatchObject({ create: 1, error: 0 });
    expect((await run('respiratory-protection.stress-exercises', true)).body.counts).toMatchObject({ create: 1, error: 0 });
    const evidence = (await get(`/respiratory-protection/persons/${await personId('Probe')}`).expect(200)).body.evidence as { kind: string; date: string; validUntil: string | null }[];
    expect(evidence.map((e) => [e.kind, e.date])).toEqual(expect.arrayContaining([['examination', '2025-02-01'], ['training-track', '2025-03-01']]));
    expect(evidence.find((e) => e.kind === 'examination')?.validUntil).toBe('2028-02-01');
  });

  it('creates sessions with present and excused participants', async () => {
    const sessions = await run('training.sessions', true);
    expect(sessions.body.counts).toMatchObject({ create: 3, error: 0 });
    const [session] = (await get('/training/sessions?from=2025-05-05&to=2025-05-05')).body as { title: string; attendance: { personId: string; status: string; breathingApparatus: boolean }[] }[];
    expect(session.title).toBe('Löschangriff');
    const karl = await personId('Alt');
    expect(session.attendance.map((a) => [a.personId === karl ? 'karl' : 'anna', a.status, a.breathingApparatus]).toSorted()).toEqual([
      ['anna', 'present', true],
      ['karl', 'excused', false],
    ]);
  });

  it('creates incidents with report text, statistics and personnel and is repeatable', async () => {
    const result = await run('incidents.mp-feuer', true);
    expect(result.body.counts).toMatchObject({ create: 3, update: 2, error: 0 });
    const incidents = (await get('/incidents/incidents?from=2025-06-01&to=2025-06-02')).body as { dispatchNumber: string; alarmKeyword: string; reports: { id: string; departmentId: string; primary: boolean; status: string }[] }[];
    expect(incidents.map((i) => i.alarmKeyword).toSorted()).toEqual(['B1-MPT', 'Unterstützung Verwaltung']);
    const fire = incidents.find((i) => i.dispatchNumber === '1250000001')!;
    expect(fire.reports).toMatchObject([{ departmentId: ids.musterstadt, primary: true, status: 'released-billing' }]);
    const report = (await get(`/incidents/reports/${fire.reports[0].id}`)).body;
    expect(report.times.returnedAt).toBe('2025-06-01T10:00:00.000Z');
    expect(report).toMatchObject({ situation: 'Mülleimer in Vollbrand', actions: 'Abgelöscht\n\nMit Kübelspritze gelöscht.', incidentCommander: 'Probe Anna' });
    expect(report.statistics).toMatchObject({ mainType: 'fire', fireSize: 'small-a' });
    expect(report.personnel).toMatchObject([
      { personId: await personId('Probe'), vehicleId: ids.lf, breathingApparatus: true, function: 'machinist' },
      { personId: await personId('Alt'), from: '2025-06-01T08:30:00.000Z' },
    ]);

    const again = await run('incidents.mp-feuer', true);
    expect(again.body.counts).toMatchObject({ create: 0, update: 5, error: 0 });
    expect((await get('/incidents/incidents?from=2025-06-01&to=2025-06-02')).body).toHaveLength(2);
  });

  it('is discarded on request', async () => {
    await test.http.delete(`/api/core/imports/transfers/${transfer}`).set('Cookie', admin).set(UI).expect(204);
    await post(`/core/imports/transfers/${transfer}/preview`, { profile: 'masterdata.persons' }).expect(404);
  });
});
