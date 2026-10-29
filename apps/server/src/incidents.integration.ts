import { EntityManager } from '@mikro-orm/core';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_STATUTE } from '@forga/compensation-contracts';
import { DomainEvents, MailService } from '@forga/core-api';
import { INCIDENTS_EVENTS, INCIDENTS_LOOKUP, type IncidentsLookup, type ReportReleasedEvent, type ReportUnlockedEvent } from '@forga/incidents-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let writer: string;
let ahornfeldWriter: string;
const ids: Record<string, string> = {};
const T = (time: string) => `2026-10-21T${time}:00+02:00`;

const post = (path: string, body: unknown, cookie = admin) =>
  test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) =>
  test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const del = (path: string, cookie = admin) => test.http.delete(`/api${path}`).set('Cookie', cookie).set(UI);
/** Saves a report with the version currently stored, as the editor does with the version it loaded. */
const save = (reportId: string, body: object, cookie = admin) => ({
  expect: async (status: number) => {
    const current = await get(`/incidents/reports/${reportId}`, cookie);
    return put(`/incidents/reports/${reportId}`, { version: current.body?.version ?? 0, ...body }, cookie).expect(status);
  },
});

const rules = (report: { findings: { rule: string; level: string; subject: string | null }[] }) =>
  report.findings.map((f) => `${f.level}:${f.rule}`);

const content = (personnel: object[], extra: object = {}) => ({
  times: { alarmedAt: T('13:05'), returnedAt: T('15:50') },
  situation: 'Rauch aus Kellerfenster',
  actions: 'Innenangriff mit 1 C-Rohr',
  personnel,
  ...extra,
});

const statistics = { mainType: 'fire', fireSize: 'small-b' };

/** Sets the statistics of an incident with the version currently stored, as the incident page does. */
const setStatistics = async (incidentId: string, value: object | null = statistics, cookie = admin) => {
  const current = await get(`/incidents/incidents/${incidentId}`, cookie);
  return put(`/incidents/incidents/${incidentId}/statistics`, { statistics: value, version: current.body?.version ?? 0 }, cookie);
};

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/incidents/keywords/templates/bw', {}).expect(201);
  await put('/core/settings/incidents.general', { homeMunicipalities: ['Musterstadt'] }).expect(200);
  // The EvD reports of the duty officer module are covered in duty-officer.integration.ts.
  await put('/core/settings/duty-officer.general', { reportRequired: false }).expect(200);
  // The statute rates are no defaults any more: adopt the sample statute like a brigade would.
  await put('/core/settings/compensation.general', SAMPLE_STATUTE).expect(200);

  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
  ids.lf = (await post('/masterdata/vehicles', { designation: 'LF 20/16', vehicleType: 'lf-20-16', departmentId: ids.musterstadt }).expect(201)).body.id;
  ids.tsf = (await post('/masterdata/vehicles', { designation: 'TSF', vehicleType: 'tsf', departmentId: ids.ahornfeld, seats: 1 }).expect(201)).body.id;
  ids.station = (await post('/masterdata/stations', { name: 'Feuerwehrhaus Ahornfeld', departmentId: ids.ahornfeld }).expect(201)).body.id;

  const person = async (firstName: string, departmentId: string) =>
    (
      await post('/masterdata/persons', {
        firstName,
        lastName: 'Test',
        status: 'active',
        memberships: [{ departmentId, from: '2020-01-01', primary: true }],
      }).expect(201)
    ).body.id as string;
  ids.jonas = await person('Jonas', ids.musterstadt);
  ids.max = await person('Max', ids.musterstadt);
  ids.lena = await person('Lena', ids.ahornfeld);
  await post(`/masterdata/persons/${ids.jonas}/qualifications`, { qualification: 'breathing-apparatus', acquiredOn: '2020-01-01' }).expect(201);
  // Jonas is a fit breathing apparatus wearer (respiratory protection module), so only Max gets a warning.
  for (const kind of ['examination', 'briefing', 'stress-exercise', 'exercise']) {
    await post('/respiratory-protection/evidence', { personId: ids.jonas, kind, date: '2026-01-15', kilojoules: kind === 'stress-exercise' ? 90 : null, passed: kind === 'stress-exercise' ? true : null, result: kind === 'examination' ? 'no-concerns' : null }).expect(201);
  }

  // A group leader of Musterstadt who may write reports of his department only.
  const role = await post('/core/roles', { name: 'GF Test', permissions: ['incidents.reports.read', 'incidents.reports.write'] }).expect(201);
  await post('/core/users', {
    username: 'gf.musterstadt',
    displayName: 'GF Musterstadt',
    password: 'auch-sehr-geheim',
    roles: [{ roleId: role.body.id, departmentId: ids.musterstadt }],
  }).expect(201);
  writer = await test.login({ username: 'gf.musterstadt', password: 'auch-sehr-geheim' });
  await post('/core/users', { username: 'gf.ahornfeld', displayName: 'GF Ahornfeld', password: 'auch-sehr-geheim', roles: [{ roleId: role.body.id, departmentId: ids.ahornfeld }] }).expect(201);
  ahornfeldWriter = await test.login({ username: 'gf.ahornfeld', password: 'auch-sehr-geheim' });
});

afterAll(() => test?.app.close());

