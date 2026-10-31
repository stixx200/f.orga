import { EntityManager } from '@mikro-orm/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MpFeuerRun } from '@forga/mp-feuer-contracts';
import { countsOf, mpFeuerClient, mpPerson as person, transferZip } from './testing/mp-feuer';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

/** The module MP-Feuer: transfer files read into a run, dry run, mappings, background apply in parts. */
let test: TestApp;
let admin: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const put = (path: string, body: unknown) => test.http.put(`/api${path}`).set('Cookie', admin).set(UI).send(body as object);
const del = (path: string, cookie = admin) => test.http.delete(`/api${path}`).set('Cookie', cookie).set(UI);
let mp: ReturnType<typeof mpFeuerClient>;

const catalogEntry = async (kind: string, key: string) => ((await get(`/masterdata/catalog?kind=${kind}`).expect(200)).body as Record<string, unknown>[]).find((e) => e['key'] === key)!;
const personId = async (lastName: string) =>
  ((await get('/masterdata/persons?includeLeft=true')).body as { id: string; lastName: string }[]).find((p) => p.lastName === lastName)?.id;
const audit = async (action: string) => (await get(`/core/audit?action=${action}`).expect(200)).body as { action: string; details: Record<string, unknown> }[];

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
    { PER_ID: 'H4', PER_INDEX: 'P-ANNA', PER_HIST_KATEGORIE_OW: 'Funktion', PER_HIST_KURZ: '', PER_HIST_LANG: 'Abteilungskommandant', PER_ZEITRAUM_VD: '2021-01-01', PER_ZEITRAUM_BD: '' },
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
      EIN_LAGE: 'Mülleimer in Vollbrand', EIN_VERLAUF: 'Abgelöscht', EIN_BERICHT: 'Mit Kübelspritze gelöscht.', EIN_BEMERKUNG: 'Nachkontrolle', EIN_URSACHE: '', EIN_LEITUNG: 'Probe Anna', EIN_STATISTIK: '#L Kleinbrände A',
      EIN_RETTUNG_P_S: '', EIN_VERLUSTE_S: '', EIN_RETTUNG_T_S: '', EIN_WETTEREINFLUSS: 'negativer Einfluß', EIN_WETTERLAGE: 'Starkregen',
    },
    {
      EIN_ID: 'E2', EIN_NR: '2025-002', EIN_LS_NR: '', EIN_ZEIT_V: '2025-06-02 08:00:00.000', EIN_ZEIT_B: '2025-06-02 09:00:00.000',
      EIN_ALARMSTICHWORT: '', EIN_ART: 'Unterstützung Verwaltung', EIN_KATEGORIE_OW: 'Sonstiges', EIN_ERLAEUTERUNG: '', EIN_ORT: 'Musterstadt', EIN_ORT_STRASSE: '', EIN_ORT_PLZ: '',
      EIN_ORT_ORT: '', EIN_ORT_ORTSTEIL: '', EIN_ORT_ZUSATZ: '', EIN_ORT_OBJEKT: '', EIN_MERKMAL_ST_GLOBAL: 1, EIN_MERKMAL_KO: 0, EIN_ZUSATZ_2: '',
      EIN_LAGE: '', EIN_VERLAUF: '', EIN_BERICHT: 'Nur im Bericht beschrieben.', EIN_URSACHE: '', EIN_LEITUNG: '', EIN_STATISTIK: '', EIN_RETTUNG_P_S: '', EIN_VERLUSTE_S: '', EIN_RETTUNG_T_S: '',
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
    { EIN_ID: 'EF2', EIN_INDEX: 'E1', EIN_FZG_INDEX: 'F-MTW', EIN_FZG_BEZEICHNUNG: 'MTW', EIN_FZG_ZEIT_AUS: '2025-06-01 10:06:00.000', EIN_FZG_ZEIT_EIN: '2025-06-01 11:20:00.000', EIN_FZG_KILOMETER: '8' },
  ],
  EIN_MAT: [{ EIN_ID: 'EM1', EIN_INDEX: 'E1', EIN_MAT_BEZEICHNUNG: 'Scheinwerfer', EIN_MAT_ANZAHL: '2', EIN_MAT_EINHEIT: 'Stk.', EIN_MAT_INVENTAR_NR: '' }],
  EIN_SOEK: [{ EIN_ID: 'ES1', EIN_INDEX: 'E1', EIN_SOEK_BEZEICHNUNG: 'Polizei', EIN_SOEK_BESATZUNG: '2', EIN_SOEK_FAHRZEUG: '1' }],
  EIN_BETR: [{ EIN_ID: 'EB1', EIN_INDEX: 'E1', EIN_BETR_VORNAME: 'Eva', EIN_BETR_NACHNAME: 'Zeugin', EIN_BETR_MERKMAL_ZE: 1, EIN_BETR_STRASSE: 'Hauptstr. 1', EIN_BETR_PLZ: '12345', EIN_BETR_ORT: 'Musterstadt', EIN_BETR_KENNZEICHEN: 'UL-EZ 1', EIN_BETR_FIRMA: '' }],
  GSO_STAMM: [{ GSO_ID: 'G1', GSO_NR: '16', GSO_BEZEICHNUNG: 'Motorsäge', GSO_GRUPPE: 'Rettungsgeräte', GSO_HERSTELLER: 'Dönges', GSO_HERST_NR: '50', GSO_STATUS: 'aktiv', GSO_ANZAHL: '1' }],
  GSO_PRUEF: [{ GSO_ID: 'GP1', GSO_INDEX: 'G1', GSO_PRUEF_DAT: '2024-04-01', GSO_PRUEF_LANG: 'Jährliche Prüfung', GSO_GUELTIG_BD: '2025-04-01', GSO_PRUEF_OK: 1 }],
  KLD_STAMM: [{ KLD_ID: 'K1', KLD_NR: '1', KLD_BEZEICHNUNG: 'Einsatz-Jacke', KLD_GROESSE: '52', KLD_HERSTELLER: 'S-GARD', KLD_STATUS: 'aktiv', KLD_INVENTAR_NR: 'JK-1' }],
});

