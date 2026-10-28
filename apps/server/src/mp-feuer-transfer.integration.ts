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
const put = (path: string, body: unknown) => test.http.put(`/api${path}`).set('Cookie', admin).set(UI).send(body as object);

type Aliased = { id: string; key: string; aliases: string[] };
const catalogEntry = async (kind: string, key: string) => ((await get(`/masterdata/catalog?kind=${kind}`).expect(200)).body as Aliased[]).find((e) => e.key === key)!;

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
    { EIN_ID: 'EP1', EIN_INDEX: 'E1', EIN_PER_INDEX: 'P-ANNA', EIN_PER_NR: '0001', EIN_PER_NAME: 'Probe Anna', EIN_PER_ZEIT_V: '2025-06-01 10:00:00.000', EIN_PER_ZEIT_B: '2025-06-01 11:30:00.000', EIN_PER_MERKMAL_BE: 0, EIN_PER_MERKMAL_AS: 1, EIN_PER_MERKMAL_VA: 0, EIN_PER_AUFGABE: 'Maschinist', EIN_FZG_INDEX: 'F-LF', EIN_FZG_RUFNAME: '', EIN_FZG_BEZEICHNUNG: 'LF 20/16' },
  ],
  // The vehicle of the report with its own times and kilometres.
  EIN_FAHRZ: [
    { EIN_ID: 'EF1', EIN_INDEX: 'E1', EIN_FZG_INDEX: 'F-LF', EIN_FZG_BEZEICHNUNG: 'LF 20/16', EIN_FZG_ZEIT_ALARM: '2025-06-01 10:00:00.000', EIN_FZG_ZEIT_AUS: '2025-06-01 10:05:00.000', EIN_FZG_ZEIT_EIN: '2025-06-01 11:15:00.000', EIN_FZG_KILOMETER: '12' },
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
      { profile: 'incidents.mp-feuer', rowCount: 5, units: expect.objectContaining({ label: { de: 'Einsatzberichte als', en: 'Incident reports as' } }) },
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
    // The statistics of the primary report become those of the incident.
    expect((await get(`/incidents/incidents/${report.incidentId}`)).body.statistics).toMatchObject({ mainType: 'fire', fireSize: 'small-a' });
    expect(report).not.toHaveProperty('statistics');
    // Anna keeps her own end of MP-Feuer although her vehicle has times of its own; the alarm of the LF is that of the report.
    expect(report.personnel).toMatchObject([
      { personId: await personId('Probe'), vehicleId: ids.lf, breathingApparatus: true, function: 'machinist', from: '2025-06-01T08:00:00.000Z', to: '2025-06-01T09:30:00.000Z' },
      { personId: await personId('Alt'), from: '2025-06-01T08:30:00.000Z' },
    ]);
    expect(report.vehicles).toMatchObject([{ vehicleId: ids.lf, alarmedAt: null, departedAt: '2025-06-01T08:05:00.000Z', returnedAt: '2025-06-01T09:15:00.000Z', kilometres: 12 }]);

    const again = await run('incidents.mp-feuer', true);
    expect(again.body.counts).toMatchObject({ create: 0, update: 5, error: 0 });
    expect((await get('/incidents/incidents?from=2025-06-01&to=2025-06-02')).body).toHaveLength(2);
  });

  it('is discarded on request', async () => {
    await test.http.delete(`/api/core/imports/transfers/${transfer}`).set('Cookie', admin).set(UI).expect(204);
    await post(`/core/imports/transfers/${transfer}/preview`, { profile: 'masterdata.persons' }).expect(404);
  });
});

