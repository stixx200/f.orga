import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

/** The mapping list of the table import (`core.import_mapping`): remembered after an apply, applied by the next import. */
let test: TestApp;
let admin: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown) => test.http.post(`/api${path}`).set('Cookie', admin).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const put = (path: string, body: unknown) => test.http.put(`/api${path}`).set('Cookie', admin).set(UI).send(body as object);

/** Uploads a CSV and runs the profile with the suggested columns. */
async function importCsv(profile: string, lines: string[], apply: boolean, mappings: Record<string, Record<string, string>> = {}) {
  const upload = await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(lines.join('\r\n')), 'tabelle.csv').expect(201);
  return (await post(`/core/imports/${upload.body.id}/${apply ? 'apply' : 'preview'}`, { profile, mapping: upload.body.suggestions[profile], mappings }).expect(200)).body as {
    counts: Record<string, number>;
    unmatched: { kind: string; value: string; count: number }[];
  };
}

type Mapping = { id: string; kind: string; value: string; key: string; targetState: string; targetName: { de: string } | null; profile: string; profileName: { de: string } | null; createdBy: string };
const mappings = async (query = '') => (await get(`/core/imports/mappings${query}`).expect(200)).body as Mapping[];

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  await importCsv('masterdata.persons', ['Vorname;Nachname;Abteilung;Eintritt', 'Anna;Probe;Abteilung Musterstadt;01.01.2010'], true);
});

afterAll(() => test?.app.close());

const career = (name: string, date: string) => ['Name;Art;Bezeichnung;Datum', `Probe Anna;Lehrgang;${name};${date}`];

const personnel = (incident: string) => [
  'Leitstellennummer;Einsatznummer;Beginn;Alarmstichwort;Abteilung;Name;Funktion',
  `${incident};${incident};01.05.2025 10:00;B1;Abteilung Musterstadt;Probe Anna;Verdienstausfall Firma`,
];

describe('Remembered mappings of the table import', () => {

  it('remembers a chosen entry after the apply, not after the dry run', async () => {
    const preview = await importCsv('masterdata.career', career('TF Kurs', '01.02.2020'), false);
    expect(preview.unmatched).toEqual([{ kind: 'qualification', value: 'TF Kurs', count: 1 }]);
    await importCsv('masterdata.career', career('TF Kurs', '01.02.2020'), false, { qualification: { 'TF Kurs': 'squad-leader' } });
    expect(await mappings()).toEqual([]);

    const applied = await importCsv('masterdata.career', career('TF Kurs', '01.02.2020'), true, { qualification: { 'TF Kurs': 'squad-leader' } });
    expect(applied).toMatchObject({ counts: { create: 1 }, unmatched: [] });
    expect(await mappings()).toEqual([
      expect.objectContaining({ kind: 'qualification', value: 'TF Kurs', key: 'squad-leader', targetState: 'active', profile: 'masterdata.career', profileName: expect.objectContaining({ de: expect.any(String) }), createdBy: 'Admin' }),
    ]);
    // The entry itself keeps its names.
    const entry = ((await get('/masterdata/catalog?kind=qualification')).body as Record<string, unknown>[]).find((e) => e['key'] === 'squad-leader')!;
    expect(entry).not.toHaveProperty('aliases');
  });

  it('applies the mapping in the next import, compared like headings', async () => {
    const next = await importCsv('masterdata.career', career('tf-kurs', '01.03.2021'), true);
    expect(next).toMatchObject({ counts: { create: 1, error: 0 }, unmatched: [] });
  });

  it('marks an inactive target and does not apply it', async () => {
    const entry = ((await get('/masterdata/catalog?kind=qualification')).body as Record<string, unknown>[]).find((e) => e['key'] === 'squad-leader')!;
    await put(`/masterdata/catalog/${entry['id']}`, { ...entry, active: false }).expect(200);
    expect(await mappings('?problems=true')).toEqual([expect.objectContaining({ value: 'TF Kurs', targetState: 'inactive' })]);
    expect((await importCsv('masterdata.career', career('TF Kurs', '01.04.2022'), false)).unmatched).toEqual([{ kind: 'qualification', value: 'TF Kurs', count: 1 }]);
    await put(`/masterdata/catalog/${entry['id']}`, { ...entry, active: true }).expect(200);
    expect(await mappings('?problems=true')).toEqual([]);
    expect(await mappings('?kind=qualification&q=tf')).toHaveLength(1);
    expect(await mappings('?kind=function')).toEqual([]);
  });

  it('forgets a deleted mapping', async () => {
    const [mapping] = await mappings();
    await test.http.delete(`/api/core/imports/mappings/${mapping.id}`).set('Cookie', admin).set(UI).expect(204);
    await test.http.delete(`/api/core/imports/mappings/${mapping.id}`).set('Cookie', admin).set(UI).expect(404);
    const entries = (await get('/core/audit?action=imports.mapping-deleted').expect(200)).body as { details: object }[];
    expect(entries[0].details).toEqual({ kind: 'qualification', value: 'TF Kurs', key: 'squad-leader' });
    expect((await importCsv('masterdata.career', career('TF Kurs', '01.04.2022'), false)).unmatched).toEqual([{ kind: 'qualification', value: 'TF Kurs', count: 1 }]);
  });

  it('remembers extra targets like entries, e.g. function texts that are no function', async () => {
    const applied = await importCsv('incidents.personnel', personnel('2025-901'), true, { function: { 'Verdienstausfall Firma': 'incidents:loss-of-earnings' } });
    expect(applied.unmatched).toEqual([{ kind: 'alarm-keyword', value: 'B1', count: 1 }]);
    expect(await mappings('?kind=function')).toEqual([
      expect.objectContaining({ value: 'Verdienstausfall Firma', key: 'incidents:loss-of-earnings', targetState: 'active', targetName: expect.objectContaining({ de: 'Keine Funktion – Verdienstausfall' }), profile: 'incidents.personnel' }),
    ]);

    // The next import sets the flag without asking.
    const next = await importCsv('incidents.personnel', personnel('2025-902'), true);
    expect(next.unmatched).toEqual([]);
    const incidents = (await get('/incidents/incidents?from=2025-05-01&to=2025-05-01').expect(200)).body as { dispatchNumber: string; reports: { id: string }[] }[];
    const report = (await get(`/incidents/reports/${incidents.find((i) => i.dispatchNumber === '2025-902')!.reports[0].id}`).expect(200)).body;
    expect(report.personnel).toMatchObject([{ function: null, lossOfEarnings: true }]);
    // Imported by the table import: replaceable, not managed by MP-Feuer.
    expect(report.managedBy).toBe('import');

    // The module MP-Feuer has a list of its own.
    expect((await get('/mp-feuer/mappings').expect(200)).body).toEqual([]);
    // The settings section of the former rules is gone.
    await get('/core/settings/incidents.importFunctionRules').expect(404);
  });

  it('is only for users of an import profile', async () => {
    const role = (await post('/core/roles', { name: 'Ohne Import', permissions: [], permissionsAllDepartments: ['masterdata.persons.read'] }).expect(201)).body.id;
    await post('/core/users', { username: 'noimport', displayName: 'Ohne', password: 'auch-sehr-geheim', roles: [{ roleId: role, departmentId: null }] }).expect(201);
    const cookie = await test.login({ username: 'noimport', password: 'auch-sehr-geheim' });
    expect((await get('/core/imports/mappings', cookie).expect(404)).body.code).toBe('imports.unknownProfile');
  });
});
