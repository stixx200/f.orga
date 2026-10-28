import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_STATUTE } from '@forga/compensation-contracts';
import { DomainEvents } from '@forga/core-api';
import { INCIDENTS_EVENTS, INCIDENTS_LOOKUP, type IncidentsLookup, type ReportReleasedEvent } from '@forga/incidents-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

/** Times of persons and vehicles: own times, else those of the vehicle, else those of the report. */
let test: TestApp;
let admin: string;
const ids: Record<string, string> = {};
const T = (time: string) => new Date(`2026-10-23T${time}:00+02:00`).toISOString();

const post = (path: string, body: unknown) => test.http.post(`/api${path}`).set('Cookie', admin).set(UI).send(body as object);
const put = (path: string, body: unknown) => test.http.put(`/api${path}`).set('Cookie', admin).set(UI).send(body as object);
const get = (path: string) => test.http.get(`/api${path}`).set('Cookie', admin);
/** Saves a report with the stored version, as the editor does, and returns the saved report. */
const save = async (reportId: string, body: object) => {
  const current = await get(`/incidents/reports/${reportId}`).expect(200);
  return (await put(`/incidents/reports/${reportId}`, { version: current.body.version, ...body }).expect(200)).body;
};

type Entry = { personId: string; from: string; to: string; compensation: { hours: number } };
const byPerson = (personnel: Entry[]) => Object.fromEntries(personnel.map((p) => [p.personId, p]));
const rules = (report: { findings: { rule: string; level: string; subject: string | null }[] }) => report.findings.map((f) => `${f.level}:${f.rule}:${f.subject}`);

/** Report 13:00–16:00; the TSF was alerted later (14:00–15:30); Lena left early, Paul stayed on standby. */
const content = (vehicles: object[], extra: object = {}) => ({
  times: { alarmedAt: T('13:00'), returnedAt: T('16:00') },
  situation: 'Rauch aus Dachstuhl',
  actions: 'Innenangriff',
  statistics: { mainType: 'fire', fireSize: 'small-b' },
  personnel: [
    { personId: ids.jonas, vehicleId: ids.lf },
    { personId: ids.max, vehicleId: ids.tsf },
    { personId: ids.lena, vehicleId: ids.tsf, to: T('15:00') },
    { personId: ids.paul, standbyStationId: ids.station },
  ],
  vehicles,
  ...extra,
});
const later = { vehicleId: '', departedAt: T('14:00'), returnedAt: T('15:30'), kilometres: 12 };

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/incidents/keywords/templates/bw', {}).expect(201);
  await put('/core/settings/incidents.general', { homeMunicipalities: ['Musterstadt'] }).expect(200);
  await put('/core/settings/duty-officer.general', { reportRequired: false }).expect(200);
  await put('/core/settings/compensation.general', SAMPLE_STATUTE).expect(200);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.lf = (await post('/masterdata/vehicles', { designation: 'LF 20/16', vehicleType: 'lf-20-16', departmentId: ids.musterstadt }).expect(201)).body.id;
  ids.tsf = (await post('/masterdata/vehicles', { designation: 'TSF', vehicleType: 'tsf', departmentId: ids.musterstadt }).expect(201)).body.id;
  ids.station = (await post('/masterdata/stations', { name: 'Feuerwehrhaus Musterstadt', departmentId: ids.musterstadt }).expect(201)).body.id;
  for (const name of ['jonas', 'max', 'lena', 'paul']) {
    ids[name] = (
      await post('/masterdata/persons', { firstName: name, lastName: 'Test', status: 'active', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)
    ).body.id;
  }
  const incident = await post('/incidents/incidents', { dispatchNumber: '2026-200001', alarmKeyword: 'B2', alarmedAt: T('13:00'), location: { city: 'Musterstadt' }, departmentIds: [ids.musterstadt] }).expect(201);
  ids.incident = incident.body.id;
  ids.report = incident.body.reports[0].id;
  later.vehicleId = ids.tsf;
});

afterAll(() => test?.app.close());

