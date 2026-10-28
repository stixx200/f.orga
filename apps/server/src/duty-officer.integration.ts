import { EntityManager } from '@mikro-orm/core';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_STATUTE } from '@forga/compensation-contracts';
import { DomainEvents } from '@forga/core-api';
import { BW_TEMPLATE } from '@forga/cost-recovery-contracts';
import { DUTY_KIND_TEMPLATE } from '@forga/duty-officer-contracts';
import { type IncidentCreatedEvent, INCIDENTS_EVENTS } from '@forga/incidents-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
/** Duty officer (role template `duty-officer`), linked to Jonas. */
let officer: string;
/** Group leader writing the reports of Musterstadt. */
let writer: string;
const ids: Record<string, string> = {};
const T = (time: string, day = 21) => `2026-10-${day}T${time}:00+02:00`;

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const del = (path: string, cookie = admin) => test.http.delete(`/api${path}`).set('Cookie', cookie).set(UI);

type ReportSummary = { id: string; departmentId: string | null; unit: string | null; number: string; primary: boolean; status: string; authorPersonId: string | null };
const evdOf = (incident: { reports: ReportSummary[] }) => incident.reports.find((r) => r.unit === 'duty-officer');
const incident = async (dispatchNumber: string, extra: object = {}, cookie = admin) =>
  (await post('/incidents/incidents', { dispatchNumber, alarmKeyword: 'B2', alarmedAt: T('13:05'), departmentIds: [ids.musterstadt], ...extra }, cookie).expect(201)).body as { id: string; reports: ReportSummary[] };

/** Saves the content of a report with the stored version. */
const save = async (reportId: string, body: object, cookie = admin) => {
  const current = (await get(`/incidents/reports/${reportId}`, cookie).expect(200)).body;
  return put(`/incidents/reports/${reportId}`, { version: current.version, ...body }, cookie);
};
/** Submits a report, acknowledging its warnings (e.g. the overlap with the other test incidents at the same time). */
async function submit(reportId: string, cookie = admin): Promise<void> {
  const report = (await get(`/incidents/reports/${reportId}`, cookie).expect(200)).body as { findings: { rule: string; level: string; subject: string | null; acknowledged: boolean }[] };
  const acknowledgements = report.findings.filter((f) => f.level === 'warning' && !f.acknowledged).map((f) => ({ rule: f.rule, subject: f.subject, reason: 'Test' }));
  await post(`/incidents/reports/${reportId}/submit`, { acknowledgements }, cookie).expect(200);
}
/** Submits a report and releases it for billing. */
async function releaseForBilling(reportId: string): Promise<void> {
  await submit(reportId);
  await post(`/incidents/reports/${reportId}/release`, { level: 'billing' }).expect(200);
}

const ics = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:evd-43@kalender',
  'SUMMARY:EvD Jonas Test',
  'DTSTART;VALUE=DATE:20261019',
  'DTEND;VALUE=DATE:20261026',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:evd-44@kalender',
  'SUMMARY:EvD Unbekannt',
  'DTSTART;VALUE=DATE:20261026',
  'DTEND;VALUE=DATE:20261102',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/incidents/keywords/templates/bw', {}).expect(201);
  await put('/core/settings/compensation.general', SAMPLE_STATUTE).expect(200);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
  ids.lf = (await post('/masterdata/vehicles', { designation: 'LF 20', vehicleType: 'lf-20', departmentId: ids.musterstadt }).expect(201)).body.id;
  ids.elw = (await post('/masterdata/vehicles', { designation: 'ELW 1', vehicleType: 'elw-1', departmentId: ids.ahornfeld }).expect(201)).body.id;
  const person = async (firstName: string, departmentId: string) =>
    (await post('/masterdata/persons', { firstName, lastName: 'Test', status: 'active', memberships: [{ departmentId, from: '2020-01-01', primary: true }] }).expect(201)).body.id as string;
  ids.jonas = await person('Jonas', ids.musterstadt);
  ids.max = await person('Max', ids.musterstadt);
  ids.lena = await person('Lena', ids.ahornfeld);

  const roles = (await get('/core/roles').expect(200)).body as { id: string; templateKey: string | null }[];
  const dutyOfficerRole = roles.find((r) => r.templateKey === 'duty-officer')!.id;
  await post('/core/users', { username: 'evd', displayName: 'EvD Jonas', password: 'auch-sehr-geheim', personId: ids.jonas, roles: [{ roleId: dutyOfficerRole, departmentId: null }] }).then((r) => { if (r.status !== 201) console.log('USER', r.body); });
  officer = await test.login({ username: 'evd', password: 'auch-sehr-geheim' });
  const gf = await post('/core/roles', { name: 'GF Test', permissions: ['incidents.reports.read', 'incidents.reports.write'] }).expect(201);
  await post('/core/users', { username: 'gf.musterstadt', displayName: 'GF Musterstadt', password: 'auch-sehr-geheim', personId: ids.max, roles: [{ roleId: gf.body.id, departmentId: ids.musterstadt }] }).expect(201);
  writer = await test.login({ username: 'gf.musterstadt', password: 'auch-sehr-geheim' });
});

