import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DigestService, DomainEvents, MailService } from '@forga/core-api';
import { EQUIPMENT_EVENTS } from '@forga/equipment-contracts';
import { INCIDENTS_EVENTS, type ReportReleasedEvent } from '@forga/incidents-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let officer: string;
let member: string;
const ids: Record<string, string> = {};
const events: { name: string }[] = [];

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const del = (path: string, cookie = admin) => test.http.delete(`/api${path}`).set('Cookie', cookie).set(UI);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  for (const name of Object.values(EQUIPMENT_EVENTS)) test.app.get(DomainEvents).subscribe(name, () => { events.push({ name }); });
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
  ids.lf = (await post('/masterdata/vehicles', { designation: 'LF 10', radioCallSign: 'Florian Musterstadt 1/44', vehicleType: 'lf-10', departmentId: ids.musterstadt }).expect(201)).body.id;
  ids.gw = (await post('/masterdata/persons', { firstName: 'Gerd', lastName: 'Wart', status: 'active', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id;
  await post(`/masterdata/persons/${ids.gw}/qualifications`, { qualification: 'equipment-officer', acquiredOn: '2020-01-01' }).expect(201);
  ids.max = (await post('/masterdata/persons', { firstName: 'Max', lastName: 'Muster', status: 'active', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id;

  const roles = (await get('/core/roles')).body as { id: string; templateKey: string }[];
  const role = (key: string) => roles.find((r) => r.templateKey === key)!.id;
  await post('/core/users', { username: 'geraetewart', displayName: 'Gerätewart', email: 'gw@example.org', password: 'auch-sehr-geheim', personId: ids.gw, roles: [{ roleId: role('equipment-officer'), departmentId: ids.musterstadt }] }).expect(201);
  await post('/core/users', { username: 'gf.musterstadt', displayName: 'GF Musterstadt', password: 'auch-sehr-geheim', personId: ids.max, roles: [{ roleId: role('group-leader'), departmentId: ids.musterstadt }] }).expect(201);
  officer = await test.login({ username: 'geraetewart', password: 'auch-sehr-geheim' });
  member = await test.login({ username: 'gf.musterstadt', password: 'auch-sehr-geheim' });
});

afterAll(() => test?.app.close());

describe('equipment', () => {
  it('offers the DGUV 305-002 template and takes over the vehicles', async () => {
    const template = (await post('/equipment/templates/dguv', {}).expect(201)).body;
    expect(template.types).toBeGreaterThan(20);
    expect((await post('/equipment/templates/dguv', {}).expect(201)).body).toEqual({ categories: 0, types: 0 });
    const scba = ((await get('/equipment/types').expect(200)).body as { key: string; inspections: { key: string; intervalMonths: number | null }[] }[]).find((t) => t.key === 'scba')!;
    expect(scba.inspections.map((i) => [i.key, i.intervalMonths])).toEqual([['scba-check', 6], ['scba-overhaul', 72], ['scba-after-use', null]]);

    expect((await post('/equipment/vehicles/sync', {}).expect(200)).body).toEqual({ created: 1 });
    expect((await post('/equipment/vehicles/sync', {}).expect(200)).body).toEqual({ created: 0 });
    const vehicle = ((await get('/equipment/items?categoryKey=vehicles').expect(200)).body as { forVehicleId: string; dues: { key: string; overdue: boolean }[] }[])[0];
    expect(vehicle.forVehicleId).toBe(ids.lf);
    expect(vehicle.dues.map((d) => d.key)).toEqual(['vehicle-annual', 'vehicle-hu', 'vehicle-safety', 'vehicle-dguv70']);
  });

  it('manages items with due inspections per department', async () => {
    const item = { inventoryNumber: 'AS-PA-0001', name: 'Pressluftatmer 1', typeKey: 'scba', categoryKey: 'breathing', departmentId: ids.musterstadt, vehicleId: ids.lf, loadingPlace: 'G1' };
    ids.scba = (await post('/equipment/items', item, officer).expect(201)).body.id;
    await post('/equipment/items', { ...item, name: 'Doppelt' }, officer).expect(400);
    await post('/equipment/items', { ...item, inventoryNumber: 'AS-PA-0099' }, member).expect(403);
    ids.hose = (await post('/equipment/items', { inventoryNumber: 'S-B-0001', name: 'B-Schlauch 20 m', typeKey: 'pressure-hose-b', categoryKey: 'hoses', departmentId: ids.musterstadt, quantity: 1, properties: { Länge: '20 m' } }, officer).expect(201)).body.id;

    const scba = (await get(`/equipment/items/${ids.scba}`, officer).expect(200)).body;
    expect(scba).toMatchObject({ status: 'ready', nextDue: today, openDefects: 0 });
    expect(scba.dues.find((d: { key: string }) => d.key === 'scba-after-use').dueOn).toBeNull();
    // The group leader sees the item, but cannot edit it.
    await get(`/equipment/items/${ids.scba}`, member).expect(200);
    await put(`/equipment/items/${ids.scba}`, item, member).expect(403);
  });

  it('records inspections with qualification check, after-use triggers and bulk inspections', async () => {
    const inspection = (await post(`/equipment/items/${ids.scba}/inspections`, { inspectionKey: 'scba-check', date: today, inspectorPersonId: ids.gw, result: 'passed', checklist: [{ point: 'Warnsignal', state: 'ok' }] }, officer).expect(201)).body;
    expect(inspection).toMatchObject({ qualificationWarning: true, recordedBy: 'Gerätewart' });
    expect(inspection.nextDueOn > today).toBe(true);
    const external = (await post(`/equipment/items/${ids.scba}/inspections`, { inspectionKey: 'scba-overhaul', date: today, inspectorCompany: 'Dräger Service', result: 'passed' }, officer).expect(201)).body;
    expect(external.qualificationWarning).toBe(false);
    await post(`/equipment/items/${ids.scba}/inspections`, { inspectionKey: 'gibt-es-nicht', date: today, result: 'passed' }, officer).expect(400);

    // Inspection report of one inspection and of the day.
    const single = (await get(`/core/lists/equipment.inspection-report?inspectionId=${inspection.id}`, officer).expect(200)).body;
    expect(single.rows).toEqual([expect.objectContaining({ result: 'bestanden', checklist: 'Warnsignal: i. O.', by: 'Wart, Gerd' })]);
    const day = (await get('/core/lists/equipment.inspection-report', officer).expect(200)).body;
    expect(day.rows.map((r: { by: string }) => r.by)).toEqual(expect.arrayContaining(['Wart, Gerd', 'Dräger Service']));

    await post(`/equipment/items/${ids.hose}/trigger`, { inspectionKey: 'hose-washing' }, officer).expect(200);
    let hose = (await get(`/equipment/items/${ids.hose}`, officer)).body;
    expect(hose.dues[0]).toMatchObject({ dueOn: today, overdue: true });
    expect((await post('/equipment/inspections/bulk', { itemIds: [ids.hose], inspectionKey: 'hose-washing', date: today, result: 'passed' }, officer).expect(200)).body).toEqual({ recorded: 1 });
    hose = (await get(`/equipment/items/${ids.hose}`, officer)).body;
    expect(hose.dues[0].dueOn).toBeNull();
    expect((await get(`/equipment/items/${ids.scba}/inspections`, officer)).body).toHaveLength(2);
  });

  it('turns a failed inspection and reported defects into defects with status', async () => {
    await post(`/equipment/items/${ids.scba}/inspections`, { inspectionKey: 'scba-check', date: today, result: 'failed', notes: 'Warnsignal ohne Funktion' }, officer).expect(201);
    let scba = (await get(`/equipment/items/${ids.scba}`, officer)).body;
    expect(scba).toMatchObject({ status: 'defective', openDefects: 1 });

    // Every member may report a defect, e.g. via QR code.
    const reported = (await post(`/equipment/items/${ids.hose}/defects`, { description: 'Kupplung undicht' }, member).expect(201)).body;
    expect(reported).toMatchObject({ status: 'reported', reportedBy: 'GF Musterstadt' });
    expect(events.filter((e) => e.name === EQUIPMENT_EVENTS.defectReported)).toHaveLength(2);

    const defects = (await get('/equipment/defects?open=true', officer).expect(200)).body as { id: string; itemId: string }[];
    const scbaDefect = defects.find((d) => d.itemId === ids.scba)!;
    await put(`/equipment/defects/${scbaDefect.id}`, { status: 'in-progress' }, officer).expect(200);
    expect((await get(`/equipment/items/${ids.scba}`, officer)).body.status).toBe('in-repair');
    await put(`/equipment/defects/${scbaDefect.id}`, { status: 'fixed', resolution: 'Warnsignal getauscht' }, officer).expect(200);
    scba = (await get(`/equipment/items/${ids.scba}`, officer)).body;
    expect(scba).toMatchObject({ status: 'ready', openDefects: 0 });
    await put(`/equipment/defects/${scbaDefect.id}`, { status: 'fixed' }, member).expect(403);
  });

  it('records equipment used in a report and makes after-incident inspections due on release', async () => {
    const reportId = '01a16846-0000-7000-8000-00000000e001';
    await put(`/equipment/reports/${reportId}/usage`, [{ itemId: ids.scba, inspectAfter: true }], member).expect(200);
    expect((await get(`/equipment/reports/${reportId}/usage`, member)).body).toMatchObject([{ itemId: ids.scba, inspectAfter: true, stock: false }]);
    const event: ReportReleasedEvent = {
      reportId, incidentId: '01a16846-0000-7000-8000-00000000e002', departmentId: ids.musterstadt, level: 'billing', alarmedAt: new Date().toISOString(),
      dispatchNumber: '2026-1', reportNumber: '2026-001', alarmKeyword: 'B2', compensationKind: 'incident', personnel: [], vehicleIds: [ids.lf],
    };
    await test.app.get(DomainEvents).publish(INCIDENTS_EVENTS.reportReleased, event);
    const scba = (await get(`/equipment/items/${ids.scba}`, officer)).body;
    expect(scba.dues.find((d: { key: string }) => d.key === 'scba-after-use')).toMatchObject({ dueOn: today, overdue: true });

    // The equipment file lists the incidents of real reports (the report above is made up).
    await post('/incidents/keywords/templates/bw', {}).expect(201);
    const incident = (await post('/incidents/incidents', { dispatchNumber: '2026-555', alarmKeyword: 'B2', alarmedAt: new Date().toISOString(), location: { street: 'Hauptstraße', houseNumber: '1', city: 'Musterstadt' }, departmentIds: [ids.musterstadt] }).expect(201)).body;
    const realReport = incident.reports[0].id;
    await put(`/equipment/reports/${realReport}/usage`, [{ itemId: ids.scba, inspectAfter: false }], member).expect(200);
    const used = (await get(`/equipment/items/${ids.scba}/incidents`, officer).expect(200)).body;
    expect(used).toEqual([expect.objectContaining({ reportId: realReport, dispatchNumber: '2026-555', alarmKeyword: 'B2', location: 'Hauptstraße 1, Musterstadt', quantity: 1, inspectAfter: false })]);
  });

  it('records equipment used in a training session and makes after-use inspections due on closing', async () => {
    await post('/training/types/templates/bw', {}).expect(201);
    const start = new Date(Date.now() - 3 * 3_600_000).toISOString();
    const session = (await post('/training/sessions', { type: 'exercise', title: 'Atemschutzübung', startsAt: start, endsAt: new Date(Date.now() - 3_600_000).toISOString(), departmentIds: [ids.musterstadt] }).expect(201)).body.id as string;
    await put(`/equipment/sessions/${session}/usage`, [{ itemId: ids.scba, inspectAfter: true }]).expect(200);
    expect((await get(`/equipment/sessions/${session}/usage`).expect(200)).body).toMatchObject([{ itemId: ids.scba, inspectAfter: true }]);
    // A training session does not appear among the incidents of the item.
    expect(((await get(`/equipment/items/${ids.scba}/incidents`, officer)).body as { reportId: string }[]).some((u) => u.reportId === session)).toBe(false);
    await put(`/training/sessions/${session}/attendance`, [{ personId: ids.max, status: 'present' }]).expect(200);
    await post(`/training/sessions/${session}/close`, {}).expect(200);
    const scba = (await get(`/equipment/items/${ids.scba}`, officer)).body;
    expect(scba.dues.find((d: { key: string }) => d.key === 'scba-after-use')).toMatchObject({ dueOn: new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(start)) });
  });

  it('groups the deadlines of items by category and vehicle in the weekly e-mail', async () => {
    await test.app.get(DigestService).send(today, { resend: true });
    const mail = test.app.get(MailService).sent.filter((m) => m.to === 'gw@example.org').at(-1)!;
    // A heading per category and vehicle, the deadlines indented below it.
    expect(mail.text).toMatch(/\n[^\n]+ · Florian Musterstadt 1\/44:\n {2}- /);
  });

  it('retires items, protects the organization and offers lists, deadlines, search and import', async () => {
    const retired = (await post(`/equipment/items/${ids.hose}/retire`, { date: today, reason: 'Kupplung defekt', disposition: 'Entsorgt' }, officer).expect(200)).body;
    expect(retired).toMatchObject({ status: 'retired', dues: [], retirement: { reason: 'Kupplung defekt' } });
    expect((await get('/equipment/defects?open=true', officer)).body).toHaveLength(0);
    expect(((await get('/equipment/items', officer)).body as unknown[]).length).toBe(2);

    await del(`/masterdata/vehicles/${ids.lf}`).expect(409);

    for (const list of ['due', 'inventory', 'loading', 'inspections', 'defects', 'retired', 'stock']) await get(`/core/lists/equipment.${list}`, officer).expect(200);
    const loading = (await get('/core/lists/equipment.loading', officer)).body;
    expect(loading.rows[0]).toMatchObject({ vehicle: 'Florian Musterstadt 1/44', place: 'G1', name: 'Pressluftatmer 1' });
    const tasks = (await get(`/core/tasks?asOf=${today}`, officer).expect(200)).body as { kind: string }[];
    expect(tasks.some((t) => t.kind === 'equipment-inspection')).toBe(true);
    const hits = (await get('/core/search?q=AS-PA', officer).expect(200)).body as { title: string }[];
    expect(hits.some((h) => h.title.includes('AS-PA-0001'))).toBe(true);

    const csv = 'Inventar-Nr.;Bezeichnung;Gerätetyp;Abteilung;Fahrzeug;Beladeplatz;letzte Prüfung\nL-0001;Steckleiter 4-teilig;Tragbare Leiter;Musterstadt;Florian Musterstadt 1/44;Dach;01.03.2026\n';
    const upload = await test.http.post('/api/core/imports').set('Cookie', officer).set(UI).attach('file', Buffer.from(csv, 'utf8'), 'inventar.csv').expect(201);
    const mapping = upload.body.suggestions['equipment.inventory'];
    const applied = await post(`/core/imports/${upload.body.id}/apply`, { profile: 'equipment.inventory', mapping }, officer).expect(200);
    expect(applied.body.counts).toMatchObject({ create: 1, error: 0 });
    const ladder = ((await get('/equipment/items?q=L-0001', officer)).body as { dues: { key: string; lastDate: string | null }[]; vehicleId: string }[])[0];
    expect(ladder.vehicleId).toBe(ids.lf);
    expect(ladder.dues.find((d) => d.key === 'ladder-visual')?.lastDate).toBe('2026-03-01');
  });
});