describe('incidents and reports', () => {
  it('creates an incident with one draft per department; the first becomes the primary report', async () => {
    const incident = await post('/incidents/incidents', {
      dispatchNumber: '2026-104711',
      alarmKeyword: 'B2',
      alarmedAt: T('13:05'),
      location: { street: 'Hauptstraße', houseNumber: '12', city: 'Musterstadt' },
      departmentIds: [ids.musterstadt, ids.ahornfeld],
    }).expect(201);
    ids.incident = incident.body.id;
    const [primary, secondary] = incident.body.reports;
    expect(primary).toMatchObject({ departmentId: ids.musterstadt, primary: true, number: '2026-001', status: 'draft' });
    expect(secondary).toMatchObject({ departmentId: ids.ahornfeld, primary: false });
    ids.musterstadtReport = primary.id;
    ids.ahornfeldReport = secondary.id;

    await post('/incidents/incidents', { dispatchNumber: '2026-104711', alarmKeyword: 'B2', alarmedAt: T('13:05') }).expect(409);
    await post('/incidents/incidents', { alarmKeyword: 'Unbekannt', alarmedAt: T('13:05') }).expect(400);
    const internal = await post('/incidents/incidents', { alarmKeyword: 'BSW', alarmedAt: T('19:00') }).expect(201);
    expect(internal.body).toMatchObject({ dispatchNumber: 'INT-2026-0001', internalNumber: true });
    // The real number arrives later; new internal numbers must not collide with numbers still in use.
    const second = await post('/incidents/incidents', { alarmKeyword: 'BSW', alarmedAt: T('20:00') }).expect(201);
    expect(second.body.dispatchNumber).toBe('INT-2026-0002');
    await test.app.get(EntityManager).getConnection().execute(`update "incidents"."incident" set "dispatch_number" = '2026-104799', "internal_number" = false where "id" = ?`, [internal.body.id]);
    expect((await post('/incidents/incidents', { alarmKeyword: 'BSW', alarmedAt: T('21:00') }).expect(201)).body.dispatchNumber).toBe('INT-2026-0003');

    const report = await get(`/incidents/reports/${ids.musterstadtReport}`).expect(200);
    // The default end (alarm + 1 h) keeps the times step open until the author confirms it.
    expect(rules(report.body)).toEqual(['error:report-empty', 'error:statistics-missing', 'error:no-personnel', 'error:end-unconfirmed']);
    expect(report.body.endConfirmed).toBe(false);
    // Only writers of the primary report change the incident data, with the version they loaded.
    const data = { dispatchNumber: '2026-104711', alarmKeyword: 'B3', alarmedAt: T('13:05'), version: incident.body.version };
    expect((await put(`/incidents/incidents/${ids.incident}`, data, ahornfeldWriter).expect(403)).body.code).toBe('incidents.notPrimaryWriter');
    await put(`/incidents/incidents/${ids.incident}`, { ...data, version: undefined }, writer).expect(400);
    await put(`/incidents/incidents/${ids.incident}`, { ...data, alarmKeyword: 'B2' }, writer).expect(200);
    await put(`/incidents/incidents/${ids.incident}`, { ...data, alarmKeyword: 'B2' }, writer).expect(409);
    // The statistics belong to the incident, pre-filled from keyword and location; reports carry none.
    expect(incident.body).toMatchObject({ statistics: null, statisticsCounted: true, statisticsEditable: true });
    expect(incident.body.statisticsSuggestion).toEqual({ ownMunicipality: true, mainType: 'fire', technicalCategory: null, falseAlarmType: null });
    expect(report.body).not.toHaveProperty('statistics');
  });

  it('keeps costs and notes once for the whole incident, entered by the commander', async () => {
    const incident = (await get(`/incidents/incidents/${ids.incident}`).expect(200)).body;
    expect(incident).toMatchObject({ chargeable: false, chargeableReason: '', notes: '' });
    // Group leaders write reports, but the costs are the commander's.
    await put(`/incidents/incidents/${ids.incident}/costs`, { chargeable: true }, writer).expect(403);
    const saved = await put(`/incidents/incidents/${ids.incident}/costs`, { chargeable: true, chargeableReason: 'Verursacher bekannt', notes: 'Rechnung an Halter', version: incident.version }).expect(200);
    expect(saved.body).toMatchObject({ chargeable: true, chargeableReason: 'Verursacher bekannt', notes: 'Rechnung an Halter' });
    await put(`/incidents/incidents/${ids.incident}/costs`, { chargeable: false, version: incident.version }).expect(409);
    // The reports carry no costs of their own.
    const report = (await get(`/incidents/reports/${ids.ahornfeldReport}`, ahornfeldWriter).expect(200)).body;
    expect(report).not.toHaveProperty('chargeable');
    expect(report).not.toHaveProperty('notes');
    await put(`/incidents/incidents/${ids.incident}/costs`, { chargeable: false, version: saved.body.version }).expect(200);
  });

  it('computes compensation and checks personnel against the other report of the incident', async () => {
    // The writer of the primary report enters the statistics of the incident.
    await setStatistics(ids.incident, statistics, writer).then((r) => expect(r.status).toBe(200));
    const musterstadt = await save(ids.musterstadtReport, content(
      [
        { personId: ids.jonas, vehicleId: ids.lf, function: 'attack-team', breathingApparatus: true, breathingMinutes: 28 },
        { personId: ids.max, vehicleId: ids.lf, breathingApparatus: true },
        { guestName: 'Kamerad Nachbarwehr', vehicleId: ids.lf },
      ],
    ), writer).expect(200);
    expect(musterstadt.body.personnel[0].compensation).toEqual({ hours: 3, rate: 15, allowances: 0, amount: 45, overridden: false });
    expect(musterstadt.body.personnel[2].compensation.amount).toBe(0);
    expect(musterstadt.body.compensationTotal).toBe(90);
    expect(rules(musterstadt.body)).toEqual(['warning:breathing-without-qualification']);

    // The group leader of Musterstadt cannot even see the report of Ahornfeld.
    await save(ids.ahornfeldReport, content([{ personId: ids.lena, standbyStationId: ids.station }]), writer).expect(404);

    const ahornfeld = await save(ids.ahornfeldReport, content([
      { personId: ids.lena, standbyStationId: ids.station },
      { personId: ids.jonas, vehicleId: ids.tsf, from: T('15:00'), to: T('16:30') },
    ])).expect(200);
    expect(ahornfeld.body.personnel[0].compensation).toMatchObject({ hours: 1, amount: 15 });
    // Jonas belongs to Musterstadt and stays beyond the end of the report.
    expect(rules(ahornfeld.body)).toEqual(['warning:personnel-times-outside', 'warning:person-not-member', 'error:personnel-overlap-incident']);
    await save(ids.ahornfeldReport, content([{ personId: ids.lena, standbyStationId: ids.station }])).expect(200);
  });

  it('computes with the incident rates of the compensation statute', async () => {
    const before = (await get('/core/settings/compensation.general').expect(200)).body ?? {};
    await put('/core/settings/compensation.general', { ...before, incidentRates: [{ kind: 'incident', validFrom: '2026-01-01', amount: 20 }], incidentRounding: 'exact-minutes' }).expect(200);
    const report = await save(ids.ahornfeldReport, content([{ personId: ids.jonas, vehicleId: ids.tsf, from: T('15:00'), to: T('16:30') }])).expect(200);
    expect(report.body.personnel[0].compensation).toMatchObject({ hours: 1.5, rate: 20, amount: 30 });
    await put('/core/settings/compensation.general', before).expect(200);
    await save(ids.ahornfeldReport, content([{ personId: ids.lena, standbyStationId: ids.station }])).expect(200);
  });

  it('previews an incident with unsaved compensation settings', async () => {
    const incidentId = (await get(`/incidents/reports/${ids.musterstadtReport}`).expect(200)).body.incidentId as string;
    const reports = (await get('/compensation/preview/reports?from=2026-01-01&to=2026-12-31').expect(200)).body as { incidentId: string }[];
    expect(reports.map((r) => r.incidentId)).toContain(incidentId);
    const settings = { incidentRates: [{ kind: 'incident', validFrom: '2026-01-01', amount: 20 }], incidentMinimumHours: 4, maxPerService: 70 };
    const preview = (await post('/compensation/preview', { incidentId, settings }).expect(200)).body;
    const musterstadt = preview.reports.find((r: { reportId: string }) => r.reportId === ids.musterstadtReport);
    expect(musterstadt.personnel[0]).toMatchObject({ personId: ids.jonas, hours: 4, rate: 20, computed: 80, amount: 70, hints: ['capped'] });
    expect(musterstadt.personnel[2]).toMatchObject({ personId: null, amount: 0, hints: [] });
    // Nothing is saved: the report still computes with the current rates.
    expect((await get(`/incidents/reports/${ids.musterstadtReport}`).expect(200)).body.personnel[0].compensation).toMatchObject({ hours: 3, rate: 15 });
  });

  it('lets the author submit only without errors and with acknowledged warnings', async () => {
    const blocked = await post(`/incidents/reports/${ids.musterstadtReport}/submit`, {}, writer).expect(400);
    expect(blocked.body.code).toBe('incidents.warningsNotAcknowledged');
    const submitted = await post(`/incidents/reports/${ids.musterstadtReport}/submit`, {
      acknowledgements: [{ rule: 'breathing-without-qualification', subject: ids.max, reason: 'Lehrgang im Nachgang erfasst' }],
    }, writer).expect(200);
    expect(submitted.body).toMatchObject({ status: 'review', locked: false });
    expect(submitted.body.findings[0]).toMatchObject({ rule: 'breathing-without-qualification', acknowledged: true, reason: 'Lehrgang im Nachgang erfasst' });

    // Once submitted, the author can neither submit again nor change the report until it is returned.
    const again = await post(`/incidents/reports/${ids.musterstadtReport}/submit`, {}, writer).expect(403);
    expect(again.body.code).toBe('incidents.notDraft');
    await save(ids.musterstadtReport, content([{ personId: ids.jonas, vehicleId: ids.lf }]), writer).expect(403);
  });

  it('returns a report to the author and accepts it again', async () => {
    const rita = (await post('/masterdata/persons', { firstName: 'Rita', lastName: 'Test', email: 'rita@example.org', status: 'active', memberships: [{ departmentId: ids.musterstadt, from: '2010-01-01', to: '2015-12-31', primary: true }] }).expect(201)).body.id;
    const before = (await post(`/incidents/reports/${ids.musterstadtReport}/author`, { authorPersonId: rita }).expect(200)).body.authorPersonId;
    const returned = await post(`/incidents/reports/${ids.musterstadtReport}/return`, { comment: 'Bitte Einsatzleiter eintragen' }).expect(200);
    expect(returned.body).toMatchObject({ status: 'draft', returnComment: 'Bitte Einsatzleiter eintragen' });
    // The author is told by e-mail.
    const mail = test.app.get(MailService).sent.at(-1)!;
    expect(mail).toMatchObject({ to: 'rita@example.org' });
    expect(mail.subject).toContain('Einsatzbericht zurückgegeben');
    expect(mail.text).toContain('Bitte Einsatzleiter eintragen');
    expect(before).toBe(rita);
    await post(`/incidents/reports/${ids.musterstadtReport}/return`, { comment: 'x' }, writer).expect(403);
    await post(`/incidents/reports/${ids.musterstadtReport}/submit`, {}, writer).expect(200);
  });

  it('releases for billing, locks the report and publishes the release', async () => {
    const events: ReportReleasedEvent[] = [];
    test.app.get(DomainEvents).subscribe<ReportReleasedEvent>(INCIDENTS_EVENTS.reportReleased, (e) => {
      events.push(e);
    });

    const released = await post(`/incidents/reports/${ids.musterstadtReport}/release`, { level: 'billing' }).expect(200);
    expect(released.body).toMatchObject({ status: 'released-billing', locked: true, lockedBy: 'Admin' });
    expect(events).toEqual([
      expect.objectContaining({
        reportId: ids.musterstadtReport,
        level: 'billing',
        dispatchNumber: '2026-104711',
        alarmKeyword: 'B2',
        compensationKind: 'incident',
        personnel: [
          expect.objectContaining({ personId: ids.jonas, vehicleId: ids.lf, breathingApparatus: true, breathingMinutes: 28, hours: 3, rate: 15, amount: 45, lossOfEarnings: false }),
          expect.objectContaining({ personId: ids.max, vehicleId: ids.lf, breathingApparatus: true, breathingMinutes: null, amount: 45 }),
        ],
      }),
    ]);

    // A released report is changed by nobody, not even by releasers: they unlock it first, so the receivers learn of it.
    const locked = await save(ids.musterstadtReport, content([]), writer).expect(403);
    expect(locked.body.code).toBe('incidents.reportReleased');
    expect((await save(ids.musterstadtReport, content([])).expect(403)).body.code).toBe('incidents.reportReleased');
    const revisions = (await get(`/incidents/reports/${ids.musterstadtReport}/revisions`).expect(200)).body as { id: string }[];
    expect((await post(`/incidents/reports/${ids.musterstadtReport}/revisions/${revisions.at(-1)!.id}/restore`, {}).expect(403)).body.code).toBe('incidents.reportReleased');
    // A released primary report keeps its role until it is unlocked.
    expect((await post(`/incidents/reports/${ids.ahornfeldReport}/primary`, {}).expect(403)).body.code).toBe('incidents.reportReleased');
    expect((await post(`/incidents/reports/${ids.musterstadtReport}/primary`, {}).expect(403)).body.code).toBe('incidents.reportReleased');
    expect((await post(`/incidents/reports/${ids.musterstadtReport}/author`, { authorPersonId: null }).expect(403)).body.code).toBe('incidents.reportReleased');
    await post(`/incidents/reports/${ids.musterstadtReport}/release`, { level: 'compensation' }).expect(409);

    const unlocked = await post(`/incidents/reports/${ids.musterstadtReport}/unlock`, { reason: 'Personal korrigieren' }).expect(200);
    expect(unlocked.body).toMatchObject({ status: 'review', locked: false });
    const audit = (await get('/core/audit')).body as { action: string; details: { reason?: string; reportNumber?: string }; references: Record<string, { label: unknown; to?: string }> }[];
    const unlockedEntry = audit.find((e) => e.action === 'incidents.report-unlocked')!;
    expect(unlockedEntry.details.reason).toBe('Personal korrigieren');
    // The audit log names the report by its number and department and links it.
    expect(unlockedEntry.references[ids.musterstadtReport]).toEqual({
      kind: 'incidents.report',
      label: `${unlockedEntry.details.reportNumber} · Abteilung Musterstadt`,
      to: `/incidents/reports/${ids.musterstadtReport}`,
    });
  });

  it('switches the primary report and keeps the statistics with the incident', async () => {
    const ahornfeld = await post(`/incidents/reports/${ids.ahornfeldReport}/primary`, {}).expect(200);
    expect(ahornfeld.body.primary).toBe(true);
    expect(rules(ahornfeld.body)).not.toContain('error:statistics-missing');
    expect((await get(`/incidents/reports/${ids.musterstadtReport}`).expect(200)).body.primary).toBe(false);
    expect((await get(`/incidents/incidents/${ids.incident}`).expect(200)).body.statistics).toMatchObject({ mainType: 'fire', fireSize: 'small-b' });
    await test.http.delete(`/api/incidents/reports/${ids.ahornfeldReport}`).set('Cookie', admin).set(UI).expect(409);
  });

  it('shows changes of personnel in the history of the report and limits reading to the department', async () => {
    const history = await get(`/core/history/incidents.report/${ids.musterstadtReport}`).expect(200);
    expect(history.body.map((e: { entity: string }) => e.entity)).toEqual(expect.arrayContaining(['incidents.report', 'incidents.report_personnel']));
    await get(`/incidents/reports/${ids.ahornfeldReport}`, writer).expect(404);
    await get(`/core/history/incidents.report/${ids.ahornfeldReport}`, writer).expect(404);

    const incidents = (await get('/incidents/incidents', writer).expect(200)).body as { dispatchNumber: string }[];
    expect(incidents.map((i) => i.dispatchNumber)).toEqual(['2026-104711']);
  });

  it('lists open reports as tasks of the releasers', async () => {
    const tasks = (await get('/core/tasks?asOf=2026-10-25')).body as { kind: string }[];
    // The draft of Ahornfeld was edited (and so locked) by the releaser: the task is the releaser's, not the author's.
    expect(tasks.map((t) => t.kind)).toEqual(expect.arrayContaining(['report-review', 'report-locked']));
  });
});

