import { EntityManager } from '@mikro-orm/core';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DomainEvents, MailService } from '@forga/core-api';
import { INCIDENTS_EVENTS, type ReportReleasedEvent } from '@forga/incidents-contracts';
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

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/incidents/keywords/templates/bw', {}).expect(201);
  await put('/core/settings/incidents.general', { homeMunicipalities: ['Musterstadt'] }).expect(200);

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
    await post('/respiratory-protection/evidence', { personId: ids.jonas, kind, date: '2026-01-15', kilojoules: kind === 'stress-exercise' ? 90 : null, passed: kind === 'stress-exercise' ? true : null }).expect(201);
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
    expect(rules(report.body)).toEqual(['error:report-empty', 'error:statistics-missing', 'error:no-personnel']);
    // Only writers of the primary report change the incident data.
    const data = { dispatchNumber: '2026-104711', alarmKeyword: 'B3', alarmedAt: T('13:05') };
    expect((await put(`/incidents/incidents/${ids.incident}`, data, ahornfeldWriter).expect(403)).body.code).toBe('incidents.notPrimaryWriter');
    await put(`/incidents/incidents/${ids.incident}`, { ...data, alarmKeyword: 'B2' }, writer).expect(200);
    expect(report.body.statisticsSuggestion).toEqual({ ownMunicipality: true, mainType: 'fire', technicalCategory: null, falseAlarmType: null });
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
    const musterstadt = await put(`/incidents/reports/${ids.musterstadtReport}`, content(
      [
        { personId: ids.jonas, vehicleId: ids.lf, function: 'attack-team', breathingApparatus: true, breathingMinutes: 28 },
        { personId: ids.max, vehicleId: ids.lf, breathingApparatus: true },
        { guestName: 'Kamerad Nachbarwehr', vehicleId: ids.lf },
      ],
      { statistics },
    ), writer).expect(200);
    expect(musterstadt.body.personnel[0].compensation).toEqual({ hours: 3, rate: 15, allowances: 0, amount: 45, overridden: false });
    expect(musterstadt.body.personnel[2].compensation.amount).toBe(0);
    expect(musterstadt.body.compensationTotal).toBe(90);
    expect(rules(musterstadt.body)).toEqual(['warning:breathing-without-qualification']);

    // The group leader of Musterstadt cannot even see the report of Ahornfeld.
    await put(`/incidents/reports/${ids.ahornfeldReport}`, content([{ personId: ids.lena, standbyStationId: ids.station }]), writer).expect(404);

    const ahornfeld = await put(`/incidents/reports/${ids.ahornfeldReport}`, content([
      { personId: ids.lena, standbyStationId: ids.station },
      { personId: ids.jonas, vehicleId: ids.tsf, from: T('15:00'), to: T('16:30') },
    ])).expect(200);
    expect(ahornfeld.body.personnel[0].compensation).toMatchObject({ hours: 1, amount: 15 });
    expect(rules(ahornfeld.body)).toEqual(['error:personnel-overlap-incident']);
    // Secondary reports carry no statistics.
    const withStatistics = await put(`/incidents/reports/${ids.ahornfeldReport}`, content([{ personId: ids.lena, standbyStationId: ids.station }], { statistics })).expect(200);
    expect(rules(withStatistics.body)).toEqual(['error:statistics-not-allowed']);
    await put(`/incidents/reports/${ids.ahornfeldReport}`, content([{ personId: ids.lena, standbyStationId: ids.station }])).expect(200);
  });

  it('computes with the incident rates of the compensation statute', async () => {
    const before = (await get('/core/settings/compensation.general').expect(200)).body ?? {};
    await put('/core/settings/compensation.general', { ...before, incidentRates: [{ kind: 'incident', validFrom: '2026-01-01', amount: 20 }], incidentRounding: 'exact-minutes' }).expect(200);
    const report = await put(`/incidents/reports/${ids.ahornfeldReport}`, content([{ personId: ids.jonas, vehicleId: ids.tsf, from: T('15:00'), to: T('16:30') }])).expect(200);
    expect(report.body.personnel[0].compensation).toMatchObject({ hours: 1.5, rate: 20, amount: 30 });
    await put('/core/settings/compensation.general', before).expect(200);
    await put(`/incidents/reports/${ids.ahornfeldReport}`, content([{ personId: ids.lena, standbyStationId: ids.station }])).expect(200);
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
    await put(`/incidents/reports/${ids.musterstadtReport}`, content([{ personId: ids.jonas, vehicleId: ids.lf }], { statistics }), writer).expect(403);
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

    const locked = await put(`/incidents/reports/${ids.musterstadtReport}`, content([]), writer).expect(403);
    expect(locked.body.code).toBe('incidents.reportLocked');
    await post(`/incidents/reports/${ids.musterstadtReport}/release`, { level: 'compensation' }).expect(409);

    const unlocked = await post(`/incidents/reports/${ids.musterstadtReport}/unlock`, { reason: 'Personal korrigieren' }).expect(200);
    expect(unlocked.body).toMatchObject({ status: 'review', locked: false });
    const audit = (await get('/core/audit')).body as { action: string; details: { reason?: string } }[];
    expect(audit.find((e) => e.action === 'incidents.report-unlocked')?.details.reason).toBe('Personal korrigieren');
  });

  it('switches the primary report and moves the statistics', async () => {
    const ahornfeld = await post(`/incidents/reports/${ids.ahornfeldReport}/primary`, {}).expect(200);
    expect(ahornfeld.body).toMatchObject({ primary: true, statistics: expect.objectContaining({ mainType: 'fire', fireSize: 'small-b' }) });
    const musterstadt = await get(`/incidents/reports/${ids.musterstadtReport}`).expect(200);
    expect(musterstadt.body).toMatchObject({ primary: false, statistics: null });
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
    expect(tasks.map((t) => t.kind)).toEqual(expect.arrayContaining(['report-review', 'report-open']));
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
    expect(report.body.statisticsSuggestion).toMatchObject({ ownMunicipality: false, mainType: 'technical-assistance', technicalCategory: 'rescue-persons' });

    const second = await test.http.post('/api/incidents/v1/incidents').set(bearer).send(payload).expect(200);
    expect(second.body).toMatchObject({ created: false, reports: [{ created: false, updated: false }] });

    // Once a person edited the report, the API leaves it alone.
    await put(`/incidents/reports/${first.body.reports[0].id}`, content([])).expect(200);
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
    expect(workbook.worksheets.map((w) => w.name)).toEqual(['Betrag pro Person', 'Summe je Abteilung', 'Einsätze', 'Sonderdienste', 'Hinweise', 'Überschneidungen']);
    const perPerson = workbook.getWorksheet('Betrag pro Person')!;
    const total = perPerson.getRow(perPerson.rowCount);
    expect(total.getCell(2).value).toBe('GESAMT');
    expect(total.getCell(6).value).toBe(105);
    const notes = workbook.getWorksheet('Hinweise')!;
    expect(notes.getRow(4).getCell(1).value).toBe('Bericht nicht freigegeben (fehlt in der Auszahlung)');

    await get('/incidents/compensation/export?from=2026-10-01&to=2026-10-31', writer).expect(403);
  });
});