const veterans = transferZip({
  PER_STAMM: [person('P-KARL', '0001', 'Karl', 'Alt', { PER_GEB_DAT: '1950-05-05', PER_AKTIV_VD: '1975-01-01', PER_AKTIV_BD: '2010-12-31' })],
});

const FILES: [Buffer, string][] = [
  [musterstadt, 'MPTRA_01_2026-10-25-074935_Abt._Musterstadt.zip'],
  [veterans, 'MPTRA_11_2026-10-25-080043_Altersabt._Musterstadt.zip'],
];

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  mp = mpFeuerClient(test, () => admin);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/masterdata/courses/templates/bw', {}).expect(201);
  await post('/training/types/templates/bw', {}).expect(201);
  await post('/equipment/templates/dguv', {}).expect(201);
  await post('/clothing/articles/template', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.veterans = (await post('/masterdata/departments', { name: 'Altersabteilung Musterstadt', shortName: 'Alters Musterstadt', type: 'veterans', parentId: ids.musterstadt }).expect(201)).body.id;
  ids.lf = (await post('/masterdata/vehicles', { designation: 'LF 20/16', vehicleType: 'lf-20-16', departmentId: ids.musterstadt }).expect(201)).body.id;
  ids.mtw = (await post('/masterdata/vehicles', { designation: 'MTW', vehicleType: 'mtw', departmentId: ids.musterstadt }).expect(201)).body.id;
});

afterAll(() => test?.app.close());