describe('MP-Feuer data transfer with entries chosen for unknown names', () => {
  let transfer: string;
  const departments = { '02': 'Abteilung Musterstadt' };
  const run = (profile: string, apply: boolean, mappings: Record<string, Record<string, string>> = {}, status = 200) =>
    post(`/core/imports/transfers/${transfer}/${apply ? 'apply' : 'preview'}`, { profile, departments, mappings }).expect(status);

  const archive = transferZip({
    PER_STAMM: [
      person('P-EVA', '0001', 'Eva', 'Neu'),
      person('P-PAUL', '0002', 'Paul', 'Fort', { PER_AKTIV_BD: '2019-06-30', PER_ARCHIV_DAT: '2019-07-01', PER_AKTIV_GRUND: 'Berufliche Gründe' }),
    ],
    PER_LEHRG: [
      { PER_ID: 'L1', PER_INDEX: 'P-EVA', PER_LEHRG_KURZ: '', PER_LEHRG_LANG: 'Drohnenpilot', PER_ZEITRAUM_VD: '2023-05-01', PER_ZEITRAUM_BD: '', PER_BESTAETIG_DAT: '', PER_GUELTIG_BD: '', PER_LEHRG_OK: 1 },
    ],
    PER_HIST: [
      { PER_ID: 'H1', PER_INDEX: 'P-EVA', PER_HIST_KATEGORIE_OW: 'Dienstgrad', PER_HIST_KURZ: '', PER_HIST_LANG: 'Brandmeisteranwärter', PER_ZEITRAUM_VD: '2024-01-01' },
      { PER_ID: 'H2', PER_INDEX: 'P-EVA', PER_HIST_KATEGORIE_OW: 'Ehrung', PER_HIST_KURZ: '', PER_HIST_LANG: 'Vereinsnadel in Gold', PER_ZEITRAUM_VD: '2024-02-01' },
    ],
    UPE_STAMM: [{ UPE_ID: 'U1', UPE_ZEIT_V: '2025-07-07 19:00:00.000', UPE_ZEIT_B: '2025-07-07 21:00:00.000', UPE_ART: 'Jugendprobe', UPE_THEMA: 'Knoten und Stiche' }],
    UPE_PERS: [{ UPE_ID: 'UP1', UPE_INDEX: 'U1', UPE_PER_INDEX: 'P-EVA', UPE_PER_NAME: 'Neu Eva', UPE_PER_MERKMAL_EN: 0, UPE_PER_MERKMAL_KR: 0, UPE_PER_MERKMAL_UR: 0, UPE_PER_MERKMAL_AS: 0 }],
    EIN_STAMM: [
      {
        EIN_ID: 'E1', EIN_NR: '2025-101', EIN_LS_NR: '1250000777', EIN_ZEIT_V: '2025-07-01 10:00:00.000', EIN_ZEIT_B: '2025-07-01 11:00:00.000',
        EIN_ALARMSTICHWORT: 'B 2 Wohnung', EIN_ART: 'Wohnungsbrand', EIN_KATEGORIE_OW: 'Brand', EIN_ERLAEUTERUNG: '', EIN_ORT: '', EIN_ORT_STRASSE: 'Am Markt 1', EIN_ORT_PLZ: '12345',
        EIN_ORT_ORT: 'Musterstadt', EIN_ORT_ORTSTEIL: '', EIN_ORT_ZUSATZ: '', EIN_ORT_OBJEKT: '', EIN_MERKMAL_ST_GLOBAL: 1, EIN_MERKMAL_KO: 0, EIN_ZUSATZ_2: '',
        EIN_LAGE: '', EIN_VERLAUF: '', EIN_BERICHT: '', EIN_URSACHE: '', EIN_LEITUNG: '', EIN_STATISTIK: '', EIN_RETTUNG_P_S: '', EIN_VERLUSTE_S: '', EIN_RETTUNG_T_S: '',
      },
    ],
    EIN_PERS: [
      { EIN_ID: 'EP1', EIN_INDEX: 'E1', EIN_PER_INDEX: 'P-EVA', EIN_PER_NR: '0001', EIN_PER_NAME: 'Neu Eva', EIN_PER_ZEIT_V: '2025-07-01 10:00:00.000', EIN_PER_ZEIT_B: '2025-07-01 11:00:00.000', EIN_PER_MERKMAL_BE: 0, EIN_PER_MERKMAL_AS: 0, EIN_PER_MERKMAL_VA: 0, EIN_PER_AUFGABE: 'Schlauchträger', EIN_FZG_RUFNAME: '', EIN_FZG_BEZEICHNUNG: 'MTW alt' },
    ],
  });

  it('reads the archive', async () => {
    const response = await test.http.post('/api/core/imports/transfers').set('Cookie', admin).set(UI).attach('files', archive, 'MPTRA_02_2026-10-25-074935_Abt._Musterstadt.zip').expect(201);
    transfer = response.body.id;
    expect(response.body.archives).toMatchObject([{ key: '02' }]);
  });

  it('lists the lookups and their entries', async () => {
    const lookups = (await get('/core/imports/lookups').expect(200)).body as { kind: string; creatable: boolean; keyFormat: string }[];
    expect(lookups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'qualification', creatable: true, keyFormat: 'slug' }),
        expect.objectContaining({ kind: 'vehicle', creatable: false }),
        expect.objectContaining({ kind: 'alarm-keyword', creatable: true, keyFormat: 'text' }),
        expect.objectContaining({ kind: 'session-type', creatable: true }),
      ]),
    );
    expect((await get('/core/imports/lookups/exit-reason').expect(200)).body).toEqual(expect.arrayContaining([{ key: 'own-request', name: { de: 'Auf eigenen Wunsch', en: 'Own request' } }]));
    await get('/core/imports/lookups/unknown').expect(404);
  });

  it('reports an unknown exit reason and takes over the chosen one', async () => {
    const preview = await run('masterdata.persons', false);
    expect(preview.body.unmatched).toEqual([{ kind: 'exit-reason', value: 'Berufliche Gründe', count: 1 }]);
    const paul = (preview.body.rows as { label: string; messages: unknown[] }[]).find((r) => r.label === 'Fort, Paul');
    expect(paul?.messages).toEqual([{ code: 'masterdata.import.unknownExitReason', params: { kind: 'exit-reason', value: 'Berufliche Gründe' } }]);

    const applied = await run('masterdata.persons', true, { 'exit-reason': { 'Berufliche Gründe': 'own-request' } });
    expect(applied.body).toMatchObject({ counts: { create: 2, error: 0 }, unmatched: [] });
    expect((await get(`/masterdata/persons/${await personId('Fort')}`)).body).toMatchObject({ status: 'left', exitReason: 'own-request' });
  });

  it('rejects mappings to entries or lookups that do not exist', async () => {
    expect((await run('masterdata.career', false, { rank: { Brandmeisteranwärter: 'no-such-rank' } }, 400)).body).toMatchObject({
      code: 'imports.unknownMappingTarget',
      kind: 'rank',
      value: 'Brandmeisteranwärter',
      key: 'no-such-rank',
    });
    expect((await run('masterdata.career', false, { planet: { Mars: 'mars' } }, 400)).body).toMatchObject({ code: 'imports.unknownLookup', kind: 'planet' });
  });

  it('assigns chosen and newly created catalog entries; ignored names stay errors', async () => {
    const preview = await run('masterdata.career', false);
    expect(preview.body.counts).toMatchObject({ create: 0, error: 3 });
    expect(preview.body.unmatched).toEqual([
      { kind: 'qualification', value: 'Drohnenpilot', count: 1 },
      { kind: 'rank', value: 'Brandmeisteranwärter', count: 1 },
      { kind: 'honor', value: 'Vereinsnadel in Gold', count: 1 },
    ]);
    expect(preview.body.rows[0].messages).toEqual([{ code: 'masterdata.import.unknownCatalogEntry', params: { kind: 'qualification', value: 'Drohnenpilot', name: 'Drohnenpilot' } }]);

    // A user who may import persons but not manage catalogs can choose entries, but not create them.
    const role = (await post('/core/roles', { name: 'Import ohne Katalog', permissions: [], permissionsAllDepartments: ['masterdata.persons.read', 'masterdata.persons.write'] }).expect(201)).body.id;
    await post('/core/users', { username: 'importer', displayName: 'Importer', password: 'auch-sehr-geheim', roles: [{ roleId: role, departmentId: null }] }).expect(201);
    const importer = await test.login({ username: 'importer', password: 'auch-sehr-geheim' });
    const lookups = (await test.http.get('/api/core/imports/lookups').set('Cookie', importer).expect(200)).body as { kind: string; creatable: boolean }[];
    expect(lookups.find((l) => l.kind === 'qualification')?.creatable).toBe(false);
    const denied = await test.http.post('/api/core/imports/lookups/qualification').set('Cookie', importer).set(UI).send({ key: 'drone-pilot', name: 'Drohnenpilot' }).expect(403);
    expect(denied.body).toMatchObject({ code: 'auth.forbidden', permissions: ['masterdata.catalogs.manage'] });

    const created = await post('/core/imports/lookups/qualification', { key: 'drone-pilot', name: 'Drohnenpilot' }).expect(201);
    expect(created.body).toEqual({ key: 'drone-pilot', name: { de: 'Drohnenpilot', en: 'Drohnenpilot' } });
    expect((await post('/core/imports/lookups/qualification', { key: 'drone-pilot', name: 'Drohnenpilot' }).expect(409)).body).toMatchObject({ code: 'catalog.keyTaken' });
    expect((await post('/core/imports/lookups/qualification', { key: 'Kein Schlüssel', name: 'X' }).expect(400)).body).toMatchObject({ code: 'validation.failed' });

    const mappings = { qualification: { Drohnenpilot: 'drone-pilot' }, rank: { Brandmeisteranwärter: 'bm' } };
    // The dry run remembers nothing.
    await run('masterdata.career', false, mappings);
    expect((await catalogEntry('rank', 'bm')).aliases).toEqual([]);
    const applied = await run('masterdata.career', true, mappings);
    expect(applied.body.counts).toMatchObject({ create: 2, error: 1 });
    expect(applied.body.unmatched).toEqual([{ kind: 'honor', value: 'Vereinsnadel in Gold', count: 1 }]);
    expect(applied.body.rows.find((r: { action: string }) => r.action === 'error').messages).toEqual([
      { code: 'masterdata.import.unknownCatalogEntry', params: { kind: 'honor', value: 'Vereinsnadel in Gold', name: 'Vereinsnadel in Gold' } },
    ]);
    const eva = (await get(`/masterdata/persons/${await personId('Neu')}`)).body;
    expect(eva.qualifications).toMatchObject([{ qualification: 'drone-pilot', acquiredOn: '2023-05-01' }]);
    expect(eva.ranks).toMatchObject([{ rank: 'bm', since: '2024-01-01' }]);
    expect(eva.honors).toEqual([]);

    // The choice is remembered as alias of the entry, unless the value is its name anyway.
    expect((await catalogEntry('rank', 'bm')).aliases).toEqual(['Brandmeisteranwärter']);
    expect((await catalogEntry('qualification', 'drone-pilot')).aliases).toEqual([]);
  });

  it('matches remembered aliases in the next import without asking', async () => {
    const again = await run('masterdata.career', false);
    expect(again.body.counts).toMatchObject({ create: 0, unchanged: 2, error: 1 });
    expect(again.body.unmatched).toEqual([{ kind: 'honor', value: 'Vereinsnadel in Gold', count: 1 }]);
    expect((await catalogEntry('exit-reason', 'own-request')).aliases).toEqual(['Berufliche Gründe']);
  });

  it('edits aliases of catalog entries; an alias points to one entry only', async () => {
    const { aliases: _aliases, ...body } = await catalogEntry('rank', 'bm');
    const bm = body;
    // Omitted aliases stay as they are.
    expect((await put(`/masterdata/catalog/${bm.id}`, body).expect(200)).body.aliases).toEqual(['Brandmeisteranwärter']);
    // Duplicates and the own name are dropped.
    expect((await put(`/masterdata/catalog/${bm.id}`, { ...body, aliases: ['Brandmeisteranwärter', 'brandmeister-anwärter', 'BM'] }).expect(200)).body.aliases).toEqual(['Brandmeisteranwärter']);
    const other = ((await get('/masterdata/catalog?kind=rank')).body as Aliased[]).find((e) => e.key !== 'bm')!;
    const taken = await put(`/masterdata/catalog/${other.id}`, { ...other, aliases: ['Brandmeister-Anwärter'] }).expect(409);
    expect(taken.body).toMatchObject({ code: 'masterdata.aliasTaken', alias: 'Brandmeister-Anwärter' });
    expect((await post('/masterdata/catalog', { kind: 'rank', key: 'bm-2', name: { de: 'BM 2', en: 'BM 2' }, aliases: ['Brandmeisteranwärter'] }).expect(409)).body).toMatchObject({ code: 'masterdata.aliasTaken' });

    // Removing a wrong alias: the name is unmatched again.
    await put(`/masterdata/catalog/${bm.id}`, { ...body, aliases: [] }).expect(200);
    expect((await run('masterdata.career', false)).body.unmatched).toEqual(
      expect.arrayContaining([{ kind: 'rank', value: 'Brandmeisteranwärter', count: 1 }]),
    );
    await put(`/masterdata/catalog/${bm.id}`, { ...body, aliases: ['Brandmeisteranwärter'] }).expect(200);
  });

  it('uses a chosen session type for unknown types', async () => {
    const preview = await run('training.sessions', false);
    expect(preview.body.unmatched).toEqual([{ kind: 'session-type', value: 'Jugendprobe', count: 1 }]);
    expect(preview.body.rows[0].messages).toEqual([{ code: 'training.import.unknownType', params: { kind: 'session-type', value: 'Jugendprobe' } }]);
    expect((await run('training.sessions', true, { 'session-type': { Jugendprobe: 'lesson' } })).body).toMatchObject({ counts: { create: 2, error: 0 }, unmatched: [] });
    const [session] = (await get('/training/sessions?from=2025-07-07&to=2025-07-07')).body as { type: string; title: string }[];
    expect(session).toMatchObject({ type: 'lesson', title: 'Knoten und Stiche' });

    const types = (await get('/training/types').expect(200)).body as (Aliased & Record<string, unknown>)[];
    const lesson = types.find((t) => t.key === 'lesson')!;
    expect(lesson.aliases).toEqual(['Jugendprobe']);
    expect((await run('training.sessions', false)).body.unmatched).toEqual([]);

    const other = types.find((t) => t.key === 'exercise')!;
    const taken = await put(`/training/types/${other.id}`, { ...other, aliases: ['jugend-probe'] }).expect(409);
    expect(taken.body).toMatchObject({ code: 'training.aliasTaken', alias: 'jugend-probe' });
    expect((await put(`/training/types/${lesson.id}`, { ...lesson, aliases: ['Jugendprobe', 'Jugenddienst'] }).expect(200)).body.aliases).toEqual(['Jugendprobe', 'Jugenddienst']);
  });

  it('assigns chosen functions, vehicles and keywords of incident personnel', async () => {
    const preview = await run('incidents.mp-feuer', false);
    expect(preview.body.unmatched).toEqual([
      { kind: 'alarm-keyword', value: 'B 2 Wohnung', count: 1 },
      { kind: 'vehicle', value: 'MTW alt', count: 1 },
      { kind: 'function', value: 'Schlauchträger', count: 1 },
    ]);
    const messages = (preview.body.rows as { messages: { code: string; params?: Record<string, string> }[] }[]).flatMap((r) => r.messages);
    expect(messages).toEqual(
      expect.arrayContaining([
        { code: 'incidents.import.keywordCreated', params: { kind: 'alarm-keyword', value: 'B 2 Wohnung' } },
        { code: 'incidents.api.unknownVehicle', params: { kind: 'vehicle', value: 'MTW alt' } },
        { code: 'incidents.import.unknownFunction', params: { kind: 'function', value: 'Schlauchträger' } },
      ]),
    );

    // A keyword whose key is its text, created from the import.
    expect((await post('/core/imports/lookups/alarm-keyword', { key: 'B2', name: 'B2 Wohnungsbrand' }).expect(201)).body).toMatchObject({ key: 'B2' });
    const mappings = { 'alarm-keyword': { 'B 2 Wohnung': 'B2' }, vehicle: { 'MTW alt': ids.lf }, function: { Schlauchträger: 'hose-team' } };
    const applied = await run('incidents.mp-feuer', true, mappings);
    expect(applied.body).toMatchObject({ counts: { error: 0 }, unmatched: [] });
    const [incident] = (await get('/incidents/incidents?from=2025-07-01&to=2025-07-01')).body as { alarmKeyword: string; reports: { id: string }[] }[];
    expect(incident.alarmKeyword).toBe('B2');
    const report = (await get(`/incidents/reports/${incident.reports[0].id}`)).body;
    expect(report.personnel).toMatchObject([{ personId: await personId('Neu'), vehicleId: ids.lf, function: 'hose-team' }]);

    const keywords = (await get('/incidents/keywords').expect(200)).body as (Aliased & Record<string, unknown>)[];
    const b2 = keywords.find((k) => k.key === 'B2')!;
    expect(b2.aliases).toEqual(['B 2 Wohnung']);
    const lf = ((await get('/masterdata/vehicles?includeRetired=true')).body as Aliased[]).find((v) => v.id === ids.lf)!;
    expect(lf.aliases).toEqual(['MTW alt']);
    expect((await catalogEntry('function', 'hose-team')).aliases).toEqual(['Schlauchträger']);

    // The next import matches without asking.
    const again = await run('incidents.mp-feuer', false);
    expect(again.body).toMatchObject({ counts: { error: 0 }, unmatched: [] });
    expect((again.body.rows as { messages: unknown[] }[]).flatMap((r) => r.messages)).toEqual([]);

    const other = keywords.find((k) => k.key !== 'B2')!;
    const taken = await put(`/incidents/keywords/${other.id}`, { ...other, aliases: ['b2 wohnung'] }).expect(409);
    expect(taken.body).toMatchObject({ code: 'incidents.aliasTaken', alias: 'b2 wohnung' });

    // Vehicles: an alias equal to the designation is dropped; removing the alias makes the name unknown again.
    const designation = (lf as Aliased & { designation: string }).designation;
    expect((await put(`/masterdata/vehicles/${lf.id}`, { ...lf, aliases: ['MTW alt', designation] }).expect(200)).body.aliases).toEqual(['MTW alt']);
    await put(`/masterdata/vehicles/${lf.id}`, { ...lf, aliases: [] }).expect(200);
    expect((await run('incidents.mp-feuer', false)).body.unmatched).toEqual([{ kind: 'vehicle', value: 'MTW alt', count: 1 }]);
  });
});