describe('API for external systems', () => {
  it('creates and completes incidents idempotently by dispatch number', async () => {
    await put(`/masterdata/persons/${ids.max}`, { firstName: 'Max', lastName: 'Test', personnelNumber: '9001' }).expect(200);
    const token = await post('/core/tokens', { name: 'Alarmfax', scopes: ['incidents.api.create'] }).expect(201);
    const bearer = { Authorization: `Bearer ${token.body.token}` };
    const payload = {
      dispatchNumber: '2026-200001',
      alarmKeyword: 'TH-VU',
      alarmedAt: T('20:15'),
      location: { street: 'B 311', city: 'Ehingen' },
      departments: ['Musterstadt', 'Abt. Unbekannt'],
      personnel: [
        { personnelNumber: '9001', vehicle: 'LF 20/16', function: 'group-leader' },
        { personnelNumber: '0000' },
      ],
    };

    const first = await test.http.post('/api/incidents/v1/incidents').set(bearer).send(payload).expect(200);
    expect(first.body).toMatchObject({ created: true, reports: [{ departmentId: ids.musterstadt, created: true }] });
    expect(first.body.warnings).toEqual([
      { code: 'incidents.api.unknownDepartment', value: 'Abt. Unbekannt' },
      { code: 'incidents.api.unknownPerson', value: '0000' },
    ]);
    const report = await get(`/incidents/reports/${first.body.reports[0].id}`).expect(200);
    expect(report.body).toMatchObject({ authorPersonId: ids.max, personnel: [{ personId: ids.max, vehicleId: ids.lf, function: 'group-leader' }] });
    // Overlandhilfe: Ehingen is not a home municipality.
    const incident = (await get(`/incidents/incidents/${report.body.incidentId}`).expect(200)).body;
    expect(incident.statisticsSuggestion).toMatchObject({ ownMunicipality: false, mainType: 'technical-assistance', technicalCategory: 'rescue-persons' });

    const second = await test.http.post('/api/incidents/v1/incidents').set(bearer).send(payload).expect(200);
    expect(second.body).toMatchObject({ created: false, reports: [{ created: false, updated: false }] });

    // Once a person edited the report, the API leaves it alone.
    await save(first.body.reports[0].id, content([])).expect(200);
    await test.http.post('/api/incidents/v1/incidents').set(bearer).send(payload).expect(200);
    expect((await get(`/incidents/reports/${first.body.reports[0].id}`)).body.personnel).toEqual([]);

    // Tokens without the scope and normal writers are rejected.
    await test.http.post('/api/incidents/v1/incidents').set('Cookie', writer).set(UI).send(payload).expect(403);
  });
});

describe('evaluations', () => {
  it('lists open reports and hours per person', async () => {
    const open = await get('/core/lists/incidents.open-reports?lang=de').expect(200);
    expect(open.body.rows.length).toBeGreaterThan(0);
    expect(open.body.rows[0]).toHaveProperty('errors');

    const hours = await get('/core/lists/incidents.hours-per-person?from=2026-10-01&to=2026-10-31').expect(200);
    const jonas = hours.body.rows.find((r: { name: string }) => r.name === 'Test, Jonas');
    expect(jonas).toMatchObject({ incidents: 1, hours: 2.8, breathing: 28 });
  });

  it('exports the compensation workbook like the former auswertung.py', async () => {
    const response = await get('/incidents/compensation/export?from=2026-10-01&to=2026-10-31&includeUnreleased=true&lang=de')
      .buffer(true)
      .parse(((res: NodeJS.ReadableStream, callback: (e: Error | null, b: Buffer) => void) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      }) as never)
      .expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body as ArrayBuffer);
    expect(workbook.worksheets.map((w) => w.name)).toEqual(['Betrag pro Person', 'Summe je Abteilung', 'Einsätze', 'EvD-Dienste', 'Hinweise', 'Überschneidungen']);
    const perPerson = workbook.getWorksheet('Betrag pro Person')!;
    const total = perPerson.getRow(perPerson.rowCount);
    expect(total.getCell(2).value).toBe('GESAMT');
    expect(total.getCell(6).value).toBe(105);
    const notes = workbook.getWorksheet('Hinweise')!;
    expect(notes.getRow(4).getCell(1).value).toBe('Bericht nicht freigegeben (fehlt in der Auszahlung)');

    await get('/incidents/compensation/export?from=2026-10-01&to=2026-10-31', writer).expect(403);
  });
});

describe('deleting organization objects', () => {
  it('deletes only departments, stations and vehicles nothing refers to', async () => {
    // Used by reports or members: refused with the reason.
    expect((await del(`/masterdata/departments/${ids.musterstadt}`).expect(409)).body.code).toBe('masterdata.departmentHasMembers');
    expect((await del(`/masterdata/vehicles/${ids.lf}`).expect(409)).body).toMatchObject({ code: 'masterdata.inUse', kind: 'vehicle', modules: ['incidents'] });
    expect((await del(`/masterdata/stations/${ids.station}`).expect(409)).body).toMatchObject({ code: 'masterdata.inUse', modules: ['incidents'] });

    // A new department with a role assignment is referenced by the core.
    const unit = (await post('/masterdata/departments', { name: 'Gesamtfeuerwehr', shortName: 'Gesamt', type: 'command' }).expect(201)).body.id;
    const role = (await post('/core/roles', { name: 'EvD', permissions: ['incidents.reports.write'] }).expect(201)).body.id;
    const user = await post('/core/users', { username: 'evd', displayName: 'EvD', password: 'auch-sehr-geheim', roles: [{ roleId: role, departmentId: unit }] }).expect(201);
    expect((await del(`/masterdata/departments/${unit}`).expect(409)).body).toMatchObject({ code: 'masterdata.inUse', modules: ['core'] });
    await put(`/core/users/${user.body.id}`, { username: 'evd', displayName: 'EvD', roles: [] }).expect(200);

    // Station with a vehicle blocks; once the vehicle is gone, both can be deleted, then the department.
    const station = (await post('/masterdata/stations', { name: 'Leitstelle Gesamt', departmentId: unit }).expect(201)).body.id;
    const kdow = (await post('/masterdata/vehicles', { designation: 'KdoW', vehicleType: 'kdow', departmentId: unit, stationId: station }).expect(201)).body.id;
    expect((await del(`/masterdata/stations/${station}`).expect(409)).body.code).toBe('masterdata.stationHasVehicles');
    expect((await del(`/masterdata/departments/${unit}`).expect(409)).body.code).toBe('masterdata.departmentHasStations');
    await del(`/masterdata/vehicles/${kdow}`).expect(204);
    await del(`/masterdata/stations/${station}`).expect(204);
    await del(`/masterdata/departments/${unit}`).expect(204);
    expect((await get('/masterdata/departments')).body.map((d: { id: string }) => d.id)).not.toContain(unit);
  });
});