describe('MP-Feuer: a run from upload to apply', () => {
  let run: MpFeuerRun;

  it('rejects files that are no transfer archives', async () => {
    const body = await mp.upload([[Buffer.from('kein zip'), 'MPTRA_01_x_Abt._Musterstadt.zip']], 400);
    expect(body).toMatchObject({ code: 'mp-feuer.archiveUnreadable', name: 'MPTRA_01_x_Abt._Musterstadt.zip' });
  });

  it('reads all archives into a run with datasets in import order and suggests departments by name', async () => {
    run = await mp.upload(FILES);
    expect(run).toMatchObject({ status: 'prepared', createdBy: 'Admin', dryRunOutdated: false });
    expect(run.archives).toEqual([
      { key: '01', fileName: FILES[0][1], label: 'Abt. Musterstadt', content: { persons: 3, incidents: 3, sessions: 1 }, department: 'Abteilung Musterstadt', unit: null, skip: false, remembered: false, superseded: [] },
      { key: '11', fileName: FILES[1][1], label: 'Altersabt. Musterstadt', content: { persons: 1, incidents: 0, sessions: 0 }, department: 'Altersabteilung Musterstadt', unit: null, skip: false, remembered: false, superseded: [] },
    ]);
    expect(run.datasets.map((d) => [d.profile, d.rowCount, d.enabled, d.locked])).toEqual([
      ['masterdata.persons', 3, true, false],
      ['masterdata.career', 6, true, false],
      ['respiratory-protection.examinations', 1, true, false],
      ['respiratory-protection.stress-exercises', 1, true, false],
      ['training.sessions', 3, true, false],
      ['equipment.inventory', 1, true, false],
      ['clothing.inventory', 1, true, false],
      ['incidents.personnel', 6, true, false],
    ]);
    // Choosing entries replaces creating catalog entries blindly; options of the profiles otherwise as offered.
    expect(run.datasets.find((d) => d.profile === 'masterdata.career')?.optionInfo).toEqual([]);
    expect(run.datasets.find((d) => d.profile === 'incidents.personnel')?.options).toEqual({ createKeywords: true });
    expect(run.units?.entries).toEqual([{ key: 'duty-officer', name: { de: 'Einsatzleiter vom Dienst', en: 'Duty officer' } }]);
  });

  it('needs a dry run with the current selection before the apply', async () => {
    expect((await post(`/mp-feuer/runs/${run.id}/apply`, {}).expect(409)).body.code).toBe('mp-feuer.dryRunOutdated');
    expect((await mp.select(run.id, { archives: { '01': { department: 'Abteilung Nirgendwo' } } }, 400)).code).toBe('mp-feuer.unknownDepartment');
    expect((await mp.select(run.id, { archives: { '01': { department: 'Abteilung Musterstadt', unit: 'fire-chief' } } }, 400)).code).toBe('mp-feuer.unknownUnit');
    expect((await mp.select(run.id, { mappings: { planet: { Mars: 'mars' } } }, 400)).code).toBe('imports.unknownLookup');

    // Only persons for the first check: nothing is written.
    const off = Object.fromEntries(run.datasets.map((d) => [d.profile, { enabled: d.profile === 'masterdata.persons' }]));
    await mp.select(run.id, { datasets: off });
    const checked = await mp.dryRun(run.id);
    expect(checked).toMatchObject({ status: 'checked', phase: 'dry-run', dryRunOutdated: false, error: null });
    expect(countsOf(checked, 'masterdata.persons')).toEqual({ create: 3, update: 0, unchanged: 0, error: 0 });
    expect(await personId('Probe')).toBeUndefined();

    // Changing the selection outdates the dry run.
    const all = Object.fromEntries(run.datasets.map((d) => [d.profile, { enabled: true }]));
    expect((await mp.select(run.id, { datasets: all })).dryRunOutdated).toBe(true);
    expect((await post(`/mp-feuer/runs/${run.id}/apply`, {}).expect(409)).body.code).toBe('mp-feuer.dryRunOutdated');
  });

  it('applies in the background and reports counts, messages and progress', async () => {
    await mp.dryRun(run.id);
    const applied = await mp.apply(run.id);
    expect(applied).toMatchObject({ status: 'applied', phase: 'apply', error: null, progress: { rowsDone: 22, rows: 22 } });
    expect(countsOf(applied, 'masterdata.persons')).toMatchObject({ create: 3, error: 0 });
    expect(countsOf(applied, 'masterdata.career')).toMatchObject({ create: 4, error: 2 });
    expect(countsOf(applied, 'clothing.inventory')).toMatchObject({ create: 1, error: 0 });
    expect(countsOf(applied, 'equipment.inventory')).toMatchObject({ create: 1, error: 0 });
    expect(countsOf(applied, 'incidents.personnel')).toMatchObject({ create: 4, update: 2, error: 0 });
    // Unknown keywords are created (option) and offered for a mapping.
    expect(applied.unmatched).toEqual([
      { kind: 'qualification', value: 'Motorsägen-Grundlehrgang', count: 1 },
      { kind: 'office', value: 'Maschinist', count: 1 },
      { kind: 'alarm-keyword', value: 'B1-MPT', count: 2 },
      { kind: 'alarm-keyword', value: 'Unterstützung Verwaltung', count: 1 },
    ]);

    const anna = (await get(`/masterdata/persons/${await personId('Probe')}`)).body;
    expect(anna).toMatchObject({ status: 'active', personnelNumber: null, gender: 'female', email: 'anna@example.org' });
    expect(anna.qualifications).toMatchObject([{ qualification: 'squad-leader', acquiredOn: '2018-05-05' }]);
    expect(anna.offices).toMatchObject([{ office: 'department-commander', departmentId: ids.musterstadt, from: '2021-01-01', to: null }]);
    expect((await get(`/masterdata/persons/${await personId('Alt')}`)).body.memberships).toMatchObject([{ departmentId: ids.veterans, to: null }]);
    const evidence = (await get(`/respiratory-protection/persons/${await personId('Probe')}`).expect(200)).body.evidence as { kind: string; date: string }[];
    expect(evidence.map((e) => [e.kind, e.date])).toEqual(expect.arrayContaining([['examination', '2025-02-01'], ['training-track', '2025-03-01']]));
    const [session] = (await get('/training/sessions?from=2025-05-05&to=2025-05-05')).body as { title: string }[];
    expect(session.title).toBe('Löschangriff');
    const pieces = (await get('/clothing/items')).body as { inventoryNumber: string; articleKey: string; size: string; status: string }[];
    expect(pieces).toContainEqual(expect.objectContaining({ inventoryNumber: 'JK-1', articleKey: 'jacket', size: '52', status: 'stock' }));

    // Incidents: report text, status from "Zusatzfeld 2", statistics from the key, managed by MP-Feuer.
    const incidents = (await get('/incidents/incidents?from=2025-06-01&to=2025-06-02')).body as { dispatchNumber: string; alarmKeyword: string; reports: { id: string; primary: boolean; status: string }[] }[];
    const fire = incidents.find((i) => i.dispatchNumber === '1250000001')!;
    expect(fire.reports).toMatchObject([{ primary: true, status: 'released-billing' }]);
    const report = (await get(`/incidents/reports/${fire.reports[0].id}`)).body;
    expect(report).toMatchObject({
      managedBy: 'mp-feuer',
      lockedBy: 'MP-Feuer',
      situation: 'Mülleimer in Vollbrand',
      actions: 'Abgelöscht\n\nMit Kübelspritze gelöscht.\n\nNachkontrolle',
      equipment: '2 Stk. Scheinwerfer',
      weather: { influence: true, conditions: ['rain'] },
      otherAgencies: [{ organization: 'police', forces: 2, vehicles: 1 }],
      involvedParties: [{ role: 'witness', name: 'Eva Zeugin', licensePlate: 'UL-EZ 1', city: 'Musterstadt' }],
    });
    expect(report.vehicles.map((v: { vehicleId: string }) => v.vehicleId).toSorted()).toEqual([ids.lf, ids.mtw].toSorted());
    const support = incidents.find((i) => i.alarmKeyword === 'Unterstützung Verwaltung')!;
    expect((await get(`/incidents/reports/${support.reports[0].id}`)).body.situation).toBe('siehe Bericht');
    expect((await get(`/incidents/incidents/${report.incidentId}`)).body.statistics).toMatchObject({ mainType: 'fire', fireSize: 'small-a' });
    expect(report.personnel).toMatchObject([{ personId: await personId('Probe'), vehicleId: ids.lf, function: 'machinist' }, { personId: await personId('Alt') }]);

    // The result report groups the messages; the CSV holds every row with a message.
    const result = await mp.report(run.id);
    expect(result.run).toMatchObject({ status: 'applied', files: FILES.map((f) => f[1]) });
    expect(result.messages).toContainEqual(
      expect.objectContaining({ code: 'masterdata.import.unknownCatalogEntry', value: 'Motorsägen-Grundlehrgang', error: true, count: 1, examples: [expect.objectContaining({ dataset: 'masterdata.career', archive: '01' })] }),
    );
    const csv = await get(`/mp-feuer/runs/${run.id}/report?format=csv`).expect(200).expect('Content-Type', /text\/csv/);
    expect(csv.text).toContain('masterdata.career;01;');
    expect(csv.text).toContain('masterdata.import.unknownCatalogEntry');

    // The rows read are gone after the apply; the run stays in the history.
    expect((await get('/mp-feuer/runs').expect(200)).body[0]).toMatchObject({ id: run.id, status: 'applied', files: FILES.map((f) => f[1]) });
    const rows = await test.app.get(EntityManager).fork().getConnection().execute(`select count(*)::int as n from mp_feuer.run_dataset where run_id = ? and rows is not null`, [run.id]);
    expect(rows[0].n).toBe(0);

    // Audit: the run and every part, with the source.
    expect((await audit('mp-feuer.run-applied'))[0].details).toMatchObject({ runId: run.id, counts: expect.objectContaining({ 'masterdata.persons': expect.any(Object) }) });
    const parts = (await audit('imports.applied')).filter((e) => (e.details['source'] as { runId?: string })?.runId === run.id);
    expect(parts).toHaveLength(8);
    expect(parts[0].details).toMatchObject({ source: { module: 'mp-feuer', runId: run.id }, part: 1, parts: 1 });
  });

  it('remembers the assignment and repeats without duplicating', async () => {
    const again = await mp.upload(FILES);
    expect(again.archives.map((a) => [a.key, a.department, a.remembered])).toEqual([
      ['01', 'Abteilung Musterstadt', true],
      ['11', 'Altersabteilung Musterstadt', true],
    ]);
    expect((await get('/mp-feuer/remembered').expect(200)).body).toMatchObject({ archives: { '01': { department: 'Abteilung Musterstadt', skip: false } } });
    await mp.dryRun(again.id);
    const applied = await mp.apply(again.id);
    expect(countsOf(applied, 'masterdata.persons')).toMatchObject({ create: 0, unchanged: 3 });
    expect(countsOf(applied, 'incidents.personnel')).toMatchObject({ create: 0, update: 6, error: 0 });
    expect((await get('/incidents/incidents?from=2025-06-01&to=2025-06-02')).body).toHaveLength(2);
  });

  it('discards a prepared run with its rows, but not an applied one', async () => {
    const prepared = await mp.upload(FILES);
    await del(`/mp-feuer/runs/${prepared.id}`).expect(204);
    await get(`/mp-feuer/runs/${prepared.id}`).expect(404);
    expect((await del(`/mp-feuer/runs/${run.id}`).expect(409)).body.code).toBe('mp-feuer.runFinished');
  });
});

