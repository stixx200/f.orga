import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainEvents } from '@forga/core-api';
import { INCIDENTS_EVENTS, type ReportReleasedEvent, type ReportUnlockedEvent } from '@forga/incidents-contracts';
import { mpFeuerClient, transferZip } from './testing/mp-feuer';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

/**
 * Parallel operation with MP-Feuer: incidents are written and released in MP-Feuer and come again with every data
 * transfer of the module MP-Feuer; f.orga issues notices and pays compensation from them.
 */
let test: TestApp;
let admin: string;
const ids: Record<string, string> = {};
const released: ReportReleasedEvent[] = [];
const unlocked: ReportUnlockedEvent[] = [];

const post = (path: string, body: unknown) => test.http.post(`/api${path}`).set('Cookie', admin).set(UI).send(body as object);
const get = (path: string) => test.http.get(`/api${path}`).set('Cookie', admin);
const put = (path: string, body: unknown) => test.http.put(`/api${path}`).set('Cookie', admin).set(UI).send(body as object);

const person = (id: string, firstName: string, lastName: string) => ({
  PER_ID: id, PER_NR: '', PER_ANREDE: '', PER_VORNAME: firstName, PER_NACHNAME: lastName, PER_STRASSE: '', PER_PLZ: '', PER_ORT: '', PER_TEL_PRIV: '', PER_TEL_GES: '',
  PER_MOB_PRIV: '', PER_MOB_GES: '', PER_MAIL_PRIV: '', PER_MAIL_GES: '', PER_GEB_DAT: '1990-01-02', PER_GESCHLECHT_OW: 'M', PER_AKTIV_VD: '2010-03-01', PER_AKTIV_BD: '',
  PER_AKTIV_GRUND: '', PER_ARCHIV_DAT: '',
});

const incident = (id: string, nr: string, dispatchNumber: string, begin: string, end: string, status: string, extra: Record<string, string | number> = {}) => ({
  EIN_ID: id, EIN_NR: nr, EIN_LS_NR: dispatchNumber, EIN_ZEIT_V: begin, EIN_ZEIT_B: end, EIN_ALARMSTICHWORT: 'B1-PAR', EIN_ART: 'Kleinbrand', EIN_KATEGORIE_OW: 'Brand',
  EIN_ERLAEUTERUNG: '', EIN_ORT: '', EIN_ORT_STRASSE: 'Bahnhofstr. 3', EIN_ORT_PLZ: '12345', EIN_ORT_ORT: 'Musterstadt', EIN_ORT_ORTSTEIL: '', EIN_ORT_ZUSATZ: '', EIN_ORT_OBJEKT: '',
  EIN_MERKMAL_ST_GLOBAL: 1, EIN_MERKMAL_KO: 0, EIN_ZUSATZ_2: status, EIN_LAGE: 'Brand', EIN_VERLAUF: 'Abgelöscht', EIN_BERICHT: '', EIN_URSACHE: '', EIN_LEITUNG: '',
  EIN_STATISTIK: '', EIN_RETTUNG_P_S: '', EIN_VERLUSTE_S: '', EIN_RETTUNG_T_S: '', ...extra,
});

const crew = (id: string, report: string, personId: string, name: string, begin: string, end: string, vehicle = 'LF 20/16') => ({
  EIN_ID: id, EIN_INDEX: report, EIN_PER_INDEX: personId, EIN_PER_NR: '', EIN_PER_NAME: name, EIN_PER_ZEIT_V: begin, EIN_PER_ZEIT_B: end, EIN_PER_MERKMAL_BE: 0,
  EIN_PER_MERKMAL_AS: 0, EIN_PER_MERKMAL_VA: 0, EIN_PER_AUFGABE: '', EIN_FZG_RUFNAME: '', EIN_FZG_BEZEICHNUNG: vehicle,
});

const FIRE = ['2026-06-01 10:00:00.000', '2026-06-01 11:00:00.000'] as const;
const STORM = ['2026-06-02 20:00:00.000', '2026-06-02 21:00:00.000'] as const;
const OLD = ['2025-06-03 08:00:00.000', '2025-06-03 09:00:00.000'] as const;
const BILLING = 'zur Abrechnung freigegeben';
const PERSONS = [person('P-ANNA', 'Anna', 'Probe'), person('P-BERT', 'Bert', 'Muster')];