/** A report of the archive table `EIN_STAMM` (alarm keyword B1, released for billing). */
const incidentRow = (id: string, dispatchNumber: string, from: string, to: string, extra: Record<string, string | number>) => ({
  EIN_ID: id, EIN_NR: id, EIN_LS_NR: dispatchNumber, EIN_ZEIT_V: from, EIN_ZEIT_B: to, EIN_ALARMSTICHWORT: 'B1', EIN_ART: 'Kleinbrand', EIN_KATEGORIE_OW: 'Brand', EIN_ERLAEUTERUNG: '',
  EIN_ORT: '', EIN_ORT_STRASSE: 'Lindenweg 2', EIN_ORT_PLZ: '12345', EIN_ORT_ORT: 'Musterstadt', EIN_ORT_ORTSTEIL: '', EIN_ORT_ZUSATZ: '', EIN_ORT_OBJEKT: '', EIN_MERKMAL_ST_GLOBAL: 1,
  EIN_MERKMAL_KO: 0, EIN_ZUSATZ_2: 'zur Abrechnung freigegeben', EIN_LAGE: '', EIN_VERLAUF: '', EIN_BERICHT: '', EIN_URSACHE: '', EIN_LEITUNG: '', EIN_STATISTIK: '',
  EIN_RETTUNG_P_S: '', EIN_VERLUSTE_S: '', EIN_RETTUNG_T_S: '', ...extra,
});
const crewRow = (id: string, reportId: string, from: string, to: string) => ({
  EIN_ID: id, EIN_INDEX: reportId, EIN_PER_INDEX: '', EIN_PER_NR: '', EIN_PER_NAME: 'Probe Anna', EIN_PER_ZEIT_V: from, EIN_PER_ZEIT_B: to, EIN_PER_MERKMAL_BE: 0, EIN_PER_MERKMAL_AS: 0,
  EIN_PER_MERKMAL_VA: 0, EIN_PER_AUFGABE: '', EIN_FZG_RUFNAME: '', EIN_FZG_BEZEICHNUNG: '',
});