const allOn = (run: MpFeuerRun) => Object.fromEntries(run.datasets.map((d) => [d.profile, { enabled: true }]));

describe('MP-Feuer: mappings of unknown names', () => {
  const archive = transferZip({
    PER_STAMM: [person('P-EVA', '0001', 'Eva', 'Neu'), person('P-WOLF', '0002', 'Wolf', 'Arbeit'), person('P-ERNA', '0003', 'Erna', 'Kurs')],
    PER_LEHRG: [
      { PER_ID: 'L1', PER_INDEX: 'P-EVA', PER_LEHRG_KURZ: '', PER_LEHRG_LANG: 'Drohnenpilot', PER_ZEITRAUM_VD: '2023-05-01', PER_ZEITRAUM_BD: '', PER_BESTAETIG_DAT: '', PER_GUELTIG_BD: '', PER_LEHRG_OK: 1 },
      // Assigned to the collective entry "other course": the name becomes the description.
      { PER_ID: 'L2', PER_INDEX: 'P-ERNA', PER_LEHRG_KURZ: '', PER_LEHRG_LANG: 'Erste Hilfe', PER_ZEITRAUM_VD: '2022-03-01', PER_ZEITRAUM_BD: '', PER_BESTAETIG_DAT: '', PER_GUELTIG_BD: '', PER_LEHRG_OK: 1 },
    ],
    PER_HIST: [{ PER_ID: 'H1', PER_INDEX: 'P-EVA', PER_HIST_KATEGORIE_OW: 'Dienstgrad', PER_HIST_KURZ: '', PER_HIST_LANG: 'Brandmeisteranwärter', PER_ZEITRAUM_VD: '2024-01-01' }],
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
      { EIN_ID: 'EP2', EIN_INDEX: 'E1', EIN_PER_INDEX: 'P-WOLF', EIN_PER_NR: '0002', EIN_PER_NAME: 'Arbeit Wolf', EIN_PER_ZEIT_V: '2025-07-01 10:00:00.000', EIN_PER_ZEIT_B: '2025-07-01 11:00:00.000', EIN_PER_MERKMAL_BE: 0, EIN_PER_MERKMAL_AS: 0, EIN_PER_MERKMAL_VA: 0, EIN_PER_AUFGABE: 'Arbeitszeit Stadt Musterstadt', EIN_FZG_RUFNAME: '', EIN_FZG_BEZEICHNUNG: '' },
    ],
  });
  const FILE: [Buffer, string] = [archive, 'MPTRA_02_2026-10-25-074935_Abt._Musterstadt.zip'];

  it('lists the unknown names of the dry run', async () => {
    const run = await mp.upload([FILE]);
    await mp.select(run.id, { archives: { '02': { department: 'Abteilung Musterstadt' } } });
    // Persons first, so the other datasets find them.
    const off = Object.fromEntries(run.datasets.map((d) => [d.profile, { enabled: d.profile === 'masterdata.persons' }]));
    await mp.select(run.id, { datasets: off });
    await mp.dryRun(run.id);
    await mp.apply(run.id);

    const next = await mp.upload([FILE]);
    await mp.select(next.id, { datasets: allOn(next) });
    const checked = await mp.dryRun(next.id);
    expect(checked.unmatched).toEqual(
      expect.arrayContaining([
        { kind: 'qualification', value: 'Drohnenpilot', count: 1 },
        { kind: 'qualification', value: 'Erste Hilfe', count: 1 },
        { kind: 'rank', value: 'Brandmeisteranwärter', count: 1 },
        { kind: 'session-type', value: 'Jugendprobe', count: 1 },
        { kind: 'alarm-keyword', value: 'B 2 Wohnung', count: 1 },
        { kind: 'vehicle', value: 'MTW alt', count: 1 },
        { kind: 'function', value: 'Schlauchträger', count: 1 },
        { kind: 'function', value: 'Arbeitszeit Stadt Musterstadt', count: 1 },
      ]),
    );
  });

  it('applies chosen entries and extra targets and remembers them in the module list, not at the entries', async () => {
    await post('/core/imports/lookups/qualification', { key: 'drone-pilot', name: 'Drohnenpilot' }).expect(201);
    await post('/core/imports/lookups/alarm-keyword', { key: 'B2', name: 'B2 Wohnungsbrand' }).expect(201);
    const run = await mp.upload([FILE]);
    const mappings = {
      qualification: { Drohnenpilot: 'drone-pilot', 'Erste Hilfe': 'course:other-course' },
      rank: { Brandmeisteranwärter: 'bm' },
      'session-type': { Jugendprobe: 'lesson' },
      'alarm-keyword': { 'B 2 Wohnung': 'B2' },
      vehicle: { 'MTW alt': ids.lf },
      function: { Schlauchträger: 'hose-team', 'Arbeitszeit Stadt Musterstadt': 'incidents:during-working-hours' },
    };
    // A dry run remembers nothing.
    await mp.select(run.id, { datasets: allOn(run), mappings });
    const checked = await mp.dryRun(run.id);
    expect(checked.unmatched).toEqual([]);
    expect((await get('/mp-feuer/mappings').expect(200)).body).toEqual([]);

    const applied = await mp.apply(run.id);
    expect(applied.unmatched).toEqual([]);
    // "Drohnenpilot" is now the name of an entry and needs no mapping.
    expect((await mp.report(run.id)).remembered).toBe(7);
    const eva = (await get(`/masterdata/persons/${await personId('Neu')}`)).body;
    expect(eva.qualifications).toMatchObject([{ qualification: 'drone-pilot' }]);
    expect(eva.ranks).toMatchObject([{ rank: 'bm' }]);
    const erna = (await get(`/masterdata/persons/${await personId('Kurs')}`)).body;
    // Mapped to the collective course: an attendance named by the value, no qualification.
    expect(erna.qualifications).toEqual([]);
    expect((await get(`/masterdata/persons/${erna.id}/course-attendances`)).body).toEqual([expect.objectContaining({ course: 'other-course', startsOn: '2022-03-01', result: 'passed', description: 'Erste Hilfe' })]);
    const [incident] = (await get('/incidents/incidents?from=2025-07-01&to=2025-07-01')).body as { alarmKeyword: string; reports: { id: string }[] }[];
    expect(incident.alarmKeyword).toBe('B2');
    const report = (await get(`/incidents/reports/${incident.reports[0].id}`)).body;
    const wolf = await personId('Arbeit');
    expect(report.personnel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ personId: await personId('Neu'), vehicleId: ids.lf, function: 'hose-team' }),
        expect.objectContaining({ personId: wolf, function: null, duringWorkingHours: true }),
      ]),
    );

    const list = (await get('/mp-feuer/mappings').expect(200)).body as { kind: string; value: string; key: string; targetState: string; targetName: unknown; profile: string; createdBy: string }[];
    expect(list).toHaveLength(7);
    expect(list).toContainEqual(expect.objectContaining({ kind: 'function', value: 'Arbeitszeit Stadt Musterstadt', key: 'incidents:during-working-hours', targetState: 'active', profile: 'incidents.personnel', createdBy: 'Admin' }));
    expect(list).toContainEqual(expect.objectContaining({ kind: 'alarm-keyword', value: 'B 2 Wohnung', key: 'B2', targetName: { de: 'B2 Wohnungsbrand', en: 'B2 Wohnungsbrand' } }));
    // Nothing at the entries, nothing in the list of the table import.
    expect(await catalogEntry('rank', 'bm')).not.toHaveProperty('aliases');
    expect((await get('/core/imports/mappings').expect(200)).body).toEqual([]);
  });

  it('matches remembered names in the next run; deleted or inactive targets are not applied', async () => {
    const run = await mp.upload([FILE]);
    expect((await mp.dryRun(run.id)).unmatched).toEqual([]);

    // Deleting a mapping: the name is open again.
    const list = (await get('/mp-feuer/mappings?kind=function&q=schlauch').expect(200)).body as { id: string; value: string }[];
    expect(list.map((m) => m.value)).toEqual(['Schlauchträger']);
    await del(`/mp-feuer/mappings/${list[0].id}`).expect(204);
    expect((await audit('mp-feuer.mapping-deleted'))[0].details).toMatchObject({ kind: 'function', value: 'Schlauchträger', key: 'hose-team' });
    expect((await mp.dryRun(run.id)).unmatched).toEqual([{ kind: 'function', value: 'Schlauchträger', count: 1 }]);

    // An inactive target is shown as such and not applied.
    const bm = await catalogEntry('rank', 'bm');
    await put(`/masterdata/catalog/${bm['id']}`, { ...bm, active: false }).expect(200);
    const problems = (await get('/mp-feuer/mappings?problems=true').expect(200)).body as { value: string; targetState: string }[];
    expect(problems).toEqual([expect.objectContaining({ value: 'Brandmeisteranwärter', targetState: 'inactive' })]);
    expect((await mp.dryRun(run.id)).unmatched).toEqual(expect.arrayContaining([{ kind: 'rank', value: 'Brandmeisteranwärter', count: 1 }]));
    await put(`/masterdata/catalog/${bm['id']}`, { ...bm, active: true }).expect(200);
    expect((await get('/mp-feuer/mappings?q=Brandmeister').expect(200)).body).toEqual([expect.objectContaining({ targetState: 'active' })]);
    await del(`/mp-feuer/runs/${run.id}`).expect(204);
  });
});