/** First state in MP-Feuer: a released fire (chargeable), a storm draft and a released incident of last year. */
const first = transferZip({
  PER_STAMM: PERSONS,
  EIN_STAMM: [
    incident('E1', '2026-001', '1260000001', ...FIRE, BILLING, { EIN_MERKMAL_KO: 1 }),
    incident('E2', '2026-002', '1260000002', ...STORM, ''),
    incident('E3', '2025-050', '1250000050', ...OLD, BILLING),
  ],
  EIN_PERS: [crew('C1', 'E1', 'P-ANNA', 'Probe Anna', ...FIRE), crew('C2', 'E2', 'P-ANNA', 'Probe Anna', ...STORM), crew('C3', 'E3', 'P-ANNA', 'Probe Anna', ...OLD)],
});

/** Corrected in MP-Feuer: Bert joins the fire at a new address, the storm is released. */
const second = transferZip({
  PER_STAMM: PERSONS,
  EIN_STAMM: [
    incident('E1', '2026-001', '1260000001', ...FIRE, BILLING, { EIN_MERKMAL_KO: 1, EIN_ORT_STRASSE: 'Lindenweg 7', EIN_ALARMSTICHWORT: 'B2-PAR' }),
    incident('E2', '2026-002', '1260000002', ...STORM, BILLING),
    incident('E3', '2025-050', '1250000050', ...OLD, BILLING),
  ],
  EIN_PERS: [
    crew('C1', 'E1', 'P-ANNA', 'Probe Anna', ...FIRE),
    crew('C4', 'E1', 'P-BERT', 'Muster Bert', ...FIRE),
    crew('C2', 'E2', 'P-ANNA', 'Probe Anna', ...STORM),
    crew('C3', 'E3', 'P-ANNA', 'Probe Anna', ...OLD),
  ],
});

/** The fire is taken back for correction in MP-Feuer (no vehicle any more); the storm gets another person. */
const third = transferZip({
  PER_STAMM: PERSONS,
  EIN_STAMM: [
    incident('E1', '2026-001', '1260000001', ...FIRE, 'noch nicht abrechnen', { EIN_MERKMAL_KO: 1, EIN_ORT_STRASSE: 'Lindenweg 7', EIN_ALARMSTICHWORT: 'B2-PAR' }),
    incident('E2', '2026-002', '1260000002', ...STORM, BILLING),
    incident('E3', '2025-050', '1250000050', ...OLD, BILLING),
  ],
  EIN_PERS: [
    crew('C1', 'E1', 'P-ANNA', 'Probe Anna', ...FIRE, ''),
    crew('C2', 'E2', 'P-ANNA', 'Probe Anna', ...STORM),
    crew('C5', 'E2', 'P-BERT', 'Muster Bert', ...STORM),
    crew('C3', 'E3', 'P-ANNA', 'Probe Anna', ...OLD),
  ],
});

/** The fire again with its vehicle, still not released in MP-Feuer. */
const fourth = transferZip({
  PER_STAMM: PERSONS,
  EIN_STAMM: [incident('E1', '2026-001', '1260000001', ...FIRE, 'noch nicht abrechnen', { EIN_MERKMAL_KO: 1, EIN_ORT_STRASSE: 'Lindenweg 7', EIN_ALARMSTICHWORT: 'B2-PAR' })],
  EIN_PERS: [crew('C1', 'E1', 'P-ANNA', 'Probe Anna', ...FIRE)],
});

const FILE = 'MPTRA_01_2026-10-25-074935_Abt._Musterstadt.zip';

let mp: ReturnType<typeof mpFeuerClient>;

/** The routine transfer: upload, the remembered selection with only the incident personnel, dry run, apply. */
async function importIncidents(archive: Buffer) {
  const run = await mp.upload([[archive, FILE]]);
  await mp.select(run.id, { datasets: Object.fromEntries(run.datasets.map((d) => [d.profile, { enabled: d.profile === 'incidents.personnel' }])) });
  await mp.dryRun(run.id);
  const applied = await mp.apply(run.id);
  expect(applied.status).toBe('applied');
  return { counts: applied.datasets.find((d) => d.profile === 'incidents.personnel')!.counts!, report: await mp.report(run.id) };
}

type IncidentSummary = { id: string; dispatchNumber: string; alarmKeyword: string; location: { street: string }; reports: { id: string; status: string; managedBy: string | null }[] };
const incidentOf = async (dispatchNumber: string) =>
  ((await get('/incidents/incidents?from=2025-01-01&to=2026-12-31').expect(200)).body as IncidentSummary[]).find((i) => i.dispatchNumber === dispatchNumber)!;