/** Values of the annual statistics 2025 by `question:column`. */
const annualValues = async () => {
  const values = (await get('/incidents/statistics/2025').expect(200)).body.values as { question: string; column: string; value: number }[];
  return (key: string) => values.find((v) => `${v.question}:${v.column}` === key)?.value ?? 0;
};

describe('MP-Feuer data transfer with the reports of the whole brigade as duty officer reports', () => {
  let transfer: string;
  const departments = { '00': 'Gesamtfeuerwehr', '03': 'Abteilung Musterstadt' };
  const run = (apply: boolean, units: Record<string, string> = {}, status = 200) =>
    post(`/core/imports/transfers/${transfer}/${apply ? 'apply' : 'preview'}`, { profile: 'incidents.mp-feuer', departments, units }).expect(status);

  // The archive "Gesamtfeuerwehr" holds the reports of the duty officers: one for an incident with Musterstadt, one alone.
  const brigade = transferZip({
    EIN_STAMM: [
      incidentRow('G1', '1250000900', '2025-08-01 14:00:00.000', '2025-08-01 16:00:00.000', { EIN_LAGE: 'Einsatzleitung übernommen', EIN_STATISTIK: '#L Kleinbrände A' }),
      incidentRow('G2', '1250000901', '2025-08-02 09:00:00.000', '2025-08-02 10:00:00.000', { EIN_LAGE: 'Kleinbrand, Lage allein erkundet', EIN_STATISTIK: '#L Kleinbrände A' }),
    ],
    EIN_PERS: [crewRow('GP1', 'G1', '2025-08-01 14:00:00.000', '2025-08-01 16:00:00.000')],
  });
  const department = transferZip({
    EIN_STAMM: [incidentRow('M1', '1250000900', '2025-08-01 14:00:00.000', '2025-08-01 16:30:00.000', { EIN_LAGE: 'Gartenhütte brennt', EIN_STATISTIK: '#L Kleinbrände B' })],
    EIN_PERS: [crewRow('MP1', 'M1', '2025-08-01 14:00:00.000', '2025-08-01 16:30:00.000')],
  });

  it('offers the units of the active modules for the incident reports of an archive', async () => {
    await post('/incidents/keywords/templates/bw', {}).expect(201);
    ids.brigade = (await post('/masterdata/departments', { name: 'Gesamtfeuerwehr', shortName: 'Gesamt', type: 'command' }).expect(201)).body.id;
    const response = await test.http
      .post('/api/core/imports/transfers')
      .set('Cookie', admin)
      .set(UI)
      .attach('files', brigade, 'MPTRA_00_2026-10-25-074935_Gesamtfeuerwehr.zip')
      .attach('files', department, 'MPTRA_03_2026-10-25-074935_Abt._Musterstadt.zip')
      .expect(201);
    transfer = response.body.id;
    expect(response.body.datasets).toEqual([
      {
        profile: 'incidents.mp-feuer',
        rowCount: 5,
        units: {
          label: { de: 'Einsatzberichte als', en: 'Incident reports as' },
          none: { de: 'Abteilungsbericht', en: 'Department report' },
          entries: [{ key: 'duty-officer', name: { de: 'Einsatzleiter vom Dienst', en: 'Duty officer' } }],
        },
      },
    ]);
  });

  it('takes no incident reports of departments that are not operational, and no unknown units', async () => {
    const preview = await run(false);
    expect(preview.body.counts).toMatchObject({ create: 2, error: 3 });
    const errors = (preview.body.rows as { action: string; messages: { code: string; params?: object }[] }[]).filter((r) => r.action === 'error');
    expect(errors.map((r) => r.messages[0])).toEqual(Array.from({ length: 3 }, () => ({ code: 'incidents.departmentNotOperational', params: { name: 'Gesamtfeuerwehr' } })));
    expect((await run(false, { '00': 'fire-chief' }, 400)).body).toMatchObject({ code: 'imports.unknownUnit', unit: 'fire-chief' });
  });

  it('imports the reports of an archive mapped to the duty officer as EvD reports; alone, an EvD report is primary and counts', async () => {
    const before = await annualValues();
    const applied = await run(true, { '00': 'duty-officer' });
    expect(applied.body.counts).toMatchObject({ create: 5, error: 0 });

    type Summary = { id: string; departmentId: string | null; unit: string | null; number: string; primary: boolean; status: string };
    const incidents = (await get('/incidents/incidents?from=2025-08-01&to=2025-08-02')).body as { dispatchNumber: string; statistics: object | null; reports: Summary[] }[];
    // Same dispatch number: the EvD report joins the incident of Musterstadt, whose report is primary.
    const joint = incidents.find((i) => i.dispatchNumber === '1250000900')!;
    expect(joint.reports).toEqual([
      expect.objectContaining({ departmentId: ids.musterstadt, unit: null, primary: true }),
      expect.objectContaining({ departmentId: null, unit: 'duty-officer', primary: false, number: 'EvD-2025-001', status: 'released-billing' }),
    ]);
    // The statistics of the incident are those of the primary report in MP-Feuer (Musterstadt), not of the EvD report.
    expect(joint.statistics).toMatchObject({ mainType: 'fire', fireSize: 'small-b' });
    const evd = (await get(`/incidents/reports/${joint.reports[1].id}`)).body;
    expect(evd).toMatchObject({ situation: 'Einsatzleitung übernommen', personnel: [expect.objectContaining({ personId: await personId('Probe') })] });

    // Only the duty officer: his report is the primary report and brings the statistics of the incident.
    const alone = incidents.find((i) => i.dispatchNumber === '1250000901')!;
    expect(alone.reports).toEqual([expect.objectContaining({ unit: 'duty-officer', primary: true, number: 'EvD-2025-002' })]);
    expect(alone.statistics).toMatchObject({ mainType: 'fire', fireSize: 'small-a' });

    // Each incident counts once in the annual statistics, with its statistics.
    const after = await annualValues();
    expect(after('F28:D') - before('F28:D')).toBe(2);
    expect(after('F29:D') - before('F29:D')).toBe(1);
    expect(after('F30:D') - before('F30:D')).toBe(1);

    // Importing again replaces the reports instead of duplicating them.
    expect((await run(true, { '00': 'duty-officer' })).body.counts).toMatchObject({ create: 0, update: 5, error: 0 });
    expect((await get('/incidents/incidents?from=2025-08-01&to=2025-08-02')).body.flatMap((i: { reports: unknown[] }) => i.reports)).toHaveLength(3);
  });
});