describe('Import of incident personnel (table)', () => {
  const header = 'Personalnummer;Name;Person von;Person bis;Bereitschaft;Atemschutz;Verdienstausfall;Fahrzeug;Einsatznummer;Beginn;Ende;Alarmstichwort;Leitstellennummer;Lage;Verlauf;Bericht;Hauptbericht;Freigabestatus;Abteilung;Funktion;Statistik: Einsatzhauptart;Statistik: Brandgröße;Statistik: gerettete Personen';
  const rows = [
    ';Test Jonas;21.10.2025 13:05;21.10.2025 15:50;Nein;Ja;Nein;LF 20/16;17;21.10.2025 13:05;21.10.2025 15:50;B3-MP;2025-555;Rauch aus Dach;Löschmaßnahmen;Brand im Dachstuhl gelöscht;Ja;released-billing;Abt. Musterstadt;Fahrer;Brand;Mittelbrand;1',
    '9001;Test Max;21.10.2025 13:05;21.10.2025 15:50;Nein;Nein;Ja;LF 20/16;17;21.10.2025 13:05;21.10.2025 15:50;B3-MP;2025-555;Rauch aus Dach;Löschmaßnahmen;Brand im Dachstuhl gelöscht;Ja;released-billing;Abt. Musterstadt;Maschinist;Brand;Mittelbrand;1',
    ';Test Lena;21.10.2025 13:30;21.10.2025 15:00;Ja;Nein;Nein;;4;21.10.2025 13:30;21.10.2025 15:00;B3-MP;2025-555;;;Nachgefordert;Nein;Entwurf;Abt. Ahornfeld;;;;',
    ';Person Unbekannt;21.10.2025 13:30;21.10.2025 15:00;Nein;Nein;Nein;;4;21.10.2025 13:30;21.10.2025 15:00;B3-MP;2025-555;;;Nachgefordert;Nein;Entwurf;Abt. Ahornfeld;;;;',
  ];
  const csv = [header, ...rows].join('\r\n');

  const run = async (apply: boolean) => {
    const upload = await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(csv), 'Einsatzpersonal.csv').expect(201);
    const mapping = upload.body.suggestions['incidents.personnel'];
    return post(`/core/imports/${upload.body.id}/${apply ? 'apply' : 'preview'}`, { profile: 'incidents.personnel', mapping }).expect(200);
  };

  it('suggests the columns by their names, statistics included', async () => {
    const upload = await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(csv), 'Einsatzpersonal.csv').expect(201);
    expect(upload.body.suggestions['incidents.personnel']).toMatchObject({
      vehicle: 'Fahrzeug',
      department: 'Abteilung',
      personName: 'Name',
      status: 'Freigabestatus',
      primary: 'Hauptbericht',
      mainType: 'Statistik: Einsatzhauptart',
      fireSize: 'Statistik: Brandgröße',
      rescued: 'Statistik: gerettete Personen',
    });
  });

  it('creates incident, reports and personnel and is repeatable', async () => {
    // The preview creates nothing, not even incidents or keywords that the run would flush in between.
    const preview = await run(false);
    expect(preview.body.counts).toEqual({ create: 3, update: 0, unchanged: 0, error: 1 });
    expect((await get('/incidents/incidents?from=2025-10-21&to=2025-10-21')).body).toHaveLength(0);

    const result = await run(true);
    expect(result.body.counts).toEqual({ create: 3, update: 0, unchanged: 0, error: 1 });
    expect(result.body.rows[3].messages[0]).toMatchObject({ code: 'incidents.import.unknownPerson', params: { name: 'Person Unbekannt' } });
    // The keyword is new: created and offered for assignment to an existing one.
    expect(result.body.rows[0].messages).toEqual([
      { code: 'incidents.import.keywordCreated', params: { kind: 'alarm-keyword', value: 'B3-MP' } },
      { code: 'incidents.import.unknownFunction', params: { kind: 'function', value: 'Fahrer' } },
    ]);
    expect(result.body.unmatched).toEqual([
      { kind: 'alarm-keyword', value: 'B3-MP', count: 2 },
      { kind: 'function', value: 'Fahrer', count: 1 },
    ]);

    const incidents = (await get('/incidents/incidents?from=2025-10-21&to=2025-10-21')).body as { id: string; dispatchNumber: string; createdVia: string; reports: { id: string; departmentId: string; primary: boolean; status: string; locked: boolean }[] }[];
    expect(incidents).toHaveLength(1);
    const [incident] = incidents;
    expect(incident).toMatchObject({ dispatchNumber: '2025-555', createdVia: 'import' });
    const musterstadt = incident.reports.find((r) => r.departmentId === ids.musterstadt)!;
    const ahornfeld = incident.reports.find((r) => r.departmentId === ids.ahornfeld)!;
    expect(musterstadt).toMatchObject({ primary: true, status: 'released-billing', locked: true });
    // A table import keeps its reports replaceable, but they are not read-only like those of MP-Feuer.
    expect((await get(`/incidents/reports/${musterstadt.id}`)).body).toMatchObject({ managedBy: 'import', lockedBy: 'Import' });
    expect(ahornfeld).toMatchObject({ primary: false, status: 'draft', locked: false });

    const report = (await get(`/incidents/reports/${musterstadt.id}`)).body;
    expect(report.times).toMatchObject({ alarmedAt: '2025-10-21T11:05:00.000Z', returnedAt: '2025-10-21T13:50:00.000Z' });
    // "Verlauf" and "Bericht" together; the statistics from their columns (names of the state template).
    expect(report).toMatchObject({ situation: 'Rauch aus Dach', actions: 'Löschmaßnahmen\n\nBrand im Dachstuhl gelöscht' });
    expect((await get(`/incidents/incidents/${incident.id}`)).body.statistics).toMatchObject({ mainType: 'fire', fireSize: 'medium', rescued: 1, ownMunicipality: true });
    expect(report.personnel.map((p: { function: string | null }) => p.function)).toEqual([null, 'machinist']);
    expect(report.personnel.map((p: { personId: string; vehicleId: string; breathingApparatus: boolean; lossOfEarnings: boolean }) => [p.personId, p.vehicleId, p.breathingApparatus, p.lossOfEarnings])).toEqual([
      [ids.jonas, ids.lf, true, false],
      [ids.max, ids.lf, false, true],
    ]);
    const ahornfeldReport = (await get(`/incidents/reports/${ahornfeld.id}`)).body;
    expect(ahornfeldReport.personnel[0]).toMatchObject({ personId: ids.lena, standbyStationId: ids.station, compensation: { hours: 1 } });

    // Again: the imported reports are replaced, not duplicated.
    const again = await run(true);
    expect(again.body.counts).toMatchObject({ create: 0, update: 3, error: 1 });

    // Once a person edited a report, the import leaves it alone.
    await save(ahornfeld.id, content([{ personId: ids.lena, standbyStationId: ids.station }])).expect(200);
    const third = await run(false);
    expect(third.body.rows.filter((r: { action: string }) => r.action === 'unchanged')).toHaveLength(2);
  });
});

describe('annual statistics', () => {
  it('computes the values, takes corrections and fills the state template', async () => {
    const preview = await get('/incidents/statistics/2026').expect(200);
    const value = (key: string) => preview.body.values.find((v: { question: string; column: string }) => `${v.question}:${v.column}` === key)?.value;
    expect(value('F2:D')).toBe(2);
    expect(value('F13:D')).toBe(3);
    expect(value('F20:D')).toBe(1);
    expect(value('F70:D')).toBe(1);
    expect(value('F63:D')).toBe(1);
    // Incidents: B2 (fire small B, once although with two reports); the BSW incidents do not count; the TH-VU incident of
    // the API has no statistics yet.
    expect(value('F28:D')).toBe(1);
    expect(value('F30:D')).toBe(1);
    const check = (code: string) => preview.body.checks.find((c: { code: string }) => c.code === code);
    expect(check('statistics.fireSizes').ok).toBe(true);
    expect(check('statistics.unreleasedPrimaryReports')).toMatchObject({ ok: false });
    expect(check('statistics.incidentsWithoutStatistics')).toMatchObject({ ok: false, params: { count: 1 } });

    const corrected = await put('/incidents/statistics/2026/corrections', { corrections: { 'F129:D': 238, 'F13:D': 5 } }).expect(200);
    expect(corrected.body.values.find((v: { question: string }) => v.question === 'F129')).toMatchObject({ source: 'manual', computed: 0, value: 238 });
    expect(corrected.body.values.find((v: { question: string; column: string }) => v.question === 'F13')).toMatchObject({ computed: 3, corrected: 5, value: 5 });

    const response = await get('/incidents/statistics/2026/export').buffer(true).parse(binary()).expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    const row = (id: string) => {
      let found = 0;
      sheet.eachRow((r, i) => {
        if (r.getCell(1).value === id) found = i;
      });
      return sheet.getRow(found);
    };
    expect(row('F13').getCell('D').value).toBe(5);
    expect(row('F129').getCell('D').value).toBe(238);
    expect(workbook.creator).toBe('f.orga');

    // Open checks: closing needs a confirmation.
    expect((await post('/incidents/statistics/2026/close', {}).expect(409)).body.code).toBe('incidents.statisticsChecksOpen');
    const closed = await post('/incidents/statistics/2026/close', { force: true }).expect(200);
    expect(closed.body).toMatchObject({ changedSinceClose: false });
    await put('/incidents/statistics/2026/corrections', { corrections: { 'F1:D': 1 } }).expect(409);
    await get('/incidents/statistics/2026', writer).expect(403);
    // The statistics of the incidents of a closed year are fixed, for releasers as well.
    expect((await setStatistics(ids.incident, { mainType: 'fire', fireSize: 'medium' })).body.code).toBe('incidents.statisticsClosed');
    expect((await get(`/incidents/incidents/${ids.incident}`).expect(200)).body).toMatchObject({ statisticsEditable: false, statistics: expect.objectContaining({ fireSize: 'small-b' }) });
    await post('/incidents/statistics/2026/reopen', {}).expect(200);
    expect((await get(`/incidents/incidents/${ids.incident}`).expect(200)).body.statisticsEditable).toBe(true);
  });
});