const reportOf = async (dispatchNumber: string) => (await get(`/incidents/reports/${(await incidentOf(dispatchNumber)).reports[0].id}`).expect(200)).body;
const itemsOf = async (reportId: string) => ((await get('/compensation/items?open=true').expect(200)).body as { personId: string; source: string; sourceId: string; kind: string }[]).filter((i) => i.source === 'incident' && i.sourceId === reportId && i.kind === 'compensation');

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  mp = mpFeuerClient(test, () => admin);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.lf = (await post('/masterdata/vehicles', { designation: 'LF 20/16', vehicleType: 'lf-20-16', departmentId: ids.musterstadt }).expect(201)).body.id;
  const bus = test.app.get(DomainEvents);
  bus.subscribe<ReportReleasedEvent>(INCIDENTS_EVENTS.reportReleased, (e) => void released.push(e));
  bus.subscribe<ReportUnlockedEvent>(INCIDENTS_EVENTS.reportUnlocked, (e) => void unlocked.push(e));
});

afterAll(() => test?.app.close());

describe('Parallel operation with MP-Feuer', () => {
  it('remembers the choices of a transfer for the next one', async () => {
    const run = await mp.upload([[first, FILE]]);
    expect(run.archives).toMatchObject([{ key: '01', department: 'Abteilung Musterstadt', remembered: false }]);
    await mp.select(run.id, { datasets: Object.fromEntries(run.datasets.map((d) => [d.profile, { enabled: d.profile === 'masterdata.persons' }])) });
    await mp.dryRun(run.id);
    expect((await mp.apply(run.id)).datasets.find((d) => d.profile === 'masterdata.persons')?.counts).toMatchObject({ create: 2 });
    const next = await mp.upload([[first, FILE]]);
    expect(next.archives).toMatchObject([{ key: '01', department: 'Abteilung Musterstadt', remembered: true }]);
    expect(next.datasets.find((d) => d.profile === 'incidents.personnel')?.enabled).toBe(false);
    await test.http.delete(`/api/mp-feuer/runs/${next.id}`).set('Cookie', admin).set(UI).expect(204);
  });

  it('announces releases of MP-Feuer from the configured day on and keeps its reports read-only', async () => {
    await put('/core/settings/incidents.general', { externalLeading: 'mp-feuer', externalEventsFrom: '2026-01-01' }).expect(200);
    const result = await importIncidents(first);
    expect(result.counts).toMatchObject({ error: 0 });

    const fire = await reportOf('1260000001');
    expect(fire).toMatchObject({ status: 'released-billing', locked: true, lockedBy: 'MP-Feuer', managedBy: 'mp-feuer' });
    // Released in MP-Feuer: compensation items as after a release in f.orga, but none for last year's incident.
    expect(released.map((e) => e.reportId)).toEqual([fire.id]);
    expect(await itemsOf(fire.id)).toHaveLength(1);
    const old = await reportOf('1250000050');
    expect(await itemsOf(old.id)).toHaveLength(0);

    // Notices start from it: chargeable and released for billing.
    const candidates = (await get('/cost-recovery/candidates?from=2026-01-01&to=2026-12-31').expect(200)).body as { incidentId: string; released: boolean }[];
    expect(candidates).toEqual([expect.objectContaining({ incidentId: fire.incidentId, released: true })]);

    // Changes belong to MP-Feuer: neither content, workflow nor incident data change in f.orga.
    const storm = await reportOf('1260000002');
    expect(storm).toMatchObject({ status: 'draft', managedBy: 'mp-feuer' });
    expect((await put(`/incidents/reports/${storm.id}`, { ...storm, version: storm.version }).expect(409)).body.code).toBe('incidents.ledByMpFeuer');
    expect((await post(`/incidents/reports/${storm.id}/submit`, { acknowledgements: [] }).expect(409)).body.code).toBe('incidents.ledByMpFeuer');
    expect((await post(`/incidents/reports/${storm.id}/author`, { authorPersonId: null }).expect(409)).body.code).toBe('incidents.ledByMpFeuer');
    expect((await post(`/incidents/reports/${fire.id}/unlock`, { reason: 'Korrektur', toStatus: 'draft' }).expect(409)).body.code).toBe('incidents.ledByMpFeuer');
    const stormIncident = (await get(`/incidents/incidents/${storm.incidentId}`).expect(200)).body;
    const update = { version: stormIncident.version, dispatchNumber: stormIncident.dispatchNumber, alarmKeyword: stormIncident.alarmKeyword, alarmMessage: 'neu', alarmedAt: stormIncident.alarmedAt, location: stormIncident.location };
    expect((await put(`/incidents/incidents/${storm.incidentId}`, update).expect(409)).body.code).toBe('incidents.ledByMpFeuer');
    expect((await put(`/incidents/incidents/${storm.incidentId}/statistics`, { statistics: null, version: stormIncident.version }).expect(409)).body.code).toBe('incidents.ledByMpFeuer');
    expect(stormIncident.statisticsEditable).toBe(false);
    // Costs stay with f.orga.
    await put(`/incidents/incidents/${storm.incidentId}/costs`, { version: stormIncident.version, chargeable: false, notes: 'Notiz aus f.orga' }).expect(200);

    // Drafts of MP-Feuer are no work items in f.orga.
    const tasks = (await get('/core/tasks?asOf=2026-10-25&all=true').expect(200)).body as { subject: { id: string } }[];
    expect(tasks.some((t) => t.subject.id === storm.id)).toBe(false);
  });

  it('takes corrections of MP-Feuer over and announces only what changed', async () => {
    released.length = 0;
    await importIncidents(second);
    const fire = await reportOf('1260000001');
    const storm = await reportOf('1260000002');
    expect(fire.personnel).toHaveLength(2);
    // The incident data follow MP-Feuer while it leads; the notes of f.orga stay.
    const fireIncident = await incidentOf('1260000001');
    expect(fireIncident).toMatchObject({ alarmKeyword: 'B2-PAR', location: expect.objectContaining({ street: 'Lindenweg 7' }) });
    expect((await get(`/incidents/incidents/${storm.incidentId}`).expect(200)).body).toMatchObject({ notes: 'Notiz aus f.orga' });
    expect(released.map((e) => e.reportId).toSorted()).toEqual([fire.id, storm.id].toSorted());
    expect(await itemsOf(fire.id)).toHaveLength(2);
    expect(await itemsOf(storm.id)).toHaveLength(1);

    // The same data again: nothing to announce, no items twice.
    released.length = 0;
    await importIncidents(second);
    expect(released).toEqual([]);
    expect(await itemsOf(fire.id)).toHaveLength(2);
  });

  it('leaves reports alone that a releaser continues in f.orga, and withdraws releases taken back in MP-Feuer', async () => {
    const storm = await reportOf('1260000002');
    const takenOver = (await post(`/incidents/reports/${storm.id}/take-over`, {}).expect(200)).body;
    expect(takenOver.managedBy).toBeNull();
    await post(`/incidents/reports/${storm.id}/take-over`, {}).expect(409);

    released.length = 0;
    const result = await importIncidents(third);
    // The report row and both crew rows of the storm.
    expect(result.report.messages.find((m: { code: string }) => m.code === 'incidents.import.reportEdited')).toMatchObject({ count: 3 });
    expect((await reportOf('1260000002')).personnel).toHaveLength(1);

    const fire = await reportOf('1260000001');
    expect(fire).toMatchObject({ status: 'draft', locked: false, managedBy: 'mp-feuer' });
    // The vehicle removed in MP-Feuer is gone as well.
    expect(fire.vehicles).toEqual([]);
    expect(unlocked.map((e) => e.reportId)).toContain(fire.id);
    expect(await itemsOf(fire.id)).toHaveLength(0);

    // The report continued in f.orga follows the usual workflow.
    await post(`/incidents/reports/${storm.id}/unlock`, { reason: 'Korrektur', toStatus: 'draft' }).expect(200);
  });

  it('keeps a release made in f.orga when f.orga leads', async () => {
    await put('/core/settings/incidents.general', { externalLeading: null, externalEventsFrom: null }).expect(200);
    await importIncidents(fourth);
    const fire = await reportOf('1260000001');
    expect(fire).toMatchObject({ status: 'draft', managedBy: 'mp-feuer' });
    // Not led by MP-Feuer any more: the report can be submitted and released here.
    const acknowledgements = (fire.findings as { level: string; rule: string; subject: string | null }[])
      .filter((f) => f.level === 'warning')
      .map((f) => ({ rule: f.rule, subject: f.subject, reason: 'Test' }));
    await post(`/incidents/reports/${fire.id}/submit`, { acknowledgements }).expect(200);
    await post(`/incidents/reports/${fire.id}/release`, { level: 'billing' }).expect(200);
    expect((await reportOf('1260000001')).managedBy).toBeNull();

    // MP-Feuer still says "not yet": the release of f.orga stays.
    await importIncidents(fourth);
    expect(await reportOf('1260000001')).toMatchObject({ status: 'released-billing', managedBy: null });
  });
});