/** A course of Erna Kurs in an MP-Feuer archive. */
const course = (id: string, name: string, from: string) => ({ PER_ID: id, PER_INDEX: 'P-ERNA', PER_LEHRG_KURZ: '', PER_LEHRG_LANG: name, PER_ZEITRAUM_VD: from, PER_ZEITRAUM_BD: '', PER_BESTAETIG_DAT: '', PER_GUELTIG_BD: '', PER_LEHRG_OK: 1 });
/** Qualifications "other course" of Erna Kurs. */
const otherCourses = async () =>
  ((await get(`/masterdata/persons/${await personId('Kurs')}`).expect(200)).body.qualifications as { qualification: string; acquiredOn: string; description: string }[])
    .filter((q) => q.qualification === 'other-course')
    .map(({ acquiredOn, description }) => ({ acquiredOn, description }));

describe('MP-Feuer data transfer with courses assigned to the collective entry "other course"', () => {
  let transfer: string;
  const departments = { '03': 'Abteilung Musterstadt' };
  const run = (profile: string, apply: boolean, mappings: Record<string, Record<string, string>> = {}) =>
    post(`/core/imports/transfers/${transfer}/${apply ? 'apply' : 'preview'}`, { profile, departments, mappings }).expect(200);
  const archive = transferZip({
    PER_STAMM: [person('P-ERNA', '0001', 'Erna', 'Kurs')],
    PER_LEHRG: [course('L1', 'Erste Hilfe', '2022-03-01'), course('L2', 'Holz in Spannung', '2023-04-01'), course('L3', 'Anderer Lehrgang', '2023-05-01')],
  });

  it('reads the archive and the person', async () => {
    const response = await test.http.post('/api/core/imports/transfers').set('Cookie', admin).set(UI).attach('files', archive, 'MPTRA_03_2026-10-28-074935_Abt._Musterstadt.zip').expect(201);
    transfer = response.body.id;
    expect((await run('masterdata.persons', true)).body.counts).toMatchObject({ create: 1, error: 0 });
  });

  it('keeps the original names as descriptions; the entry name alone describes nothing', async () => {
    const preview = await run('masterdata.career', false);
    expect(preview.body.unmatched).toEqual([
      { kind: 'qualification', value: 'Erste Hilfe', count: 1 },
      { kind: 'qualification', value: 'Holz in Spannung', count: 1 },
    ]);
    const mappings = { qualification: { 'Erste Hilfe': 'other-course', 'Holz in Spannung': 'other-course' } };
    const applied = await run('masterdata.career', true, mappings);
    expect(applied.body.counts).toMatchObject({ create: 2, error: 1 });
    expect(applied.body.rows.find((r: { action: string }) => r.action === 'error').messages).toEqual([{ code: 'masterdata.descriptionRequired' }]);
    expect(await otherCourses()).toEqual([
      { acquiredOn: '2022-03-01', description: 'Erste Hilfe' },
      { acquiredOn: '2023-04-01', description: 'Holz in Spannung' },
    ]);
    // The choices are remembered as aliases, so the next import assigns the names without asking.
    expect((await catalogEntry('qualification', 'other-course')).aliases).toEqual(['Erste Hilfe', 'Holz in Spannung']);
  });

  it('finds the described entries again in a repeated import', async () => {
    const again = await run('masterdata.career', true);
    expect(again.body).toMatchObject({ counts: { create: 0, unchanged: 2, error: 1 }, unmatched: [] });
    expect(await otherCourses()).toHaveLength(2);
  });
});