function binary() {
  return ((res: NodeJS.ReadableStream, callback: (e: Error | null, b: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  }) as never;
}

describe('undo and payout check', () => {
  it('keeps revisions of a report and restores an earlier state', async () => {
    const incident = await post('/incidents/incidents', { alarmKeyword: 'TH1', alarmedAt: T('09:00'), departmentIds: [ids.musterstadt] }).expect(201);
    const reportId = incident.body.reports[0].id;
    await save(reportId, content([{ personId: ids.jonas, vehicleId: ids.lf }], { times: { alarmedAt: T('09:00'), returnedAt: T('10:00') } }), writer).expect(200);
    // Auto-save of the same user within minutes updates the latest revision.
    await save(reportId, content([{ personId: ids.jonas, vehicleId: ids.lf }, { personId: ids.max, vehicleId: ids.lf }], { times: { alarmedAt: T('09:00'), returnedAt: T('10:00') } }), writer).expect(200);

    const revisions = (await get(`/incidents/reports/${reportId}/revisions`, writer).expect(200)).body as { id: string; personnelCount: number; userName: string }[];
    expect(revisions.map((r) => [r.userName, r.personnelCount])).toEqual([
      ['GF Musterstadt', 2],
      ['', 0],
    ]);
    const restored = await post(`/incidents/reports/${reportId}/revisions/${revisions[1].id}/restore`, {}, writer).expect(200);
    expect(restored.body.personnel).toEqual([]);
    expect(restored.body.situation).toBe('');
  });

  it('lists personnel problems and unreleased reports before the payout', async () => {
    const check = await get('/incidents/compensation/check?from=2026-10-01&to=2026-10-31').expect(200);
    const codes = new Set((check.body.problems as { code: string }[]).map((p) => p.code));
    expect(codes).toEqual(new Set(['not-released', 'no-personnel', 'personnel-overlap-other']));
    expect(check.body.reportsChecked).toBeGreaterThan(check.body.reportsReleased);

    // Before the first rate is valid (2026-01-01) a member gets nothing: reported as "zero-amount".
    const old = await post('/incidents/incidents', { alarmKeyword: 'B1', alarmedAt: '2025-12-31T10:00:00+01:00', departmentIds: [ids.musterstadt] }).expect(201);
    await save(old.body.reports[0].id, content([{ personId: ids.max, vehicleId: ids.lf }], {
      times: { alarmedAt: '2025-12-31T10:00:00+01:00', returnedAt: '2025-12-31T11:00:00+01:00' },
    })).expect(200);
    const december = await get('/incidents/compensation/check?from=2025-12-01&to=2025-12-31').expect(200);
    expect(december.body.problems).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'zero-amount', person: 'Test, Max' })]),
    );
    await get('/incidents/compensation/check?from=2026-10-01&to=2026-10-31', writer).expect(403);
  });

  it('can switch off the release for compensation payout', async () => {
    await put('/core/settings/incidents.general', { homeMunicipalities: ['Musterstadt'], compensationRelease: false }).expect(200);
    const incident = await post('/incidents/incidents', { alarmKeyword: 'B1', alarmedAt: T('22:00'), departmentIds: [ids.musterstadt] }).expect(201);
    const reportId = incident.body.reports[0].id;
    await setStatistics(incident.body.id);
    await save(reportId, content([{ personId: ids.max, vehicleId: ids.lf }], { times: { alarmedAt: T('22:00'), returnedAt: T('23:00') } })).expect(200);
    const refused = await post(`/incidents/reports/${reportId}/release`, { level: 'compensation' }).expect(400);
    expect(refused.body.code).toBe('incidents.compensationReleaseDisabled');
    // A draft is submitted before it is released.
    expect((await post(`/incidents/reports/${reportId}/release`, { level: 'billing' }).expect(409)).body.code).toBe('incidents.invalidTransition');
    await post(`/incidents/reports/${reportId}/submit`, {}).expect(200);
    await post(`/incidents/reports/${reportId}/release`, { level: 'billing' }).expect(200);
    await put('/core/settings/incidents.general', { homeMunicipalities: ['Musterstadt'] }).expect(200);
  });
});

describe('open reports', () => {
  it('assigns authors without locking and reminds them by e-mail', async () => {
    const paula = (await post('/masterdata/persons', { firstName: 'Paula', lastName: 'Test', email: 'paula@example.org', status: 'active', memberships: [{ departmentId: ids.ahornfeld, from: '2020-01-01', primary: true }] }).expect(201)).body.id;
    const incident = await post('/incidents/incidents', { dispatchNumber: '2026-777', alarmKeyword: 'B1', alarmedAt: T('09:00'), departmentIds: [ids.ahornfeld, ids.musterstadt] }).expect(201);
    const [ahornfeld, musterstadt] = incident.body.reports;

    const assigned = await post(`/incidents/reports/${ahornfeld.id}/author`, { authorPersonId: paula }).expect(200);
    expect(assigned.body).toMatchObject({ authorPersonId: paula, locked: false });
    await post(`/incidents/reports/${musterstadt.id}/author`, { authorPersonId: ids.max }).expect(200);
    // The group leader of Musterstadt may assign in Musterstadt only; Ahornfeld is not even visible to him.
    await post(`/incidents/reports/${musterstadt.id}/author`, { authorPersonId: ids.max }, writer).expect(200);
    await post(`/incidents/reports/${ahornfeld.id}/author`, { authorPersonId: ids.max }, writer).expect(404);

    const result = await post('/incidents/open-reports/remind', { personIds: [paula, ids.max], message: 'Bitte bis Freitag.' }).expect(200);
    expect(result.body).toEqual({ sent: ['Paula Test'], missingEmail: ['Max Test'] });
    const mail = test.app.get(MailService).sent.at(-1)!;
    expect(mail).toMatchObject({ to: 'paula@example.org', subject: 'Offene Einsatzberichte (1)' });
    expect(mail.text).toContain('2026-777');
    expect(mail.text).toContain('Bitte bis Freitag.');
    await post('/incidents/open-reports/remind', { personIds: [paula] }, writer).expect(403);

  });
});

const day = (time: string) => `2026-09-15T${time}:00+02:00`;
const valueOf = (body: { values: { question: string; column: string; value: number }[] }, key: string) => body.values.find((v) => `${v.question}:${v.column}` === key)?.value;

const draft = async (dispatchNumber: string, departmentIds: string[], cookie = admin) =>
  (await post('/incidents/incidents', { dispatchNumber, alarmKeyword: 'B1', alarmedAt: day('10:00'), location: { street: 'Lindenweg', city: 'Musterstadt', object: 'Sägewerk Kurz' }, departmentIds }, cookie).expect(201)).body;
const ready = (extra: object = {}) =>
  content([{ personId: ids.max, vehicleId: ids.lf }], { times: { alarmedAt: day('10:00'), returnedAt: day('11:30') }, ...extra });