describe('duty roster', () => {
  it('imports duty officer weeks from an iCal file and pays them per full day', async () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'UID:evd-45@kalender',
      'SUMMARY:EvD Jonas Test',
      'DTSTART;VALUE=DATE:20261102',
      'DTEND;VALUE=DATE:20261109',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:evd-46@kalender',
      'SUMMARY:EvD Unbekannt',
      'DTSTART;VALUE=DATE:20261109',
      'DTEND;VALUE=DATE:20261116',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    const upload = await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(ics), 'evd.ics').expect(201);
    const mapping = upload.body.suggestions['incidents.duty-roster'];
    expect(mapping).toEqual({ uid: 'UID', title: 'SUMMARY', from: 'DTSTART', to: 'DTEND', notes: 'DESCRIPTION' });
    const applied = await post(`/core/imports/${upload.body.id}/apply`, { profile: 'incidents.duty-roster', mapping }).expect(200);
    expect(applied.body.counts).toEqual({ create: 1, update: 0, unchanged: 0, error: 1 });
    expect(applied.body.rows[1].messages[0].code).toBe('incidents.duty.unknownPerson');

    const duties = await get('/incidents/duty?from=2026-11-01&to=2026-11-30').expect(200);
    expect(duties.body).toEqual([
      expect.objectContaining({ personId: ids.jonas, kind: 'duty-officer', from: '2026-11-01T23:00:00.000Z', days: 7, rate: 10, amount: 70 }),
    ]);

    // Importing the calendar again updates by event UID instead of duplicating.
    const again = await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(ics), 'evd.ics').expect(201);
    const second = await post(`/core/imports/${again.body.id}/apply`, { profile: 'incidents.duty-roster', mapping }).expect(200);
    expect(second.body.counts).toMatchObject({ create: 0, unchanged: 1 });

    const response = await get('/incidents/compensation/export?from=2026-11-01&to=2026-11-30&lang=de').buffer(true).parse(binary()).expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body as ArrayBuffer);
    const duty = workbook.getWorksheet('Sonderdienste')!;
    expect(duty.getRow(4).values).toEqual(expect.arrayContaining(['Test, Jonas', 'Einsatzleiter vom Dienst (EvD)', 7, 10, 70]));
    const perPerson = workbook.getWorksheet('Betrag pro Person')!;
    expect(perPerson.getRow(perPerson.rowCount).getCell(6).value).toBe(70);

    await get('/incidents/duty', writer).expect(403);
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