afterAll(() => test?.app.close());

describe('duty roster', () => {
  it('starts without duty kinds; the template has to be taken over', async () => {
    expect((await get('/core/settings/duty-officer.general').expect(200)).body).toEqual({ reportRequired: true, dutyKinds: [] });
    expect((await post('/duty-officer/roster', { personId: ids.jonas, kind: 'duty-officer', from: T('00:00', 19), to: T('00:00', 20) }).expect(400)).body.code).toBe('duty-officer.unknownKind');
    await put('/core/settings/duty-officer.general', { reportRequired: true, dutyKinds: DUTY_KIND_TEMPLATE }).expect(200);
  });

  it('imports duty officer weeks from an iCal file, pays them per full day and lists them in the compensation export', async () => {
    const upload = await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(ics), 'evd.ics').expect(201);
    const mapping = upload.body.suggestions['duty-officer.roster'];
    expect(mapping).toEqual({ uid: 'UID', title: 'SUMMARY', from: 'DTSTART', to: 'DTEND', notes: 'DESCRIPTION' });
    const applied = await post(`/core/imports/${upload.body.id}/apply`, { profile: 'duty-officer.roster', mapping }).expect(200);
    expect(applied.body.counts).toEqual({ create: 1, update: 0, unchanged: 0, error: 1 });
    expect(applied.body.rows[1].messages[0].code).toBe('duty-officer.unknownPerson');

    const duties = (await get('/duty-officer/roster?from=2026-10-01&to=2026-10-31').expect(200)).body;
    expect(duties).toEqual([expect.objectContaining({ personId: ids.jonas, kind: 'duty-officer', from: '2026-10-18T22:00:00.000Z', days: 7, rate: 10, amount: 70 })]);
    ids.duty = duties[0].id;
    // Importing again updates by event UID instead of duplicating.
    const again = await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(ics), 'evd.ics').expect(201);
    expect((await post(`/core/imports/${again.body.id}/apply`, { profile: 'duty-officer.roster', mapping }).expect(200)).body.counts).toMatchObject({ create: 0, unchanged: 1 });

    // The compensation module pays the flat rate per duty day (event `duty-officer.duty.changed`).
    const items = (await get(`/compensation/persons/${ids.jonas}/items?year=2026`).expect(200)).body as { source: string; label: string; amount: number }[];
    expect(items.filter((i) => i.source === 'duty')).toEqual([expect.objectContaining({ label: 'Einsatzleiter vom Dienst (EvD) (7 Tage)', amount: 70 })]);

    const response = await get('/incidents/compensation/export?from=2026-10-01&to=2026-10-31&lang=de').buffer(true).parse(binary()).expect(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body as ArrayBuffer);
    expect(workbook.getWorksheet('Sonderdienste')!.getRow(4).values).toEqual(expect.arrayContaining(['Test, Jonas', 'Einsatzleiter vom Dienst (EvD)', 7, 10, 70]));

    // The duty officers read the roster; group leaders do not, and only the managers change it.
    expect((await get('/duty-officer/roster', officer).expect(200)).body).toHaveLength(1);
    await get('/duty-officer/roster', writer).expect(403);
    await post('/duty-officer/roster', { personId: ids.jonas, kind: 'duty-officer', from: T('00:00', 27), to: T('00:00', 28) }, officer).expect(403);
  });
});