describe('review fixes', () => {
  it('lists the incidents of a period with their departments', async () => {
    const list = await get('/core/lists/incidents.incidents?from=2026-10-01&to=2026-10-31&lang=de').expect(200);
    // One row per report; both reports of the incident start at the same time.
    const rows = (list.body.rows as { dispatchNumber: string; department: string }[]).filter((r) => r.dispatchNumber === '2026-104711');
    expect(rows.map((r) => r.department).toSorted()).toEqual(['Abteilung Ahornfeld', 'Abteilung Musterstadt']);
  });

  it('needs a department of writers and deletes the incident with its last report', async () => {
    expect((await post('/incidents/incidents', { alarmKeyword: 'B1', alarmedAt: day('09:00') }, writer).expect(400)).body.code).toBe('incidents.departmentRequired');
    const incident = await draft('2026-900001', [ids.musterstadt], writer);
    await del(`/incidents/reports/${incident.reports[0].id}`, writer).expect(204);
    await get(`/incidents/incidents/${incident.id}`).expect(404);
  });

  it('offers existing incidents of other departments and lets writers join them', async () => {
    const incident = await draft('2026-900002', [ids.musterstadt], writer);
    // Ahornfeld cannot read the incident yet, but finds it by number or by keyword and time.
    await get(`/incidents/incidents/${incident.id}`, ahornfeldWriter).expect(404);
    const byNumber = (await get(`/incidents/incidents/matches?dispatchNumber=2026-900002&alarmedAt=${encodeURIComponent(day('12:00'))}`, ahornfeldWriter).expect(200)).body;
    expect(byNumber).toEqual([expect.objectContaining({ id: incident.id, sameDispatchNumber: true, departmentIds: [ids.musterstadt], city: 'Musterstadt' })]);
    expect(byNumber[0]).not.toHaveProperty('reports');
    const byTime = (await get(`/incidents/incidents/matches?alarmKeyword=B1&alarmedAt=${encodeURIComponent(day('11:30'))}`, ahornfeldWriter).expect(200)).body;
    expect(byTime.map((m: { id: string }) => m.id)).toContain(incident.id);
    const report = await post(`/incidents/incidents/${incident.id}/reports`, { departmentId: ids.ahornfeld }, ahornfeldWriter).expect(201);
    expect(report.body).toMatchObject({ primary: false, departmentId: ids.ahornfeld });
    await get(`/incidents/incidents/${incident.id}`, ahornfeldWriter).expect(200);
  });

  it('moves the reports with the alarm time and refuses changes of released incidents', async () => {
    const incident = await draft('2026-900003', [ids.musterstadt]);
    const reportId = incident.reports[0].id;
    await put(`/incidents/incidents/${incident.id}`, { dispatchNumber: '2026-900003', alarmKeyword: 'B1', alarmedAt: day('09:45'), version: incident.version }).expect(200);
    // The unconfirmed default end moves along.
    expect((await get(`/incidents/reports/${reportId}`).expect(200)).body.times).toMatchObject({ alarmedAt: '2026-09-15T07:45:00.000Z', returnedAt: '2026-09-15T08:45:00.000Z' });
    await setStatistics(incident.id);
    const saved = (await save(reportId, ready()).expect(200)).body;
    // A primary report starting later than the incident is flagged.
    expect(rules(saved)).toEqual(['warning:incident-time-differs']);
    await save(reportId, ready({ times: { alarmedAt: day('09:45'), returnedAt: day('11:30') } })).expect(200);
    await post(`/incidents/reports/${reportId}/submit`, {}).expect(200);
    await post(`/incidents/reports/${reportId}/release`, { level: 'compensation' }).expect(200);
    const { version } = (await get(`/incidents/incidents/${incident.id}`).expect(200)).body;
    const refused = await put(`/incidents/incidents/${incident.id}`, { dispatchNumber: '2026-900003', alarmKeyword: 'B2', alarmedAt: day('09:45'), version }).expect(409);
    expect(refused.body.code).toBe('incidents.incidentReleased');
  });

  it('releases only submitted reports and unlocks drafts only back to draft', async () => {
    const incident = await draft('2026-900004', [ids.musterstadt]);
    const reportId = incident.reports[0].id;
    await save(reportId, ready()).expect(200);
    expect((await post(`/incidents/reports/${reportId}/release`, { level: 'compensation' }).expect(409)).body.code).toBe('incidents.invalidTransition');
    // Saved by the releaser, the draft is locked; unlocking it never skips the submit.
    expect((await post(`/incidents/reports/${reportId}/unlock`, { reason: 'x', toStatus: 'review' }).expect(409)).body.code).toBe('incidents.invalidTransition');
    expect((await post(`/incidents/reports/${reportId}/unlock`, { reason: 'Verfasser schreibt weiter', toStatus: 'draft' }).expect(200)).body).toMatchObject({ status: 'draft', locked: false });
  });

  it('releases several reports at once and reminds of the release for billing', async () => {
    const incident = await draft('2026-900005', [ids.musterstadt, ids.ahornfeld]);
    const [musterstadt, ahornfeld] = incident.reports;
    await setStatistics(incident.id);
    await save(musterstadt.id, ready()).expect(200);
    // Max is in the other incidents of the day as well.
    await post(`/incidents/reports/${musterstadt.id}/submit`, { acknowledgements: [{ rule: 'personnel-overlap-other', subject: ids.max, reason: 'Übung' }] }).expect(200);
    const result = await post('/incidents/reports/release', { reportIds: [musterstadt.id, ahornfeld.id], level: 'compensation' }).expect(200);
    expect(result.body).toEqual({ released: [musterstadt.id], failed: [{ reportId: ahornfeld.id, code: 'incidents.invalidTransition' }] });
    const tasks = (await get('/core/tasks?asOf=2026-10-25')).body as { kind: string; subject: { id: string } }[];
    expect(tasks.find((t) => t.subject.id === musterstadt.id)?.kind).toBe('report-billing');

    // Cost recovery only counts reports released for billing.
    const { version } = (await get(`/incidents/incidents/${incident.id}`).expect(200)).body;
    await put(`/incidents/incidents/${incident.id}/costs`, { chargeable: true, chargeableReason: '', version }).expect(400);
    await put(`/incidents/incidents/${incident.id}/costs`, { chargeable: true, chargeableReason: 'Brandmeldeanlage', version }).expect(200);
    await del(`/incidents/reports/${ahornfeld.id}`).expect(204);
    const lookup = test.app.get<IncidentsLookup>(INCIDENTS_LOOKUP);
    const find = async () => (await lookup.chargeable('2026-09-15', '2026-09-15')).find((c) => c.incidentId === incident.id);
    expect(await find()).toMatchObject({ released: false, releaseLevel: 'compensation' });
    await post(`/incidents/reports/${musterstadt.id}/release`, { level: 'billing' }).expect(200);
    expect(await find()).toMatchObject({ released: true, releaseLevel: 'billing' });

    // Releasers change the statistics of the incident after the release without releasing again.
    const before = (await get(`/incidents/incidents/${incident.id}`).expect(200)).body;
    const events: unknown[] = [];
    test.app.get(DomainEvents).subscribe(INCIDENTS_EVENTS.reportReleased, (e) => {
      events.push(e);
    });
    const changed = await put(`/incidents/incidents/${incident.id}/statistics`, { statistics: { mainType: 'fire', fireSize: 'medium', rescued: 2 }, version: before.version }).expect(200);
    expect(changed.body.statistics).toMatchObject({ fireSize: 'medium', rescued: 2 });
    expect((await get(`/incidents/reports/${musterstadt.id}`).expect(200)).body).toMatchObject({ status: 'released-billing', locked: true });
    expect(events).toEqual([]);
    await put(`/incidents/incidents/${incident.id}/statistics`, { statistics: { mainType: 'fire', fireSize: 'small-a' }, version: before.version }).expect(409);
    await put(`/incidents/incidents/${incident.id}/statistics`, { statistics: { mainType: 'fire' }, version: changed.body.version }).expect(400);
    // The writer's only report is released: the statistics are the releasers' now.
    const refused = await put(`/incidents/incidents/${incident.id}/statistics`, { statistics: { mainType: 'fire', fireSize: 'medium' }, version: changed.body.version }, writer).expect(403);
    expect(refused.body.code).toBe('incidents.statisticsSubmitted');
  });

  it('finds incidents by location and lists those without statistics', async () => {
    const incident = await draft('2026-900006', [ids.musterstadt]);
    const hits = (await get('/core/search?q=Sägewerk').expect(200)).body as { to: string }[];
    expect(hits.map((h) => h.to)).toContain(`/incidents/incidents/${incident.id}`);
    expect((await get('/core/search?q=Lindenweg Musterstadt').expect(200)).body.length).toBeGreaterThan(0);
    const without = (await get('/incidents/incidents?from=2026-09-15&to=2026-09-15&withoutStatistics=true').expect(200)).body as { id: string }[];
    expect(without.map((i) => i.id)).toContain(incident.id);
    await setStatistics(incident.id).then((r) => expect(r.status).toBe(200));
    const after = (await get('/incidents/incidents?from=2026-09-15&to=2026-09-15&withoutStatistics=true').expect(200)).body as { id: string }[];
    expect(after.map((i) => i.id)).not.toContain(incident.id);
  });

  it('prints the report as PDF', async () => {
    const response = await get(`/incidents/reports/${ids.musterstadtReport}/pdf?lang=de`).buffer(true).parse(binary()).expect(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect((response.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    await get(`/incidents/reports/${ids.ahornfeldReport}/pdf`, writer).expect(404);
  });

  it('lets department commanders return reports of their department and tells the author in his language', async () => {
    const role = (await post('/core/roles', { name: 'Abteilungskommandant Test', permissions: ['incidents.reports.read', 'incidents.reports.write', 'incidents.reports.review'] }).expect(201)).body.id;
    await post('/core/users', { username: 'ak.musterstadt', displayName: 'AK Musterstadt', password: 'auch-sehr-geheim', roles: [{ roleId: role, departmentId: ids.musterstadt }] }).expect(201);
    const commander = await test.login({ username: 'ak.musterstadt', password: 'auch-sehr-geheim' });
    const tom = (await post('/masterdata/persons', { firstName: 'Tom', lastName: 'Test', email: 'tom@example.org', status: 'active', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id;
    const self = (await post('/core/roles', { name: 'Mitglied Test', permissions: ['incidents.self'] }).expect(201)).body.id;
    await post('/core/users', { username: 'tom', displayName: 'Tom Test', password: 'auch-sehr-geheim', personId: tom, language: 'en', roles: [{ roleId: self, departmentId: ids.musterstadt }] }).expect(201);

    const incident = await draft('2026-900007', [ids.musterstadt, ids.ahornfeld]);
    const [musterstadt, ahornfeld] = incident.reports;
    await post(`/incidents/reports/${musterstadt.id}/author`, { authorPersonId: tom }).expect(200);
    await setStatistics(incident.id, statistics, writer);
    await save(musterstadt.id, ready({ authorPersonId: tom, personnel: [{ personId: tom, vehicleId: ids.lf }] }), writer).expect(200);
    await post(`/incidents/reports/${musterstadt.id}/submit`, {}, writer).expect(200);
    await post(`/incidents/reports/${musterstadt.id}/return`, { comment: 'Please add the commander' }, commander).expect(200);
    const mail = test.app.get(MailService).sent.at(-1)!;
    expect(mail).toMatchObject({ to: 'tom@example.org', subject: expect.stringContaining('Incident report returned') });
    // Not for other departments, and group leaders cannot return at all.
    await post(`/incidents/reports/${ahornfeld.id}/return`, { comment: 'x' }, commander).expect(404);
    await post(`/incidents/reports/${musterstadt.id}/submit`, {}, writer).expect(200);
    await post(`/incidents/reports/${musterstadt.id}/return`, { comment: 'x' }, writer).expect(403);
    await post(`/incidents/reports/${musterstadt.id}/return`, { comment: 'Noch einmal' }, commander).expect(200);
    const reminded = await post('/incidents/open-reports/remind', { personIds: [tom] }, commander).expect(200);
    expect(reminded.body.sent).toEqual(['Tom Test']);
    expect(test.app.get(MailService).sent.at(-1)!.subject).toBe('Open incident reports (1)');
    await post('/incidents/open-reports/remind', { personIds: [tom] }, writer).expect(403);

    // "My area": the own assignments of the year, only of the linked person.
    const me = await test.login({ username: 'tom', password: 'auch-sehr-geheim' });
    const mine = (await get('/incidents/me?year=2026', me).expect(200)).body;
    expect(mine).toMatchObject({ year: 2026, incidents: 1, hours: 1.5, assignments: [expect.objectContaining({ reportId: musterstadt.id, dispatchNumber: '2026-900007' })] });
    await get('/incidents/me', writer).expect(403);
  });

  it('keeps the values of closed annual statistics and tells when the data changed since', async () => {
    await post('/incidents/statistics/2026/close', { force: true }).expect(200);
    const fires = valueOf((await get('/incidents/statistics/2026').expect(200)).body, 'F28:D');
    // A vehicle put into service after closing is not counted in the closed statistics.
    const mtw = (await post('/masterdata/vehicles', { designation: 'TSF 2', vehicleType: 'tsf', departmentId: ids.ahornfeld }).expect(201)).body.id;
    const closed = (await get('/incidents/statistics/2026').expect(200)).body;
    expect(closed).toMatchObject({ changedSinceClose: true });
    expect(valueOf(closed, 'F28:D')).toBe(fires);
    await post('/incidents/statistics/2026/reopen', {}).expect(200);
    const reopened = (await get('/incidents/statistics/2026').expect(200)).body;
    expect(reopened.changedSinceClose).toBe(false);
    // The fires of the incidents with statistics, each once.
    expect(valueOf(reopened, 'F28:D')).toBeGreaterThan(1);
    await del(`/masterdata/vehicles/${mtw}`).expect(204);
  });

  it('offers the crew of the vehicle from the last incident of the department', async () => {
    const incident = (await post('/incidents/incidents', { dispatchNumber: '2026-900008', alarmKeyword: 'B1', alarmedAt: '2026-09-16T08:00:00+02:00', departmentIds: [ids.musterstadt] }).expect(201)).body;
    const crew = (await get(`/incidents/reports/${incident.reports[0].id}/previous-crew?vehicleId=${ids.lf}`, writer).expect(200)).body;
    expect(crew).toMatchObject({ alarmedAt: expect.stringContaining('2026-09-15'), personnel: expect.arrayContaining([{ personId: ids.max, function: null }]) });
    expect((await get(`/incidents/reports/${incident.reports[0].id}/previous-crew?vehicleId=${ids.tsf}`, writer).expect(200)).body.personnel).toEqual([]);
  });

  it('starts without compensation rates; the example rates are a template', async () => {
    expect((await get('/core/settings/incidents.general').expect(200)).body.rates).toEqual([]);
  });
});

const aug = (time: string) => `2026-08-10T${time}:00+02:00`;
/** Ready to submit; every incident of these tests at its own hour, so the crew does not overlap. */
const augReady = (hour: number, extra: object = {}) =>
  content([{ personId: ids.max, vehicleId: ids.lf }], { times: { alarmedAt: aug(`${hour}:00`), returnedAt: aug(`${hour}:45`) }, ...extra });
/** A new incident; with a counted keyword it gets its statistics, so its reports can be submitted. */
const augIncident = async (dispatchNumber: string, hour: number, departmentIds: string[], cookie = admin, extra: { alarmKeyword?: string } = {}) => {
  const created = (await post('/incidents/incidents', { dispatchNumber, alarmKeyword: 'B1', alarmedAt: aug(`${hour}:00`), location: { street: 'Mühlweg', city: 'Ahornfeld' }, departmentIds, ...extra }, cookie).expect(201)).body;
  if (created.statisticsCounted) await setStatistics(created.id).then((r) => expect(r.status).toBe(200));
  return (await get(`/incidents/incidents/${created.id}`).expect(200)).body;
};
const tasksOf = async (cookie: string, asOf = '2026-08-12') => (await get(`/core/tasks?asOf=${asOf}`, cookie).expect(200)).body as { kind: string; subject: { id: string } }[];
const auditOf = async () => (await get('/core/audit').expect(200)).body as { action: string; details: Record<string, unknown> }[];

describe('review round 2', () => {
  it('refuses saving a report without the version the client loaded', async () => {
    const incident = await augIncident('2026-950000', 10, [ids.musterstadt], writer);
    await put(`/incidents/reports/${incident.reports[0].id}`, augReady(10), writer).expect(400);
    await save(incident.reports[0].id, augReady(10), writer).expect(200);
  });

  it('keeps incident data and returns of submitted reports with the reviewers', async () => {
    const commander = await test.login({ username: 'ak.musterstadt', password: 'auch-sehr-geheim' });
    const incident = await augIncident('2026-950001', 11, [ids.musterstadt], writer);
    const reportId = incident.reports[0].id as string;
    await save(reportId, augReady(11), writer).expect(200);
    await post(`/incidents/reports/${reportId}/submit`, {}, writer).expect(200);

    // Submitted: the writer no longer changes the incident data, the releaser does.
    const current = (await get(`/incidents/incidents/${incident.id}`).expect(200)).body;
    const data = { dispatchNumber: '2026-950001', alarmKeyword: 'B1', alarmedAt: aug('11:00'), location: { street: 'Mühlweg 2', city: 'Ahornfeld' }, version: current.version };
    expect((await put(`/incidents/incidents/${incident.id}`, data, writer).expect(403)).body.code).toBe('incidents.incidentSubmitted');
    await put(`/incidents/incidents/${incident.id}`, data).expect(200);

    // Pre-reviewers get the review as their task, for their department only; group leaders do not.
    expect((await tasksOf(commander)).find((t) => t.subject.id === reportId)?.kind).toBe('report-review');
    expect((await tasksOf(writer)).some((t) => t.subject.id === reportId)).toBe(false);
    expect((await tasksOf(ahornfeldWriter)).some((t) => t.subject.id === reportId)).toBe(false);

    // Locked by a releaser: only releasers return it; with the permission to unlock the lock is lifted.
    await save(reportId, augReady(11, { cause: 'Defekt' })).expect(200);
    expect((await post(`/incidents/reports/${reportId}/return`, { comment: 'x' }, commander).expect(403)).body.code).toBe('incidents.reportLocked');
    expect((await post(`/incidents/reports/${reportId}/return`, { comment: 'Bitte Ursache prüfen' }).expect(200)).body).toMatchObject({ status: 'draft', locked: false });

    // A releaser without the permission to unlock returns the report, but his lock stays.
    const role = (await post('/core/roles', { name: 'Freigeber ohne Entsperren', permissions: [], permissionsAllDepartments: ['incidents.reports.read', 'incidents.reports.write', 'incidents.reports.release'] }).expect(201)).body.id;
    await post('/core/users', { username: 'freigeber', displayName: 'Freigeber Test', password: 'auch-sehr-geheim', roles: [{ roleId: role, departmentId: null }] }).expect(201);
    const releaser = await test.login({ username: 'freigeber', password: 'auch-sehr-geheim' });
    await post(`/incidents/reports/${reportId}/submit`, {}, writer).expect(200);
    await save(reportId, augReady(11, { cause: 'Defekt am Herd' }), releaser).expect(200);
    expect((await post(`/incidents/reports/${reportId}/return`, { comment: 'Bitte ergänzen' }, releaser).expect(200)).body).toMatchObject({ status: 'draft', locked: true });

    const audit = await auditOf();
    expect(audit.find((e) => e.action === 'incidents.report-returned')?.details).toMatchObject({ reportId, reportNumber: incident.reports[0].number, comment: 'Bitte ergänzen' });
  });

  it('stores acknowledgements only with a successful submit', async () => {
    const incident = await augIncident('2026-950002', 12, [ids.musterstadt], writer);
    const reportId = incident.reports[0].id as string;
    // No narrative (error) and Max with breathing apparatus without qualification (warning).
    await save(reportId, augReady(12, { situation: '', actions: '', personnel: [{ personId: ids.max, vehicleId: ids.lf, breathingApparatus: true }] }), writer).expect(200);
    const acknowledgements = [{ rule: 'breathing-without-qualification', subject: ids.max, reason: 'Nachweis folgt' }];
    expect((await post(`/incidents/reports/${reportId}/submit`, { acknowledgements }, writer).expect(400)).body.code).toBe('incidents.findingsOpen');
    const report = (await get(`/incidents/reports/${reportId}`, writer).expect(200)).body;
    expect(report.findings.find((f: { rule: string }) => f.rule === 'breathing-without-qualification')).toMatchObject({ acknowledged: false, reason: null });
    await save(reportId, augReady(12, { personnel: [{ personId: ids.max, vehicleId: ids.lf, breathingApparatus: true }] }), writer).expect(200);
    const submitted = (await post(`/incidents/reports/${reportId}/submit`, { acknowledgements }, writer).expect(200)).body;
    expect(submitted.findings.find((f: { rule: string }) => f.rule === 'breathing-without-qualification')).toMatchObject({ acknowledged: true, reason: 'Nachweis folgt' });
  });

  it('finds existing incidents by number regardless of case and by place regardless of keyword', async () => {
    const incident = await augIncident('2026-ABC-1', 13, [ids.musterstadt], writer);
    const at = encodeURIComponent(aug('13:30'));
    const byNumber = (await get(`/incidents/incidents/matches?dispatchNumber=2026-abc-1&alarmedAt=${at}`, ahornfeldWriter).expect(200)).body as { id: string; sameDispatchNumber: boolean; ownReports: unknown[] }[];
    expect(byNumber.find((m) => m.id === incident.id)).toMatchObject({ sameDispatchNumber: true, ownReports: [] });
    // Another keyword, but the same street within two hours.
    const byPlace = (await get(`/incidents/incidents/matches?alarmKeyword=TH1&street=m%C3%BChlweg&city=Ahornfeld&alarmedAt=${at}`, writer).expect(200)).body as { id: string; ownReports: { reportId: string }[] }[];
    // The writer of Musterstadt already has a report there: he opens it instead of joining.
    expect(byPlace.find((m) => m.id === incident.id)?.ownReports).toEqual([{ reportId: incident.reports[0].id, departmentId: ids.musterstadt }]);
    const elsewhere = (await get(`/incidents/incidents/matches?alarmKeyword=TH1&street=Kirchweg&city=Ahornfeld&alarmedAt=${at}`, writer).expect(200)).body as { id: string }[];
    expect(elsewhere.map((m) => m.id)).not.toContain(incident.id);
    // Taken numbers are recognized regardless of case as well.
    const other = await augIncident('2026-950003', 13, [ids.musterstadt], writer);
    const version = (await get(`/incidents/incidents/${other.id}`, writer).expect(200)).body.version;
    expect((await put(`/incidents/incidents/${other.id}`, { dispatchNumber: '2026-abc-1', alarmKeyword: 'B1', alarmedAt: aug('13:00'), version }, writer).expect(409)).body.code).toBe('incidents.dispatchNumberTaken');
  });

  it('makes the creator author of his own department only and offers only authors who can write', async () => {
    const erik = (await post('/masterdata/persons', { firstName: 'Erik', lastName: 'Test', status: 'active', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id;
    const role = (await post('/core/roles', { name: 'GF beide Test', permissions: ['incidents.reports.read', 'incidents.reports.write'] }).expect(201)).body.id;
    await post('/core/users', { username: 'erik', displayName: 'Erik Test', password: 'auch-sehr-geheim', personId: erik, roles: [{ roleId: role, departmentId: ids.musterstadt }, { roleId: role, departmentId: ids.ahornfeld }] }).expect(201);
    const cookie = await test.login({ username: 'erik', password: 'auch-sehr-geheim' });
    const incident = await augIncident('2026-950004', 14, [ids.ahornfeld, ids.musterstadt], cookie);
    const byDepartment = new Map((incident.reports as { departmentId: string; authorPersonId: string | null; id: string }[]).map((r) => [r.departmentId, r]));
    expect(byDepartment.get(ids.musterstadt)?.authorPersonId).toBe(erik);
    expect(byDepartment.get(ids.ahornfeld)?.authorPersonId).toBeNull();

    // Only persons with an account that may write the department's reports are offered as authors.
    const authors = (await get(`/incidents/authors?departmentId=${ids.musterstadt}`, writer).expect(200)).body as string[];
    expect(authors).toContain(erik);
    expect(authors).not.toContain(ids.max);
    await get(`/incidents/authors?departmentId=${ids.ahornfeld}`, writer).expect(403);

    // An author without an account would never see the report: the writers of the department are asked.
    const musterstadt = byDepartment.get(ids.musterstadt)!.id;
    await post(`/incidents/reports/${musterstadt}/author`, { authorPersonId: ids.max }).expect(200);
    expect((await tasksOf(writer)).find((t) => t.subject.id === musterstadt)?.kind).toBe('report-no-author');
    // With a proper author the draft is his task; once overdue the writers of the department are asked as well.
    await post(`/incidents/reports/${musterstadt}/author`, { authorPersonId: erik }).expect(200);
    expect((await tasksOf(cookie)).find((t) => t.subject.id === musterstadt)?.kind).toBe('report-open');
    expect((await tasksOf(writer)).some((t) => t.subject.id === musterstadt)).toBe(false);
    expect((await tasksOf(writer, '2026-10-25')).find((t) => t.subject.id === musterstadt)?.kind).toBe('report-overdue');
  });

  it('removes statistics and accepts them only for keywords that count', async () => {
    const incident = await augIncident('2026-950005', 15, [ids.musterstadt]);
    expect(incident.statistics).toMatchObject({ mainType: 'fire' });
    const removed = (await put(`/incidents/incidents/${incident.id}/statistics`, { statistics: null, version: incident.version }).expect(200)).body;
    expect(removed).toMatchObject({ statistics: null, statisticsSuggestion: expect.objectContaining({ mainType: 'fire' }) });
    const watch = await augIncident('2026-950006', 16, [ids.musterstadt], admin, { alarmKeyword: 'BSW' });
    expect(watch).toMatchObject({ statisticsCounted: false, statisticsSuggestion: null });
    const refused = await put(`/incidents/incidents/${watch.id}/statistics`, { statistics, version: watch.version }).expect(400);
    expect(refused.body.code).toBe('incidents.statisticsNotCounted');
  });

  it('logs releases with the report number and tells the receivers about deleted reports', async () => {
    const incident = await augIncident('2026-950007', 17, [ids.musterstadt, ids.ahornfeld]);
    const [musterstadt, ahornfeld] = incident.reports as { id: string; number: string }[];
    await save(musterstadt.id, augReady(17)).expect(200);
    await post(`/incidents/reports/${musterstadt.id}/submit`, {}).expect(200);
    await post('/incidents/reports/release', { reportIds: [musterstadt.id, ahornfeld.id], level: 'compensation' }).expect(200);
    const audit = await auditOf();
    expect(audit.find((e) => e.action === 'incidents.report-released' && e.details['reportId'] === musterstadt.id)?.details).toMatchObject({ reportNumber: musterstadt.number, level: 'compensation' });
    expect(audit.find((e) => e.action === 'incidents.reports-released')?.details).toMatchObject({ released: 1, failed: [{ reportId: ahornfeld.id, code: 'incidents.invalidTransition' }] });

    const events: ReportUnlockedEvent[] = [];
    test.app.get(DomainEvents).subscribe<ReportUnlockedEvent>(INCIDENTS_EVENTS.reportUnlocked, (e) => {
      events.push(e);
    });
    await post(`/incidents/reports/${musterstadt.id}/unlock`, { reason: 'Korrektur', toStatus: 'draft' }).expect(200);
    await del(`/incidents/reports/${ahornfeld.id}`).expect(204);
    expect(events).toEqual([
      { reportId: musterstadt.id, incidentId: incident.id, reason: 'Korrektur' },
      { reportId: ahornfeld.id, incidentId: incident.id, reason: 'deleted' },
    ]);
    expect((await auditOf()).find((e) => e.action === 'incidents.report-deleted')?.details).toMatchObject({ reportId: ahornfeld.id, reportNumber: ahornfeld.number });
  });
});

describe('reports of operational departments only', () => {
  it('refuses reports of other departments when creating an incident, adding a report and through the API', async () => {
    const veterans = (await post('/masterdata/departments', { name: 'Altersabteilung Musterstadt', shortName: 'Alters Musterstadt', type: 'veterans', parentId: ids.musterstadt }).expect(201)).body.id;
    const incident = { dispatchNumber: '2026-400001', alarmKeyword: 'B2', alarmedAt: T('09:00') };
    expect((await post('/incidents/incidents', { ...incident, departmentIds: [veterans] }).expect(400)).body).toMatchObject({ code: 'incidents.departmentNotOperational', name: 'Altersabteilung Musterstadt' });
    const created = (await post('/incidents/incidents', { ...incident, departmentIds: [ids.musterstadt] }).expect(201)).body;
    expect((await post(`/incidents/incidents/${created.id}/reports`, { departmentId: veterans }).expect(400)).body.code).toBe('incidents.departmentNotOperational');

    const token = await post('/core/tokens', { name: 'Alarmfax 2', scopes: ['incidents.api.create'] }).expect(201);
    const result = await test.http
      .post('/api/incidents/v1/incidents')
      .set({ Authorization: `Bearer ${token.body.token}` })
      .send({ dispatchNumber: '2026-400002', alarmKeyword: 'B2', alarmedAt: T('09:30'), departments: ['Musterstadt', 'Alters Musterstadt'], personnel: [] })
      .expect(200);
    expect(result.body.warnings).toEqual([{ code: 'incidents.departmentNotOperational', value: 'Alters Musterstadt' }]);
    expect(result.body.reports).toEqual([expect.objectContaining({ departmentId: ids.musterstadt })]);
  });
});

describe('statistics of the incident', () => {
  it('lets the writers of its reports and the releasers enter them, not readers', async () => {
    const role = (await post('/core/roles', { name: 'Leser Test', permissions: ['incidents.reports.read'] }).expect(201)).body.id;
    await post('/core/users', { username: 'leser', displayName: 'Leser Test', password: 'auch-sehr-geheim', roles: [{ roleId: role, departmentId: ids.musterstadt }] }).expect(201);
    const reader = await test.login({ username: 'leser', password: 'auch-sehr-geheim' });
    const incident = (await post('/incidents/incidents', { dispatchNumber: '2026-960001', alarmKeyword: 'B1', alarmedAt: '2026-07-01T10:00:00+02:00', location: { city: 'Musterstadt' }, departmentIds: [ids.musterstadt, ids.ahornfeld] }).expect(201)).body;
    const [primary, secondary] = incident.reports as { id: string }[];

    // Missing statistics are an error of the primary report only.
    expect(rules((await get(`/incidents/reports/${primary.id}`).expect(200)).body)).toContain('error:statistics-missing');
    expect(rules((await get(`/incidents/reports/${secondary.id}`).expect(200)).body)).not.toContain('error:statistics-missing');

    // Readers see them, but do not change them.
    expect((await get(`/incidents/incidents/${incident.id}`, reader).expect(200)).body.statisticsEditable).toBe(false);
    expect((await setStatistics(incident.id, statistics, reader)).status).toBe(403);
    // The writer of the secondary report, the writer of the primary report and the releaser do.
    expect((await get(`/incidents/incidents/${incident.id}`, ahornfeldWriter).expect(200)).body.statisticsEditable).toBe(true);
    expect((await setStatistics(incident.id, { mainType: 'fire', fireSize: 'small-a' }, ahornfeldWriter)).status).toBe(200);
    expect((await setStatistics(incident.id, statistics, writer)).status).toBe(200);
    const saved = await setStatistics(incident.id, { mainType: 'fire', fireSize: 'medium', rescued: 1 });
    expect(saved.status).toBe(200);
    expect(rules((await get(`/incidents/reports/${primary.id}`).expect(200)).body)).not.toContain('error:statistics-missing');

    // Optimistic version: a stale version is refused.
    expect((await put(`/incidents/incidents/${incident.id}/statistics`, { statistics, version: saved.body.version - 1 }, writer).expect(409)).body.code).toBe('conflict.stale');
    // Audit and history of the incident.
    expect((await auditOf()).find((e) => e.action === 'incidents.statistics-changed' && e.details['incidentId'] === incident.id)?.details).toMatchObject({ dispatchNumber: '2026-960001', removed: false });
    const history = (await get(`/core/history/incidents.incident/${incident.id}`).expect(200)).body as { entity: string }[];
    expect(history.length).toBeGreaterThan(1);
  });

  it('counts each incident once with its statistics in the annual statistics', async () => {
    const at = '2027-03-01T10:00:00+01:00';
    const joint = (await post('/incidents/incidents', { dispatchNumber: '2027-000001', alarmKeyword: 'B1', alarmedAt: at, location: { city: 'Musterstadt' }, departmentIds: [ids.musterstadt, ids.ahornfeld] }).expect(201)).body;
    await setStatistics(joint.id, { mainType: 'fire', fireSize: 'small-a', rescued: 2 });
    const overland = (await post('/incidents/incidents', { dispatchNumber: '2027-000002', alarmKeyword: 'TH1', alarmedAt: at, location: { city: 'Ehingen' }, departmentIds: [ids.musterstadt] }).expect(201)).body;
    await setStatistics(overland.id, { mainType: 'technical-assistance', technicalCategory: 'other', ownMunicipality: false });
    await post('/incidents/incidents', { dispatchNumber: '2027-000003', alarmKeyword: 'B1', alarmedAt: at, departmentIds: [ids.musterstadt] }).expect(201);

    const year = (await get('/incidents/statistics/2027').expect(200)).body;
    expect(valueOf(year, 'F28:D')).toBe(1);
    expect(valueOf(year, 'F29:D')).toBe(1);
    expect(valueOf(year, 'F55:D')).toBe(2);
    expect(valueOf(year, 'F34:D')).toBe(1);
    expect(year.checks.find((c: { code: string }) => c.code === 'statistics.incidentsWithoutStatistics')).toMatchObject({ ok: false, params: { count: 1 } });
    const without = (await get('/incidents/incidents?from=2027-03-01&to=2027-03-01&withoutStatistics=true').expect(200)).body as { dispatchNumber: string }[];
    expect(without.map((i) => i.dispatchNumber)).toEqual(['2027-000003']);
  });
});