const crewRow = (id: string, reportId: string, personIndex: string) => ({
  EIN_ID: id, EIN_INDEX: reportId, EIN_PER_INDEX: personIndex, EIN_PER_NR: '', EIN_PER_NAME: '', EIN_PER_ZEIT_V: '2025-08-01 10:00:00.000', EIN_PER_ZEIT_B: '2025-08-01 11:00:00.000',
  EIN_PER_MERKMAL_BE: 0, EIN_PER_MERKMAL_AS: 0, EIN_PER_MERKMAL_VA: 0, EIN_PER_AUFGABE: '', EIN_FZG_RUFNAME: '', EIN_FZG_BEZEICHNUNG: '',
});
const partsReport = (id: string, dispatchNumber: string) => ({
  EIN_ID: id, EIN_NR: id, EIN_LS_NR: dispatchNumber, EIN_ZEIT_V: '2025-08-01 10:00:00.000', EIN_ZEIT_B: '2025-08-01 11:00:00.000', EIN_ALARMSTICHWORT: 'B1', EIN_ART: '', EIN_KATEGORIE_OW: '',
  EIN_ERLAEUTERUNG: '', EIN_ORT: '', EIN_ORT_STRASSE: '', EIN_ORT_PLZ: '', EIN_ORT_ORT: '', EIN_ORT_ORTSTEIL: '', EIN_ORT_ZUSATZ: '', EIN_ORT_OBJEKT: '', EIN_MERKMAL_ST_GLOBAL: 1,
  EIN_MERKMAL_KO: 0, EIN_ZUSATZ_2: '', EIN_LAGE: '', EIN_VERLAUF: '', EIN_BERICHT: '', EIN_URSACHE: '', EIN_LEITUNG: '', EIN_STATISTIK: '', EIN_RETTUNG_P_S: '', EIN_VERLUSTE_S: '', EIN_RETTUNG_T_S: '',
});
/** A report of `partsReport` on another day. */
const datedReport = (id: string, dispatchNumber: string, begin: string) => ({ ...partsReport(id, dispatchNumber), EIN_ZEIT_V: `${begin} 10:00:00.000`, EIN_ZEIT_B: `${begin} 11:00:00.000` });
/** Rows of the incident personnel the last dry run or apply counted. */
const incidentRows = (run: MpFeuerRun) => Object.values(run.datasets.find((d) => d.profile === 'incidents.personnel')!.counts ?? {}).reduce((a, b) => a + b, 0);
const onlyIncidents = (run: MpFeuerRun) => Object.fromEntries(run.datasets.map((d) => [d.profile, { enabled: d.profile === 'incidents.personnel' }]));