describe('EvD reports', () => {
  it('adds the EvD report to every new incident, written by the duty officer on duty', async () => {
    const created = await incident('2026-300001', {}, writer);
    expect(created.reports).toHaveLength(2);
    const department = created.reports.find((r) => r.departmentId === ids.musterstadt)!;
    const evd = evdOf(created)!;
    expect(department).toMatchObject({ primary: true, unit: null, number: '2026-001', authorPersonId: ids.max });
    expect(evd).toMatchObject({ departmentId: null, unit: 'duty-officer', primary: false, number: 'EvD-2026-001', status: 'draft', authorPersonId: ids.jonas });
    ids.incident = created.id;
    ids.department = department.id;
    ids.evd = evd.id;

    const report = (await get(`/incidents/reports/${evd.id}`, officer).expect(200)).body;
    expect(report.personnel).toEqual([expect.objectContaining({ personId: ids.jonas, vehicleId: null, function: 'duty-officer' })]);
    // No vehicle needed and no membership check: the duty officer leads the incidents of every department.
    expect(report.findings.map((f: { rule: string }) => f.rule)).toEqual(['report-empty', 'end-unconfirmed']);
    expect((await get(`/duty-officer/incidents/${created.id}`, officer).expect(200)).body).toMatchObject({
      reportRequired: true, expected: true, missing: false, onDuty: [ids.jonas], exemption: null, report: { id: evd.id, number: 'EvD-2026-001', status: 'draft' },
    });
    // Offered as authors: those who may write EvD reports.
    expect((await get('/incidents/authors?unit=duty-officer', officer).expect(200)).body).toEqual(expect.arrayContaining([ids.jonas]));
  });

  it('lets the duty officer write the EvD report, but not the department writers', async () => {
    const content = { times: { alarmedAt: T('13:05'), returnedAt: T('14:30') }, situation: 'Rauch aus Dachstuhl', actions: 'Einsatzleitung, Lagemeldung an ILS', personnel: [{ personId: ids.jonas, vehicleId: ids.elw, function: 'duty-officer' }] };
    // Group leaders of a department neither read nor write it.
    await get(`/incidents/reports/${ids.evd}`, writer).expect(404);
    await put(`/incidents/reports/${ids.evd}`, { ...content, version: 1 }, writer).expect(404);
    expect((await save(ids.evd, content, officer)).status).toBe(200);
    expect((await get(`/incidents/reports/${ids.evd}`, officer).expect(200)).body).toMatchObject({ situation: 'Rauch aus Dachstuhl', vehicles: [expect.objectContaining({ vehicleId: ids.elw })] });
    // The duty officer reads the department report, but does not write it.
    expect((await save(ids.department, content, officer)).status).toBe(403);
    // Unit reports are not primary next to a department report and not deleted like department reports.
    expect((await post(`/incidents/reports/${ids.evd}/primary`, {}).expect(400)).body.code).toBe('incidents.unitReportNotPrimary');
    expect((await del(`/incidents/reports/${ids.evd}`).expect(409)).body.code).toBe('incidents.unitReportManaged');
    await post(`/incidents/reports/${ids.evd}/submit`, {}, officer).expect(200);
    // Releasers release it like every report.
    await post(`/incidents/reports/${ids.evd}/release`, { level: 'compensation' }, officer).expect(403);
    await post(`/incidents/reports/${ids.evd}/release`, { level: 'compensation' }).expect(200);
  });

  it('pays the incident hours of the EvD report to the department of the person, unless the statute says otherwise', async () => {
    const items = async () =>
      ((await get(`/compensation/persons/${ids.jonas}/items?year=2026`).expect(200)).body as { source: string; sourceId: string; kind: string; departmentId: string; amount: number }[]).filter(
        (i) => i.source === 'incident' && i.sourceId === ids.evd,
      );
    // 13:05–14:30 → 2 started hours × 15 €.
    expect(await items()).toEqual([expect.objectContaining({ kind: 'compensation', departmentId: ids.musterstadt, amount: 30 })]);
    const statute = (await get('/core/settings/compensation.general').expect(200)).body;
    await put('/core/settings/compensation.general', { ...statute, dutyOfficerReportPaid: false }).expect(200);
    await post('/incidents/reports/republish', { from: '2026-10-21', to: '2026-10-21' }).expect(200);
    expect(await items()).toEqual([]);
    await put('/core/settings/compensation.general', { ...statute, dutyOfficerReportPaid: true }).expect(200);
    await post('/incidents/reports/republish', { from: '2026-10-21', to: '2026-10-21' }).expect(200);
    expect(await items()).toHaveLength(1);
  });

  it('names the EvD report in lists of the incident reports', async () => {
    const list = (await get('/core/lists/incidents.incidents?from=2026-10-21&to=2026-10-21').expect(200)).body as { rows: { department: string; primary: boolean }[] };
    expect(list.rows.map((r) => r.department)).toEqual(expect.arrayContaining(['Abteilung Musterstadt', 'EvD']));
    const assignments = (await get(`/incidents/persons/${ids.jonas}/assignments?year=2026`, officer).expect(200)).body;
    expect(assignments).toEqual([expect.objectContaining({ reportId: ids.evd, department: 'EvD' })]);
  });

  it('switches the EvD report off per incident and back on', async () => {
    const created = await incident('2026-300002');
    const evd = evdOf(created)!;
    // Only the managers of the EvD reports decide that an incident had no duty officer.
    await post(`/duty-officer/incidents/${created.id}/exemption`, { reason: 'EvD nicht alarmiert' }, officer).expect(403);
    const exempted = (await post(`/duty-officer/incidents/${created.id}/exemption`, { reason: 'EvD nicht alarmiert' }).expect(200)).body;
    expect(exempted).toMatchObject({ expected: false, missing: false, report: null, exemption: { reason: 'EvD nicht alarmiert', by: 'Admin' } });
    await get(`/incidents/reports/${evd.id}`).expect(404);
    expect(evdOf((await get(`/incidents/incidents/${created.id}`).expect(200)).body)).toBeUndefined();
    // The incident is not created again by a repeated event.
    await test.app.get(DomainEvents).publish<IncidentCreatedEvent>(INCIDENTS_EVENTS.incidentCreated, { incidentId: created.id, dispatchNumber: '2026-300002', alarmKeyword: 'B2', alarmedAt: T('13:05'), createdVia: 'ui' });
    expect(evdOf((await get(`/incidents/incidents/${created.id}`).expect(200)).body)).toBeUndefined();

    const restored = (await post(`/duty-officer/incidents/${created.id}/report`, {}).expect(200)).body;
    expect(restored).toMatchObject({ expected: true, missing: false, exemption: null, report: { status: 'draft', authorPersonId: ids.jonas } });
    // The number of the deleted draft is free again.
    expect(restored.report.number).toBe('EvD-2026-002');

    // A submitted EvD report is not deleted by an exemption.
    expect((await save(restored.report.id, { times: { alarmedAt: T('13:05'), returnedAt: T('14:00') }, situation: 'Lage', actions: 'Leitung', personnel: [{ personId: ids.jonas }] }, officer)).status).toBe(200);
    await submit(restored.report.id, officer);
    expect((await post(`/duty-officer/incidents/${created.id}/exemption`, { reason: 'Doch nicht' }).expect(409)).body.code).toBe('incidents.unitReportNotDraft');
  });

  it('reports an expected EvD report that is missing as a task of the managers', async () => {
    const created = await incident('2026-300003');
    await test.app.get(EntityManager).getConnection().execute(`delete from "incidents"."report" where "id" = ?`, [evdOf(created)!.id]);
    expect((await get(`/duty-officer/incidents/${created.id}`).expect(200)).body).toMatchObject({ expected: true, missing: true, report: null });
    const tasks = (await get('/core/tasks?asOf=2026-10-28&all=true').expect(200)).body as { module: string; kind: string; to?: string }[];
    expect(tasks).toEqual(expect.arrayContaining([expect.objectContaining({ module: 'duty-officer', kind: 'evd-report-missing', to: `/incidents/incidents/${created.id}` })]));
    await post(`/duty-officer/incidents/${created.id}/report`, {}).expect(200);
    const after = (await get('/core/tasks?asOf=2026-10-28&all=true').expect(200)).body as { kind: string }[];
    expect(after.some((t) => t.kind === 'evd-report-missing')).toBe(false);
  });

  it('creates no EvD report for imported incidents and while the setting is off', async () => {
    await put('/core/settings/duty-officer.general', { reportRequired: false, dutyKinds: DUTY_KIND_TEMPLATE }).expect(200);
    const off = await incident('2026-300004');
    expect(off.reports).toHaveLength(1);
    expect((await get(`/duty-officer/incidents/${off.id}`).expect(200)).body).toMatchObject({ reportRequired: false, expected: false, missing: false, report: null });
    await put('/core/settings/duty-officer.general', { reportRequired: true, dutyKinds: DUTY_KIND_TEMPLATE }).expect(200);
    // Incidents from before (or taken over from another system) never show up as missing.
    expect((await get(`/duty-officer/incidents/${off.id}`).expect(200)).body).toMatchObject({ expected: false, missing: false });
    await test.app.get(DomainEvents).publish<IncidentCreatedEvent>(INCIDENTS_EVENTS.incidentCreated, { incidentId: off.id, dispatchNumber: '2026-300004', alarmKeyword: 'B2', alarmedAt: T('13:05'), createdVia: 'import' });
    expect((await get(`/incidents/incidents/${off.id}`).expect(200)).body.reports).toHaveLength(1);
  });

  it('adds the EvD report to incidents of other systems (API)', async () => {
    const token = await post('/core/tokens', { name: 'Alarmfax', scopes: ['incidents.api.create'] }).expect(201);
    const created = await test.http
      .post('/api/incidents/v1/incidents')
      .set({ Authorization: `Bearer ${token.body.token}` })
      .send({ dispatchNumber: '2026-300005', alarmKeyword: 'TH-VU', alarmedAt: T('20:15'), departments: ['Musterstadt'], personnel: [] })
      .expect(200);
    expect(evdOf((await get(`/incidents/incidents/${created.body.incidentId}`).expect(200)).body)).toMatchObject({ authorPersonId: ids.jonas, status: 'draft' });
  });

  it('deletes the draft EvD report with the last department report', async () => {
    const created = await incident('2026-300006', {}, writer);
    await del(`/incidents/reports/${created.reports.find((r) => r.departmentId)!.id}`, writer).expect(204);
    await get(`/incidents/incidents/${created.id}`).expect(404);
    await get(`/incidents/reports/${evdOf(created)!.id}`).expect(404);
  });

  it('bills the personnel of the EvD report as "Personal EvD" and issues the notice only once it is released', async () => {
    const settings = (await get('/core/settings/cost-recovery.general').expect(200)).body ?? {};
    await put('/core/settings/cost-recovery.general', { ...settings, ...BW_TEMPLATE, personnelRates: [{ kind: 'volunteer', validFrom: '2026-01-01', amount: 21.3 }] }).expect(200);
    const created = await incident('2026-300007', { alarmKeyword: 'B-BMA', location: { street: 'Industriestraße', city: 'Musterstadt', object: 'Muster GmbH' } });
    const department = created.reports.find((r) => r.departmentId)!.id;
    const evd = evdOf(created)!.id;
    await save(department, {
      times: { alarmedAt: T('10:00'), returnedAt: T('11:10') },
      situation: 'BMA ausgelöst',
      actions: 'Erkundung',
      personnel: [{ personId: ids.max, vehicleId: ids.lf }],
      involvedParties: [{ role: 'owner', name: 'Muster GmbH', street: 'Industriestraße 4', postalCode: '12345', city: 'Musterstadt' }],
      statistics: { mainType: 'false-alarm', falseAlarmType: 'fire-alarm-system' },
    }).then((r) => expect(r.status).toBe(200));
    await save(evd, { times: { alarmedAt: T('10:00'), returnedAt: T('11:10') }, situation: 'BMA', actions: 'Einsatzleitung', personnel: [{ personId: ids.jonas, vehicleId: ids.elw }] }, officer).then((r) => expect(r.status).toBe(200));
    await put(`/incidents/incidents/${created.id}/costs`, { chargeable: true, chargeableReason: 'Täuschungsalarm BMA' }).expect(200);

    const notice = (await post('/cost-recovery/notices', { incidentId: created.id }).expect(201)).body;
    expect(notice.positions.map((p: { label: string }) => p.label)).toEqual(expect.arrayContaining(['Personal Musterstadt (1 Person)', 'Personal EvD (1 Person)']));
    // The command vehicle of the duty officer is billed as well.
    expect(notice.positions.some((p: { kind: string; vehicleId: string | null }) => p.kind === 'vehicle' && p.vehicleId === ids.elw)).toBe(true);
    await post(`/cost-recovery/notices/${notice.id}/submit`, {}).expect(200);
    await releaseForBilling(department);
    expect((await post(`/cost-recovery/notices/${notice.id}/issue`, {}).expect(409)).body.code).toBe('cost-recovery.notReleased');
    await releaseForBilling(evd);
    await post(`/cost-recovery/notices/${notice.id}/issue`, {}).expect(200);
  });

  it('makes the EvD report primary while the incident has no department report', async () => {
    // Releasers create incidents without department reports: the EvD report is the only and primary report.
    const created = await incident('2026-300009', { departmentIds: [] });
    const evd = evdOf(created)!;
    expect(created.reports).toEqual([expect.objectContaining({ unit: 'duty-officer', primary: true })]);
    expect((await get(`/incidents/reports/${evd.id}`, officer).expect(200)).body.findings.map((f: { rule: string }) => f.rule)).toContain('statistics-missing');
    const statistics = { mainType: 'fire', fireSize: 'medium' };
    const saved = await save(evd.id, { times: { alarmedAt: T('13:05'), returnedAt: T('14:00') }, situation: 'Lage', actions: 'Leitung', personnel: [{ personId: ids.jonas }], statistics }, officer);
    expect(saved.status).toBe(200);
    expect(saved.body.findings.map((f: { rule: string }) => f.rule)).not.toContain('statistics-not-allowed');
    // "No duty officer" would leave the incident without reports.
    expect((await post(`/duty-officer/incidents/${created.id}/exemption`, { reason: 'Kein EvD' }).expect(409)).body.code).toBe('incidents.unitReportOnlyReport');

    // The first department report takes over the primary role with the statistics.
    const department = (await post(`/incidents/incidents/${created.id}/reports`, { departmentId: ids.musterstadt }, writer).expect(201)).body;
    expect(department).toMatchObject({ primary: true, statistics: expect.objectContaining(statistics) });
    expect((await get(`/incidents/reports/${evd.id}`).expect(200)).body).toMatchObject({ primary: false, statistics: null });
    expect((await post(`/incidents/reports/${evd.id}/primary`, {}).expect(400)).body.code).toBe('incidents.unitReportNotPrimary');
    // Now the EvD report may go.
    await post(`/duty-officer/incidents/${created.id}/exemption`, { reason: 'Kein EvD' }).expect(200);
    expect((await get(`/incidents/incidents/${created.id}`).expect(200)).body.reports).toEqual([expect.objectContaining({ id: department.id, primary: true })]);
  });

  it('leaves the incidents as before while the module is inactive', async () => {
    await put('/core/modules/duty-officer', { active: false }).expect(200);
    const created = await incident('2026-300008');
    expect(created.reports).toEqual([expect.objectContaining({ departmentId: ids.musterstadt, primary: true })]);
    await get(`/duty-officer/incidents/${created.id}`).expect(404);
    // Existing EvD reports stay readable as reports of the incident.
    expect((await get(`/incidents/reports/${ids.evd}`).expect(200)).body).toMatchObject({ unit: 'duty-officer', departmentId: null });
    await put('/core/modules/duty-officer', { active: true }).expect(200);
  });
});

function binary() {
  return ((res: NodeJS.ReadableStream, callback: (e: Error | null, b: Buffer) => void) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => callback(null, Buffer.concat(chunks)));
  }) as never;
}