describe('times of personnel and vehicles', () => {
  it('saves the own times of a vehicle; its crew follows them unless a person has own times', async () => {
    const saved = await save(ids.report, content([later]));
    expect(saved.vehicles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ vehicleId: ids.tsf, departedAt: T('14:00'), returnedAt: T('15:30'), kilometres: 12 }),
        // The LF comes with its crew, without own times.
        expect.objectContaining({ vehicleId: ids.lf, departedAt: null, returnedAt: null, kilometres: null }),
      ]),
    );
    const personnel = byPerson(saved.personnel);
    expect(personnel[ids.jonas]).toMatchObject({ from: T('13:00'), to: T('16:00'), compensation: { hours: 3 } });
    // Started hours: 1.5 h count as 2.
    expect(personnel[ids.max]).toMatchObject({ from: T('14:00'), to: T('15:30'), compensation: { hours: 2 } });
    expect(personnel[ids.lena]).toMatchObject({ from: T('14:00'), to: T('15:00'), compensation: { hours: 1 } });
    // Standby follows the report, not a vehicle.
    expect(personnel[ids.paul]).toMatchObject({ from: T('13:00'), to: T('16:00') });
    expect(rules(saved)).toEqual([]);
  });

  it('warns about vehicle times outside the report and person times outside the vehicle; refuses vehicles returning before departing', async () => {
    const outside = await save(ids.report, content([{ ...later, departedAt: T('12:30') }]));
    expect(rules(outside)).toEqual([`warning:vehicle-times-outside:${ids.tsf}`]);
    expect(outside.findings[0].params).toEqual({ vehicle: 'TSF' });

    const early = content([later]);
    early.personnel[2] = { personId: ids.lena, vehicleId: ids.tsf, from: T('13:30') } as (typeof early.personnel)[number];
    const person = await save(ids.report, early);
    expect(rules(person)).toEqual([`warning:personnel-times-outside:${ids.lena}`]);
    expect(person.findings[0].params).toEqual({ person: 'Test, lena', vehicle: 'TSF' });

    const invalid = await save(ids.report, content([{ ...later, departedAt: T('15:45') }]));
    expect(rules(invalid)).toContain(`error:vehicle-times-invalid:${ids.tsf}`);
  });

  it('gives the effective times to compensation, cost recovery and the receivers of the release', async () => {
    await save(ids.report, content([later]));
    const lookup = test.app.get<IncidentsLookup>(INCIDENTS_LOOKUP);
    const preview = await lookup.compensationPreview(ids.incident, { rates: SAMPLE_STATUTE.incidentRates, rounding: 'started-hour', minimumHours: null });
    const previewed = Object.fromEntries(preview!.reports[0].personnel.map((p) => [p.personId, p]));
    expect(previewed[ids.max]).toMatchObject({ from: T('14:00'), to: T('15:30'), hours: 2 });
    expect(previewed[ids.paul]).toMatchObject({ from: T('13:00'), to: T('16:00'), standby: true });

    const costs = await lookup.forCostRecovery(ids.incident);
    const crew = Object.fromEntries(costs!.reports[0].personnel.map((p) => [p.personId, p]));
    expect(crew[ids.lena]).toMatchObject({ from: T('14:00'), to: T('15:00') });
    expect(costs!.reports[0].vehicles).toEqual(expect.arrayContaining([{ vehicleId: ids.tsf, departedAt: T('14:00'), returnedAt: T('15:30') }]));

    // Compensation and respiratory protection take the times from the release.
    const events: ReportReleasedEvent[] = [];
    test.app.get(DomainEvents).subscribe<ReportReleasedEvent>(INCIDENTS_EVENTS.reportReleased, (e) => {
      events.push(e);
    });
    await post(`/incidents/reports/${ids.report}/submit`, {}).expect(200);
    await post(`/incidents/reports/${ids.report}/release`, { level: 'compensation' }).expect(200);
    const released = Object.fromEntries(events[0].personnel.map((p) => [p.personId, p]));
    expect(released[ids.max]).toMatchObject({ from: T('14:00'), to: T('15:30'), hours: 2 });
    expect(released[ids.jonas]).toMatchObject({ from: T('13:00'), to: T('16:00'), hours: 3 });
  });

  it('lists the effective times in the person file', async () => {
    const assignments = (await get(`/incidents/persons/${ids.max}/assignments?year=2026`).expect(200)).body;
    expect(assignments).toEqual([expect.objectContaining({ from: T('14:00'), to: T('15:30'), hours: 2 })]);
  });
});