/** A person of the report E1 (2025-09-01) with the text of the column "Aufgabe". */
const taskRow = (id: string, personIndex: string, name: string, task: string) => ({
  EIN_ID: id, EIN_INDEX: 'E1', EIN_PER_INDEX: personIndex, EIN_PER_NR: '', EIN_PER_NAME: name, EIN_PER_ZEIT_V: '2025-09-01 10:00:00.000', EIN_PER_ZEIT_B: '2025-09-01 11:00:00.000',
  EIN_PER_MERKMAL_BE: 0, EIN_PER_MERKMAL_AS: 0, EIN_PER_MERKMAL_VA: 0, EIN_PER_AUFGABE: task, EIN_FZG_RUFNAME: '', EIN_FZG_BEZEICHNUNG: '',
});
const functionMessages = (body: { rows: { messages: { code: string }[] }[] }) => body.rows.flatMap((r) => r.messages).filter((m) => m.code === 'incidents.import.unknownFunction');

describe('MP-Feuer data transfer with function texts that are no function', () => {
  let transfer: string;
  const departments = { '04': 'Abteilung Musterstadt' };
  const run = (profile: string, apply: boolean, mappings: Record<string, Record<string, string>> = {}, status = 200) =>
    post(`/core/imports/transfers/${transfer}/${apply ? 'apply' : 'preview'}`, { profile, departments, mappings }).expect(status);
  const archive = transferZip({
    PER_STAMM: [person('P-WORK', '0001', 'Wolf', 'Arbeit'), person('P-LOSS', '0002', 'Vera', 'Ausfall'), person('P-NONE', '0003', 'Ingo', 'Nix'), person('P-FUNC', '0004', 'Fritz', 'Funk')],
    EIN_STAMM: [incidentRow('E1', '1250000888', '2025-09-01 10:00:00.000', '2025-09-01 11:00:00.000', { EIN_ZUSATZ_2: '' })],
    EIN_PERS: [
      taskRow('EP1', 'P-WORK', 'Arbeit Wolf', 'Arbeitszeit Stadt Erbach'),
      taskRow('EP2', 'P-LOSS', 'Ausfall Vera', 'Verdienstausfall Firma'),
      taskRow('EP3', 'P-NONE', 'Nix Ingo', 'Bauhof'),
      taskRow('EP4', 'P-FUNC', 'Funk Fritz', 'Wassertruppmann'),
    ],
  });
  const targets = { work: 'incidents:during-working-hours', loss: 'incidents:loss-of-earnings', ignore: 'incidents:ignore' };
  type Personnel = { personId: string; function: string | null; duringWorkingHours: boolean; lossOfEarnings: boolean };
  /** Function and flags of the personnel by last name. */
  const personnel = async () => {
    const [incident] = (await get('/incidents/incidents?from=2025-09-01&to=2025-09-01')).body as { reports: { id: string }[] }[];
    const report = (await get(`/incidents/reports/${incident.reports[0].id}`).expect(200)).body as { personnel: Personnel[] };
    const names = new Map<string | undefined, string>();
    for (const name of ['Arbeit', 'Ausfall', 'Nix', 'Funk']) names.set(await personId(name), name);
    return Object.fromEntries(report.personnel.map((p) => [names.get(p.personId), { function: p.function, duringWorkingHours: p.duringWorkingHours, lossOfEarnings: p.lossOfEarnings }]));
  };

  it('reads the archive and the persons', async () => {
    const response = await test.http.post('/api/core/imports/transfers').set('Cookie', admin).set(UI).attach('files', archive, 'MPTRA_04_2026-10-28-074935_Abt._Musterstadt.zip').expect(201);
    transfer = response.body.id;
    expect((await run('masterdata.persons', true)).body.counts).toMatchObject({ create: 4, error: 0 });
  });

  it('offers the targets after the functions of the catalog', async () => {
    const entries = (await get('/core/imports/lookups/function').expect(200)).body as { key: string }[];
    expect(entries.map((e) => e.key)).toContain('hose-team');
    expect(entries.slice(-3)).toEqual([
      { key: targets.work, name: { de: 'Keine Funktion – Einsatz während der Arbeitszeit beim Dienstherrn', en: expect.any(String) } },
      { key: targets.loss, name: { de: 'Keine Funktion – Verdienstausfall', en: expect.any(String) } },
      { key: targets.ignore, name: { de: 'Keine Funktion (ignorieren)', en: expect.any(String) } },
    ]);
    expect((await run('incidents.mp-feuer', false, { function: { Bauhof: 'incidents:nothing' } }, 400)).body).toMatchObject({ code: 'imports.unknownMappingTarget', key: 'incidents:nothing' });
  });

  it('sets the flags of the chosen targets without a function and remembers them', async () => {
    const preview = await run('incidents.mp-feuer', false);
    expect(preview.body.unmatched).toHaveLength(4);
    expect(preview.body.unmatched).toEqual(
      expect.arrayContaining(['Arbeitszeit Stadt Erbach', 'Verdienstausfall Firma', 'Bauhof', 'Wassertruppmann'].map((value) => ({ kind: 'function', value, count: 1 }))),
    );

    const mappings = { function: { 'Arbeitszeit Stadt Erbach': targets.work, 'Verdienstausfall Firma': targets.loss, Bauhof: targets.ignore, Wassertruppmann: 'water-team' } };
    const applied = await run('incidents.mp-feuer', true, mappings);
    expect(applied.body).toMatchObject({ counts: { error: 0 }, unmatched: [] });
    expect(functionMessages(applied.body)).toEqual([]);
    expect(await personnel()).toEqual({
      Arbeit: { function: null, duringWorkingHours: true, lossOfEarnings: false },
      Ausfall: { function: null, duringWorkingHours: false, lossOfEarnings: true },
      Nix: { function: null, duringWorkingHours: false, lossOfEarnings: false },
      Funk: { function: 'water-team', duringWorkingHours: false, lossOfEarnings: false },
    });
    // The targets are remembered by the incidents module, functions still as aliases of the catalog entry.
    expect((await get('/core/settings/incidents.importFunctionRules').expect(200)).body.rules).toEqual(
      expect.arrayContaining([
        { value: 'Arbeitszeit Stadt Erbach', target: 'during-working-hours' },
        { value: 'Verdienstausfall Firma', target: 'loss-of-earnings' },
        { value: 'Bauhof', target: 'ignore' },
      ]),
    );
    expect((await catalogEntry('function', 'water-team')).aliases).toEqual(['Wassertruppmann']);
  });

  it('applies the remembered targets in the next import without asking', async () => {
    const again = await run('incidents.mp-feuer', true);
    expect(again.body).toMatchObject({ counts: { error: 0 }, unmatched: [] });
    expect(functionMessages(again.body)).toEqual([]);
    expect(await personnel()).toMatchObject({ Arbeit: { function: null, duringWorkingHours: true }, Ausfall: { lossOfEarnings: true }, Nix: { function: null }, Funk: { function: 'water-team' } });
  });
});