describe('MP-Feuer: background run in parts', () => {
  // Four incidents with two persons each: three rows per incident.
  const archive = transferZip({
    PER_STAMM: [person('P-A', '0001', 'Ada', 'Teil'), person('P-B', '0002', 'Ben', 'Teil')],
    EIN_STAMM: ['1', '2', '3', '4'].map((n) => partsReport(`T${n}`, `12500099${n}`)),
    EIN_PERS: ['1', '2', '3', '4'].flatMap((n) => [crewRow(`TA${n}`, `T${n}`, 'P-A'), crewRow(`TB${n}`, `T${n}`, 'P-B')]),
  });
  const FILE: [Buffer, string] = [archive, 'MPTRA_05_2026-10-25-074935_Abt._Musterstadt.zip'];

  it('keeps the rows of an incident in one part and shows the progress', async () => {
    await post('/incidents/keywords/templates/bw', {}).expect(201);
    const persons = await mp.upload([FILE]);
    await mp.select(persons.id, { datasets: Object.fromEntries(persons.datasets.map((d) => [d.profile, { enabled: d.profile === 'masterdata.persons' }])) });
    await mp.dryRun(persons.id);
    await mp.apply(persons.id);

    mp.runs().partSize = 4;
    const seen: string[] = [];
    mp.runs().beforePart = async ({ part, parts }) => {
      // Polled like the UI does every 2 seconds.
      const current = (await get(`/mp-feuer/runs/${run.id}`).expect(200)).body as MpFeuerRun;
      seen.push(`${current.status} ${current.progress?.part}/${current.progress?.parts} ${part}/${parts}`);
    };
    const run = await mp.upload([FILE]);
    await mp.select(run.id, { datasets: onlyIncidents(run) });
    const checked = await mp.dryRun(run.id);
    expect(checked.datasets.find((d) => d.profile === 'incidents.personnel')).toMatchObject({ parts: 4, partsDone: 4, counts: { create: 12, error: 0 } });
    expect(seen).toEqual(['dry-running 1/4 1/4', 'dry-running 2/4 2/4', 'dry-running 3/4 3/4', 'dry-running 4/4 4/4']);
    mp.runs().beforePart = undefined;
    mp.runs().partSize = 2000;
    await del(`/mp-feuer/runs/${run.id}`).expect(204);
  });

  it('runs one run at a time, stops after the current part on request and lets a new run complete the rest', async () => {
    mp.runs().partSize = 3;
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => (release = resolve));
    const run = await mp.upload([FILE]);
    const other = await mp.upload([FILE]);
    await mp.select(run.id, { datasets: onlyIncidents(run) });
    await mp.dryRun(run.id);
    mp.runs().beforePart = async ({ part }) => {
      if (part === 2) await blocked;
    };
    await post(`/mp-feuer/runs/${run.id}/apply`, {}).expect(202);
    // Wait until the second part waits.
    for (let i = 0; i < 100 && (await mp.get(run.id)).progress?.part !== 2; i++) await new Promise((r) => setTimeout(r, 20));
    expect((await post(`/mp-feuer/runs/${other.id}/dry-run`, {}).expect(409)).body.code).toBe('mp-feuer.runActive');
    expect((await post(`/mp-feuer/runs/${run.id}/cancel`, {}).expect(202)).body).toMatchObject({ status: 'applying', cancelRequested: true });
    release();
    const cancelled = await mp.settle(run.id);
    expect(cancelled).toMatchObject({ status: 'cancelled', progress: { part: 2, parts: 4 } });
    expect(cancelled.datasets.find((d) => d.profile === 'incidents.personnel')).toMatchObject({ parts: 4, partsDone: 2, counts: { create: 6 } });
    expect((await audit('mp-feuer.run-cancelled'))[0].details).toMatchObject({ runId: run.id });
    expect((await get('/incidents/incidents?from=2025-08-01&to=2025-08-01')).body).toHaveLength(2);
    mp.runs().beforePart = undefined;

    // The finished parts stay; a new run with the same files completes the rest without duplicating.
    await mp.select(other.id, { datasets: onlyIncidents(other) });
    await mp.dryRun(other.id);
    const completed = await mp.apply(other.id);
    expect(countsOf(completed, 'incidents.personnel')).toMatchObject({ create: 6, update: 6, error: 0 });
    expect((await get('/incidents/incidents?from=2025-08-01&to=2025-08-01')).body).toHaveLength(4);
    mp.runs().partSize = 2000;
  });

  it('takes over only incidents from the chosen date on and remembers the date', async () => {
    const file: [Buffer, string] = [
      transferZip({
        PER_STAMM: [person('P-A', '0001', 'Ada', 'Teil'), person('P-B', '0002', 'Ben', 'Teil')],
        EIN_STAMM: [datedReport('D1', '1240000011', '2024-12-31'), datedReport('D2', '1250000012', '2025-01-01'), datedReport('D3', '1250000013', '2025-03-15')],
        EIN_PERS: ['1', '2', '3'].map((n) => crewRow(`DA${n}`, `D${n}`, 'P-A')),
      }),
      'MPTRA_05_2026-10-25-074935_Abt._Musterstadt.zip',
    ];
    const run = await mp.upload([file]);
    const incidents = run.datasets.find((d) => d.profile === 'incidents.personnel')!;
    expect(incidents).toMatchObject({ from: null, fromAvailable: true });
    expect(run.datasets.find((d) => d.profile === 'masterdata.persons')?.fromAvailable).toBe(false);
    expect((await put(`/mp-feuer/runs/${run.id}`, { datasets: { 'masterdata.persons': { enabled: false, from: '2025-01-01' } } }).expect(400)).body.code).toBe('mp-feuer.noDateFilter');

    await mp.select(run.id, { datasets: onlyIncidents(run) });
    const all = await mp.dryRun(run.id);
    const selected = await mp.select(run.id, { datasets: { 'incidents.personnel': { enabled: true, from: '2025-01-01' } } });
    expect(selected.dryRunOutdated).toBe(true);
    const checked = await mp.dryRun(run.id);
    expect(incidentRows(checked)).toBe((incidentRows(all) * 2) / 3);
    await mp.apply(run.id);
    expect((await get('/incidents/incidents?from=2024-12-31&to=2024-12-31')).body).toHaveLength(0);
    expect((await get('/incidents/incidents?from=2025-01-01&to=2025-03-15')).body).toHaveLength(2);
    expect((await get('/mp-feuer/remembered').expect(200)).body.datasets['incidents.personnel']).toMatchObject({ from: '2025-01-01' });
    expect((await mp.upload([file])).datasets.find((d) => d.profile === 'incidents.personnel')?.from).toBe('2025-01-01');
  });

  it('marks a run that worked when the server stopped as interrupted', async () => {
    const run = await mp.upload([FILE]);
    const em = test.app.get(EntityManager).fork();
    await em.getConnection().execute(`update mp_feuer.run set status = 'applying', lock = 'running' where id = ?`, [run.id]);
    expect(await mp.runs().recoverInterrupted()).toBe(1);
    expect(await mp.get(run.id)).toMatchObject({ status: 'failed', error: 'mp-feuer.interrupted' });
    expect((await get('/mp-feuer/runs').expect(200)).body[0]).toMatchObject({ id: run.id, status: 'failed', error: 'mp-feuer.interrupted' });
  });
});