describe('MP-Feuer import', () => {
  const header = 'Pers.-Nr.;Name;von;bis;BE;AS;V-A;Fzg.-Nr.;Bezeichnung;Einsatz-Nr.;Beginn;Ende;Alarmstichwort;Leitstellen-Nr.;Lage;Verlauf;Bericht;bei Ges. Stat. anzeigen;Zusatzfeld 2;Bezeichnung;Aufgabe;Statistik;Eins.-Art;Pers.-Rettung';
  const rows = [
    ';Test Jonas;21.10.2025 13:05;21.10.2025 15:50;Nein;Ja;Nein;1;LF 20/16;17;21.10.2025 13:05;21.10.2025 15:50;B3-MP;2025-555;Rauch aus Dach;Löschmaßnahmen;Brand im Dachstuhl gelöscht;Ja;zur Abrechnung freigegeben;Abt. Musterstadt;Fahrer;#L Mittelbrände;Gebäudebrand;1',
    '9001;Test Max;21.10.2025 13:05;21.10.2025 15:50;Nein;Nein;Ja;1;LF 20/16;17;21.10.2025 13:05;21.10.2025 15:50;B3-MP;2025-555;Rauch aus Dach;Löschmaßnahmen;Brand im Dachstuhl gelöscht;Ja;zur Abrechnung freigegeben;Abt. Musterstadt;Maschinist;#L Mittelbrände;Gebäudebrand;1',
    ';Test Lena;21.10.2025 13:30;21.10.2025 15:00;Ja;Nein;Nein;;;4;21.10.2025 13:30;21.10.2025 15:00;B3-MP;2025-555;;;Nachgefordert;Nein;;Abt. Ahornfeld;;;;',
    ';Person Unbekannt;21.10.2025 13:30;21.10.2025 15:00;Nein;Nein;Nein;;;4;21.10.2025 13:30;21.10.2025 15:00;B3-MP;2025-555;;;Nachgefordert;Nein;;Abt. Ahornfeld;;;;',
  ];
  const csv = [header, ...rows].join('\r\n');

  const run = async (apply: boolean) => {
    const upload = await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(csv), 'MP-EXCEL.csv').expect(201);
    const mapping = upload.body.suggestions['incidents.mp-feuer'];
    return post(`/core/imports/${upload.body.id}/${apply ? 'apply' : 'preview'}`, { profile: 'incidents.mp-feuer', mapping }).expect(200);
  };

  it('maps the duplicate "Bezeichnung" columns to vehicle and department', async () => {
    const upload = await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(csv), 'MP-EXCEL.csv').expect(201);
    expect(upload.body.suggestions['incidents.mp-feuer']).toMatchObject({ vehicle: 'Bezeichnung', department: 'Bezeichnung (2)', personName: 'Name', status: 'Zusatzfeld 2' });
  });

  it('creates incident, reports and personnel and is repeatable', async () => {
    // The preview creates nothing, not even incidents or keywords that the run would flush in between.
    const preview = await run(false);
    expect(preview.body.counts).toEqual({ create: 3, update: 0, unchanged: 0, error: 1 });
    expect((await get('/incidents/incidents?from=2025-10-21&to=2025-10-21')).body).toHaveLength(0);

    const result = await run(true);
    expect(result.body.counts).toEqual({ create: 3, update: 0, unchanged: 0, error: 1 });
    expect(result.body.rows[3].messages[0]).toMatchObject({ code: 'incidents.import.unknownPerson', params: { name: 'Person Unbekannt' } });
    expect(result.body.rows[0].messages).toEqual([{ code: 'incidents.import.unknownFunction', params: { value: 'Fahrer' } }]);

    const incidents = (await get('/incidents/incidents?from=2025-10-21&to=2025-10-21')).body as { id: string; dispatchNumber: string; createdVia: string; reports: { id: string; departmentId: string; primary: boolean; status: string; locked: boolean }[] }[];
    expect(incidents).toHaveLength(1);
    const [incident] = incidents;
    expect(incident).toMatchObject({ dispatchNumber: '2025-555', createdVia: 'import' });
    const musterstadt = incident.reports.find((r) => r.departmentId === ids.musterstadt)!;
    const ahornfeld = incident.reports.find((r) => r.departmentId === ids.ahornfeld)!;
    expect(musterstadt).toMatchObject({ primary: true, status: 'released-billing', locked: true });
    expect(ahornfeld).toMatchObject({ primary: false, status: 'draft', locked: false });

    const report = (await get(`/incidents/reports/${musterstadt.id}`)).body;
    expect(report.times).toMatchObject({ alarmedAt: '2025-10-21T11:05:00.000Z', returnedAt: '2025-10-21T13:50:00.000Z' });
    // Picklist "Verlauf" and free text "Bericht" together; statistics key and counts of MP-Feuer.
    expect(report).toMatchObject({ situation: 'Rauch aus Dach', actions: 'Löschmaßnahmen\n\nBrand im Dachstuhl gelöscht' });
    expect(report.statistics).toMatchObject({ mainType: 'fire', fireSize: 'medium', rescued: 1, ownMunicipality: true });
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
    await put(`/incidents/reports/${ahornfeld.id}`, content([{ personId: ids.lena, standbyStationId: ids.station }])).expect(200);
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
    // Primary reports: B2 incident (statistics moved to Ahornfeld, fire small B), internal BSW incident without statistics.
    expect(value('F28:D')).toBe(1);
    expect(value('F30:D')).toBe(1);
    const check = (code: string) => preview.body.checks.find((c: { code: string }) => c.code === code);
    expect(check('statistics.fireSizes').ok).toBe(true);
    expect(check('statistics.unreleasedPrimaryReports')).toMatchObject({ ok: false });

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

    await post('/incidents/statistics/2026/close', {}).expect(200);
    await put('/incidents/statistics/2026/corrections', { corrections: { 'F1:D': 1 } }).expect(409);
    await get('/incidents/statistics/2026', writer).expect(403);
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
    await put(`/incidents/reports/${reportId}`, content([{ personId: ids.jonas, vehicleId: ids.lf }], { times: { alarmedAt: T('09:00'), returnedAt: T('10:00') } }), writer).expect(200);
    // Auto-save of the same user within minutes updates the latest revision.
    await put(`/incidents/reports/${reportId}`, content([{ personId: ids.jonas, vehicleId: ids.lf }, { personId: ids.max, vehicleId: ids.lf }], { times: { alarmedAt: T('09:00'), returnedAt: T('10:00') } }), writer).expect(200);

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
    await put(`/incidents/reports/${old.body.reports[0].id}`, content([{ personId: ids.max, vehicleId: ids.lf }], {
      times: { alarmedAt: '2025-12-31T10:00:00+01:00', returnedAt: '2025-12-31T11:00:00+01:00' },
      statistics,
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
    await put(`/incidents/reports/${reportId}`, content([{ personId: ids.max, vehicleId: ids.lf }], { times: { alarmedAt: T('22:00'), returnedAt: T('23:00') }, statistics })).expect(200);
    const refused = await post(`/incidents/reports/${reportId}/release`, { level: 'compensation' }).expect(400);
    expect(refused.body.code).toBe('incidents.compensationReleaseDisabled');
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