describe('MP-Feuer: permissions and module state', () => {
  it('needs the permissions of the module and locks datasets without the permission of their profile', async () => {
    const reader = (await post('/core/roles', { name: 'MP-Feuer lesen', permissions: [], permissionsAllDepartments: ['mp-feuer.read'] }).expect(201)).body.id;
    await post('/core/users', { username: 'mpread', displayName: 'Leser', password: 'auch-sehr-geheim', roles: [{ roleId: reader, departmentId: null }] }).expect(201);
    const readerCookie = await test.login({ username: 'mpread', password: 'auch-sehr-geheim' });
    await get('/mp-feuer/runs', readerCookie).expect(200);
    await get('/mp-feuer/mappings', readerCookie).expect(200);
    expect((await test.http.post('/api/mp-feuer/runs').set('Cookie', readerCookie).set(UI).attach('files', veterans, FILES[1][1]).expect(403)).body.code).toBe('auth.forbidden');

    const transfer = (await post('/core/roles', { name: 'MP-Feuer Personen', permissions: [], permissionsAllDepartments: ['mp-feuer.transfer', 'mp-feuer.read', 'masterdata.persons.read', 'masterdata.persons.write'] }).expect(201)).body.id;
    await post('/core/users', { username: 'mptransfer', displayName: 'Übernehmer', password: 'auch-sehr-geheim', roles: [{ roleId: transfer, departmentId: null }] }).expect(201);
    const transferCookie = await test.login({ username: 'mptransfer', password: 'auch-sehr-geheim' });
    const run = (await test.http.post('/api/mp-feuer/runs').set('Cookie', transferCookie).set(UI).attach('files', musterstadt, FILES[0][1]).expect(201)).body as MpFeuerRun;
    expect(run.datasets.map((d) => [d.profile, d.locked])).toEqual([
      ['masterdata.persons', false],
      ['masterdata.career', false],
      ['respiratory-protection.examinations', true],
      ['respiratory-protection.stress-exercises', true],
      ['training.sessions', true],
      ['equipment.inventory', true],
      ['clothing.inventory', true],
      ['incidents.personnel', true],
    ]);
    expect(run.datasets.filter((d) => d.locked).every((d) => !d.enabled)).toBe(true);
    // A locked dataset cannot be switched on.
    const selected = (await test.http.put(`/api/mp-feuer/runs/${run.id}`).set('Cookie', transferCookie).set(UI).send({ datasets: { 'incidents.personnel': { enabled: true } } }).expect(200)).body as MpFeuerRun;
    expect(selected.datasets.find((d) => d.profile === 'incidents.personnel')?.enabled).toBe(false);
    await del(`/mp-feuer/runs/${run.id}`, transferCookie).expect(204);
  });

  it('locks the datasets of a module that is switched off and answers nothing while the module itself is off', async () => {
    await put('/core/modules/training', { active: false }).expect(200);
    const run = await mp.upload(FILES);
    expect(run.datasets.find((d) => d.profile === 'training.sessions')).toMatchObject({ locked: true, enabled: false });
    await put('/core/modules/training', { active: true }).expect(200);

    await put('/core/modules/mp-feuer', { active: false }).expect(200);
    expect((await get('/mp-feuer/runs').expect(404)).body).toMatchObject({ code: 'modules.inactive', module: 'mp-feuer' });
    await put('/core/modules/mp-feuer', { active: true }).expect(200);
    await get(`/mp-feuer/runs/${run.id}`).expect(200);
  });

  it('resets the remembered selection, the mappings stay', async () => {
    await del('/mp-feuer/remembered').expect(204);
    expect((await get('/mp-feuer/remembered').expect(200)).body).toEqual({ archives: {}, datasets: {} });
    expect(((await get('/mp-feuer/mappings').expect(200)).body as unknown[]).length).toBeGreaterThan(0);
    expect((await get('/mp-feuer/exports').expect(200)).body).toEqual([]);
  });
});

describe('MP-Feuer: only switched-on fields of the person file (L10, L28)', () => {
  it('does not take over values of switched-off fields', async () => {
    await put('/core/settings/masterdata.personFields', { disabled: ['gender', 'phonePrivate'] }).expect(200);
    const archive = transferZip({ PER_STAMM: [person('P-FELD', '0009', 'Frieda', 'Feldsparsam', { PER_GESCHLECHT_OW: 'W', PER_TEL_PRIV: '07111 123456', PER_MAIL_PRIV: 'frieda@example.org' })] });
    const run = await mp.upload([[archive, 'MPTRA_01_2026-10-29-080000_Abt._Musterstadt.zip']]);
    await mp.select(run.id, { archives: { '01': { department: 'Abteilung Musterstadt', unit: null, skip: false } } });
    await mp.dryRun(run.id);
    const applied = await mp.apply(run.id);
    expect(countsOf(applied, 'masterdata.persons')).toMatchObject({ create: 1, error: 0 });
    const stored: { gender: string; phone_private: string; email: string }[] = await test.app
      .get(EntityManager)
      .getConnection()
      .execute(`select gender, phone_private, email from masterdata.person where last_name = 'Feldsparsam'`);
    expect(stored).toEqual([{ gender: 'unspecified', phone_private: '', email: 'frieda@example.org' }]);
    await put('/core/settings/masterdata.personFields', { disabled: [] }).expect(200);
  });
});
