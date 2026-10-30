import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DigestService, DomainEvents, MailService } from '@forga/core-api';
import { EQUIPMENT_EVENTS } from '@forga/equipment-contracts';
import { INCIDENTS_EVENTS, type ReportReleasedEvent } from '@forga/incidents-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let officer: string;
let member: string;
let reporter: string;
let agw: string;
const ids: Record<string, string> = {};
const events: { name: string }[] = [];

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const del = (path: string, cookie = admin) => test.http.delete(`/api${path}`).set('Cookie', cookie).set(UI);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const subjects = async (cookie: string) => ((await get(`/core/tasks?asOf=${today}`, cookie).expect(200)).body as { subject: { id: string } }[]).map((t) => t.subject.id);

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  for (const name of Object.values(EQUIPMENT_EVENTS)) test.app.get(DomainEvents).subscribe(name, () => { events.push({ name }); });
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
  ids.lf = (await post('/masterdata/vehicles', { designation: 'LF 10', radioCallSign: 'Florian Musterstadt 1/44', vehicleType: 'lf-10', departmentId: ids.musterstadt }).expect(201)).body.id;
  ids.tsf = (await post('/masterdata/vehicles', { designation: 'TSF', radioCallSign: 'Florian Musterstadt 1/47', vehicleType: 'tsf', departmentId: ids.musterstadt }).expect(201)).body.id;
  ids.gw = (await post('/masterdata/persons', { firstName: 'Gerd', lastName: 'Wart', status: 'active', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id;
  await post(`/masterdata/persons/${ids.gw}/qualifications`, { qualification: 'equipment-officer', acquiredOn: '2020-01-01' }).expect(201);
  ids.max = (await post('/masterdata/persons', { firstName: 'Max', lastName: 'Muster', status: 'active', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id;

  const roles = (await get('/core/roles')).body as { id: string; templateKey: string }[];
  const role = (key: string) => roles.find((r) => r.templateKey === key)!.id;
  await post('/core/users', { username: 'geraetewart', displayName: 'Gerätewart', email: 'gw@example.org', password: 'auch-sehr-geheim', personId: ids.gw, roles: [{ roleId: role('equipment-officer'), departmentId: ids.musterstadt }] }).expect(201);
  await post('/core/users', { username: 'gf.musterstadt', displayName: 'GF Musterstadt', password: 'auch-sehr-geheim', personId: ids.max, roles: [{ roleId: role('group-leader'), departmentId: ids.musterstadt }] }).expect(201);
  ids.lisa = (await post('/masterdata/persons', { firstName: 'Lisa', lastName: 'Mitglied', status: 'active', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id;
  await post('/core/users', { username: 'mitglied', displayName: 'Mitglied', password: 'auch-sehr-geheim', personId: ids.lisa, roles: [{ roleId: role('member'), departmentId: ids.musterstadt }] }).expect(201);
  await post('/core/users', { username: 'agw', displayName: 'AGW', email: 'agw@example.org', password: 'auch-sehr-geheim', roles: [{ roleId: role('breathing-apparatus-officer'), departmentId: null }] }).expect(201);
  officer = await test.login({ username: 'geraetewart', password: 'auch-sehr-geheim' });
  member = await test.login({ username: 'gf.musterstadt', password: 'auch-sehr-geheim' });
  reporter = await test.login({ username: 'mitglied', password: 'auch-sehr-geheim' });
  agw = await test.login({ username: 'agw', password: 'auch-sehr-geheim' });
});

afterAll(() => test?.app.close());

describe('equipment', () => {
  it('offers the DGUV 305-002 template', async () => {
    const template = (await post('/equipment/templates/dguv', {}).expect(201)).body;
    expect(template.types).toBeGreaterThan(20);
    expect((await post('/equipment/templates/dguv', {}).expect(201)).body).toEqual({ categories: 0, types: 0 });
    const scba = ((await get('/equipment/types').expect(200)).body as { key: string; inspections: { key: string; intervalMonths: number | null }[] }[]).find((t) => t.key === 'scba')!;
    expect(scba.inspections.map((i) => [i.key, i.intervalMonths])).toEqual([['scba-check', 6], ['scba-overhaul', 72], ['scba-after-use', null]]);
    expect(((await get('/equipment/categories')).body as { key: string }[]).some((c) => c.key === 'vehicles')).toBe(false);
    // Hoses are single items by default.
    expect(((await get('/equipment/categories')).body as { key: string; tracking: string }[]).find((c) => c.key === 'hoses')?.tracking).toBe('item');
  });

  it('manages items with due inspections per department', async () => {
    const item = { inventoryNumber: 'AS-PA-0001', name: 'Pressluftatmer 1', typeKey: 'scba', categoryKey: 'breathing', departmentId: ids.musterstadt, vehicleId: ids.lf, loadingPlace: 'G1', location: 'Atemschutzwerkstatt' };
    ids.scba = (await post('/equipment/items', item, officer).expect(201)).body.id;
    await post('/equipment/items', { ...item, name: 'Doppelt' }, officer).expect(400);
    await post('/equipment/items', { ...item, inventoryNumber: 'AS-PA-0099' }, member).expect(403);
    ids.hose = (await post('/equipment/items', { inventoryNumber: 'S-B-0001', name: 'B-Schlauch 20 m', typeKey: 'pressure-hose-b', categoryKey: 'hoses', departmentId: ids.musterstadt, quantity: 1, properties: { Länge: '20 m' } }, officer).expect(201)).body.id;

    ids.ladder = (await post('/equipment/items', { inventoryNumber: 'L-0099', name: 'Steckleiter', typeKey: 'portable-ladder', categoryKey: 'ladders', departmentId: ids.musterstadt, vehicleId: ids.lf, loadingPlace: 'Dach' }, officer).expect(201)).body.id;

    // Never inspected and no purchase date: due from the day the item was recorded.
    const scba = (await get(`/equipment/items/${ids.scba}`, officer).expect(200)).body;
    expect(scba).toMatchObject({ status: 'ready', nextDue: today, openDefects: 0, blocked: false, labelPrintedAt: null, location: 'Atemschutzwerkstatt' });
    expect(scba.dues.find((d: { key: string }) => d.key === 'scba-after-use').dueOn).toBeNull();
    // The group leader sees the item, but cannot edit it.
    await get(`/equipment/items/${ids.scba}`, member).expect(200);
    await put(`/equipment/items/${ids.scba}`, item, member).expect(403);
    // A member who may only report defects gets the item without price, serial number and inspections.
    const summary = (await get(`/equipment/items/${ids.scba}`, reporter).expect(200)).body;
    expect(summary).toEqual({ id: ids.scba, inventoryNumber: 'AS-PA-0001', name: 'Pressluftatmer 1', departmentId: ids.musterstadt, status: 'ready', blocked: false, reportOnly: true });
    // "My area": hits name vehicle and loading place, also for a scanned code.
    expect((await get('/equipment/me/items?q=Pressluftatmer', reporter).expect(200)).body).toEqual([{ id: ids.scba, inventoryNumber: 'AS-PA-0001', name: 'Pressluftatmer 1', place: 'Atemschutzwerkstatt · Florian Musterstadt 1/44 · G1' }]);
    expect(((await get('/equipment/me/items?code=as-pa-0001', reporter).expect(200)).body as { id: string }[]).map((i) => i.id)).toEqual([ids.scba]);
    expect(((await get(`/equipment/me/items?code=${encodeURIComponent(`https://forga.example.org/equipment/items/${ids.scba}`)}`, reporter).expect(200)).body as { id: string }[]).map((i) => i.id)).toEqual([ids.scba]);
    await get(`/equipment/items/${ids.scba}/inspections`, reporter).expect(403);
  });

  it('stores one photo of an item and replaces it with the next one', async () => {
    const photo = Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 4, 1, 2, 0xff, 0xd9]);
    const upload = (cookie: string, file = photo, type = 'image/jpeg', name = 'geraet.jpg') =>
      test.http.post(`/api/core/attachments?type=equipment.item&id=${ids.scba}`).set('Cookie', cookie).set(UI).attach('file', file, { filename: name, contentType: type });
    expect((await upload(reporter)).status).toBeGreaterThanOrEqual(400);
    const first = (await upload(officer).expect(201)).body as { id: string };
    const again = (await upload(officer).expect(201)).body as { id: string };
    const list = (await get(`/core/attachments?type=equipment.item&id=${ids.scba}`, officer).expect(200)).body as { id: string }[];
    expect(list.map((a) => a.id)).toEqual([again.id]);
    expect(first.id).not.toBe(again.id);
    await upload(officer, Buffer.from('%PDF-1.4'), 'application/pdf', 'x.pdf').expect(400);
    const twin = (await post('/equipment/items', { inventoryNumber: 'AS-PA-0002', name: 'Pressluftatmer 1', typeKey: 'scba', categoryKey: 'breathing', departmentId: ids.musterstadt }, officer).expect(201)).body as { id: string };
    const shared = (await get(`/core/attachments?type=equipment.item&id=${twin.id}`, officer).expect(200)).body as { id: string }[];
    expect(shared.map((a) => a.id)).toEqual([again.id]);
    const document = (await test.http.post(`/api/core/attachments?type=equipment.item-document&id=${twin.id}`).set('Cookie', officer).set(UI).attach('file', Buffer.from('%PDF-1.4'), { filename: 'blatt.pdf', contentType: 'application/pdf' }).expect(201)).body as { id: string };
    const documents = (await get(`/core/attachments?type=equipment.item-document&id=${ids.scba}`, officer).expect(200)).body as { id: string }[];
    expect(documents.map((a) => a.id)).toEqual([document.id]);
  });

  it('measures new items from the purchase date or the inspections taken over, with interval overrides per item', async () => {
    const base = { name: 'Leiter', typeKey: 'portable-ladder', categoryKey: 'ladders', departmentId: ids.musterstadt };
    const purchased = (await post('/equipment/items', { ...base, inventoryNumber: 'L-0100', purchasedOn: '2026-01-15' }, officer).expect(201)).body;
    expect(purchased.dues.find((d: { key: string }) => d.key === 'ladder-visual')).toMatchObject({ dueOn: '2027-01-15', lastDate: null });
    const takenOver = (await post('/equipment/items', { ...base, inventoryNumber: 'L-0101', intervalOverrides: { 'ladder-load': 36 }, initialInspections: [{ inspectionKey: 'ladder-visual', date: '2026-02-01' }, { inspectionKey: 'ladder-load', date: '2026-02-01' }] }, officer).expect(201)).body;
    expect(takenOver.dues.map((d: { key: string; dueOn: string }) => [d.key, d.dueOn])).toEqual([['ladder-visual', '2027-02-01'], ['ladder-load', '2029-02-01']]);
    await post('/equipment/items', { ...base, inventoryNumber: 'L-0102', initialInspections: [{ inspectionKey: 'gibt-es-nicht', date: '2026-02-01' }] }, officer).expect(400);
    await post('/equipment/items', { ...base, inventoryNumber: 'L-0102', initialInspections: [{ inspectionKey: 'ladder-visual', date: '2099-02-01' }] }, officer).expect(400);
    for (const id of [purchased.id, takenOver.id]) await post(`/equipment/items/${id}/retire`, { date: today, reason: 'Test' }, officer).expect(200);
  });

  it('stores barcodes and RFID chips once and finds items by a scanned code', async () => {
    const scba = { inventoryNumber: 'AS-PA-0001', name: 'Pressluftatmer 1', typeKey: 'scba', categoryKey: 'breathing', departmentId: ids.musterstadt, vehicleId: ids.lf, loadingPlace: 'G1' };
    const hose = { inventoryNumber: 'S-B-0001', name: 'B-Schlauch 20 m', typeKey: 'pressure-hose-b', categoryKey: 'hoses', departmentId: ids.musterstadt, quantity: 1, properties: { Länge: '20 m' } };
    const version = async (id: string) => (await get(`/equipment/items/${id}`, officer).expect(200)).body.version as number;
    const saved = await put(`/equipment/items/${ids.scba}`, { ...scba, barcode: ' 4006381333931 ', rfid: 'e2:00:00:17:22:11', version: await version(ids.scba) }, officer).expect(200);
    // RFID readers write the chip ID in different forms; it is stored normalized.
    expect(saved.body).toMatchObject({ barcode: '4006381333931', rfid: 'E20000172211' });
    const taken = await put(`/equipment/items/${ids.hose}`, { ...hose, rfid: 'E2 00 00 17 22 11', version: await version(ids.hose) }, officer).expect(400);
    expect(taken.body).toMatchObject({ code: 'codes.taken', field: 'rfid' });
    // Without codes the field stays empty; several items may have none.
    expect((await put(`/equipment/items/${ids.hose}`, { ...hose, barcode: '', version: await version(ids.hose) }, officer).expect(200)).body.barcode).toBeNull();

    const lookup = async (code: string, cookie = member) => ((await get(`/core/codes?code=${encodeURIComponent(code)}`, cookie).expect(200)).body as { to: string }[]).map((h) => h.to);
    // Readers open the inspections of the item.
    expect(await lookup('e2-00-00-17-22-11')).toEqual([`/equipment/items/${ids.scba}?tab=inspections`]);
    expect(await lookup('4006381333931')).toEqual([`/equipment/items/${ids.scba}?tab=inspections`]);
    expect(await lookup('s-b-0001')).toEqual([`/equipment/items/${ids.hose}?tab=inspections`]);
    expect(await lookup(`https://forga.example.org/equipment/items/${ids.hose}`)).toEqual([`/equipment/items/${ids.hose}?tab=inspections`]);
    // Members who may only report defects get a hit that opens "report a defect", without the serial number.
    const hits = (await get(`/core/codes?code=4006381333931`, reporter).expect(200)).body as { to: string; description: string }[];
    expect(hits).toEqual([expect.objectContaining({ to: `/equipment/items/${ids.scba}?report=defect`, description: '' })]);
    // Exact codes only: a part of a barcode is no hit.
    expect(await lookup('400638%')).toEqual([]);
    expect((await get('/core/codes/modules', member).expect(200)).body).toContain('equipment');
    expect(((await get('/equipment/items?q=E2000017', officer).expect(200)).body as { id: string }[]).map((i) => i.id)).toEqual([ids.scba]);
  });

  it('records inspections with qualification check, after-use triggers and bulk inspections', async () => {
    const inspection = (await post(`/equipment/items/${ids.scba}/inspections`, { inspectionKey: 'scba-check', date: today, inspectorPersonId: ids.gw, result: 'passed', checklist: [{ point: 'Warnsignal', state: 'ok' }] }, officer).expect(201)).body;
    expect(inspection).toMatchObject({ qualificationWarning: true, recordedBy: 'Gerätewart' });
    expect(inspection.nextDueOn > today).toBe(true);
    const external = (await post(`/equipment/items/${ids.scba}/inspections`, { inspectionKey: 'scba-overhaul', date: today, inspectorCompany: 'Dräger Service', result: 'passed' }, officer).expect(201)).body;
    expect(external.qualificationWarning).toBe(false);
    await post(`/equipment/items/${ids.scba}/inspections`, { inspectionKey: 'gibt-es-nicht', date: today, result: 'passed' }, officer).expect(400);
    // No inspections in the future, the next due date after the inspection.
    expect((await post(`/equipment/items/${ids.scba}/inspections`, { inspectionKey: 'scba-check', date: '2099-01-01', result: 'passed' }, officer).expect(400)).body.code).toBe('equipment.inspectionInFuture');
    expect((await post(`/equipment/items/${ids.scba}/inspections`, { inspectionKey: 'scba-check', date: today, nextDueOn: today, result: 'passed' }, officer).expect(400)).body.code).toBe('equipment.nextDueNotAfterDate');

    // Inspection report of one inspection and of the day.
    const single = (await get(`/core/lists/equipment.inspection-report?inspectionId=${inspection.id}`, officer).expect(200)).body;
    expect(single.rows).toEqual([expect.objectContaining({ result: 'bestanden', checklist: 'Warnsignal: i. O.', by: 'Wart, Gerd' })]);
    const day = (await get('/core/lists/equipment.inspection-report', officer).expect(200)).body;
    expect(day.rows.map((r: { by: string }) => r.by)).toEqual(expect.arrayContaining(['Wart, Gerd', 'Dräger Service']));

    await post(`/equipment/items/${ids.hose}/trigger`, { inspectionKey: 'gibt-es-nicht' }, officer).expect(400);
    await post(`/equipment/items/${ids.hose}/trigger`, { inspectionKey: 'hose-washing' }, officer).expect(200);
    let hose = (await get(`/equipment/items/${ids.hose}`, officer)).body;
    expect(hose.dues[0]).toMatchObject({ dueOn: today, overdue: true });
    expect((await post('/equipment/inspections/bulk', { itemIds: [ids.hose], inspectionKey: 'hose-washing', date: today, result: 'passed' }, officer).expect(200)).body).toEqual({ recorded: 1 });
    hose = (await get(`/equipment/items/${ids.hose}`, officer)).body;
    expect(hose.dues[0].dueOn).toBeNull();
    expect((await get(`/equipment/items/${ids.scba}/inspections`, officer)).body).toHaveLength(2);
  });

  it('corrects and cancels inspections with a reason', async () => {
    const recorded = (await post(`/equipment/items/${ids.ladder}/inspections`, { inspectionKey: 'ladder-visual', date: today, result: 'passed' }, officer).expect(201)).body;
    const correction = { date: today, result: 'passed', nextDueOn: '2099-01-01', notes: 'Holm geprüft' };
    await put(`/equipment/inspections/${recorded.id}`, correction, officer).expect(400);
    await put(`/equipment/inspections/${recorded.id}`, { ...correction, reason: 'Fälligkeit laut Prüfbuch' }, member).expect(403);
    const corrected = (await put(`/equipment/inspections/${recorded.id}`, { ...correction, reason: 'Fälligkeit laut Prüfbuch' }, officer).expect(200)).body;
    expect(corrected).toMatchObject({ nextDueOn: '2099-01-01', changeReason: 'Fälligkeit laut Prüfbuch', cancelled: false });
    let ladder = (await get(`/equipment/items/${ids.ladder}`, officer)).body;
    expect(ladder.dues.find((d: { key: string }) => d.key === 'ladder-visual').dueOn).toBe('2099-01-01');
    await post(`/equipment/inspections/${recorded.id}/cancel`, { reason: 'Falsches Gerät' }, officer).expect(200);
    await post(`/equipment/inspections/${recorded.id}/cancel`, { reason: 'Falsches Gerät' }, officer).expect(409);
    ladder = (await get(`/equipment/items/${ids.ladder}`, officer)).body;
    expect(ladder.dues.find((d: { key: string }) => d.key === 'ladder-visual')).toMatchObject({ lastDate: null });
    const history = (await get(`/equipment/items/${ids.ladder}/inspections`, officer)).body;
    expect(history[0]).toMatchObject({ cancelled: true, changeReason: 'Falsches Gerät' });
  });

  it('turns a failed inspection and reported defects into defects with status', async () => {
    const failed = (await post(`/equipment/items/${ids.scba}/inspections`, { inspectionKey: 'scba-check', date: today, result: 'failed', notes: 'Warnsignal ohne Funktion' }, officer).expect(201)).body;
    // A failed inspection stays due: the due date does not advance.
    expect(failed.nextDueOn).toBeNull();
    let scba = (await get(`/equipment/items/${ids.scba}`, officer)).body;
    expect(scba).toMatchObject({ status: 'defective', openDefects: 1 });
    // The defect of the inspection names inspection type and result (translated by the client), the notes as text.
    const finding = ((await get(`/equipment/defects?itemId=${ids.scba}`, officer)).body as { description: string; finding: unknown }[])[0];
    expect(finding).toMatchObject({ description: 'Warnsignal ohne Funktion', finding: { inspectionId: failed.id, name: { de: 'Sicht- und Funktionsprüfung', en: 'Visual and function check' }, result: 'failed' } });
    // A reporter who may only report defects sees the status of the item.
    expect((await get(`/equipment/items/${ids.scba}`, reporter)).body).toMatchObject({ status: 'defective', reportOnly: true });
    expect(scba.dues.find((d: { key: string }) => d.key === 'scba-check')).toMatchObject({ dueOn: today, overdue: true });

    // Every member may report a defect, e.g. via QR code.
    const reported = (await post(`/equipment/items/${ids.hose}/defects`, { description: 'Kupplung undicht' }, member).expect(201)).body;
    expect(reported).toMatchObject({ status: 'reported', reportedBy: 'GF Musterstadt' });
    expect(events.filter((e) => e.name === EQUIPMENT_EVENTS.defectReported)).toHaveLength(2);

    const defects = (await get('/equipment/defects?open=true', officer).expect(200)).body as { id: string; itemId: string }[];
    const scbaDefect = defects.find((d) => d.itemId === ids.scba)!;
    // The breathing apparatus officer handles defects of breathing apparatus (not of other items).
    await put(`/equipment/defects/${scbaDefect.id}`, { status: 'in-progress' }, agw).expect(200);
    expect((await get(`/equipment/items/${ids.scba}`, officer)).body.status).toBe('in-repair');
    const hoseDefect = defects.find((d) => d.itemId === ids.hose)!;
    await put(`/equipment/defects/${hoseDefect.id}`, { status: 'in-progress' }, agw).expect(403);
    // "Fixed" needs a resolution and sets the item to "in inspection" until an inspection is passed.
    expect((await put(`/equipment/defects/${scbaDefect.id}`, { status: 'fixed' }, agw).expect(400)).body.code).toBe('equipment.resolutionRequired');
    await put(`/equipment/defects/${scbaDefect.id}`, { status: 'fixed', resolution: 'Warnsignal getauscht' }, agw).expect(200);
    scba = (await get(`/equipment/items/${ids.scba}`, officer)).body;
    expect(scba).toMatchObject({ status: 'in-inspection', openDefects: 0 });
    await put(`/equipment/defects/${scbaDefect.id}`, { status: 'fixed', resolution: 'x' }, member).expect(403);
    await post(`/equipment/items/${ids.scba}/inspections`, { inspectionKey: 'scba-check', date: today, result: 'passed' }, agw).expect(201);
    expect((await get(`/equipment/items/${ids.scba}`, officer)).body.status).toBe('ready');
    await put(`/equipment/items/${ids.scba}/status`, { status: 'in-inspection' }, agw).expect(200);
    await put(`/equipment/items/${ids.scba}/status`, { status: 'ready' }, agw).expect(200);
    await put(`/equipment/items/${ids.ladder}/status`, { status: 'ready' }, agw).expect(403);
    // "With defects" records a defect, the item stays usable.
    await post(`/equipment/items/${ids.ladder}/inspections`, { inspectionKey: 'ladder-visual', date: today, result: 'passed-with-defects', notes: 'Kennzeichnung blass' }, officer).expect(201);
    expect((await get(`/equipment/items/${ids.ladder}`, officer)).body).toMatchObject({ status: 'ready', openDefects: 1 });
  });

  it('keeps an item defective until no defect is open and the latest inspection of every type is not failed', async () => {
    const ladder = (await post('/equipment/items', { inventoryNumber: 'L-0200', name: 'Schiebleiter', typeKey: 'portable-ladder', categoryKey: 'ladders', departmentId: ids.musterstadt }, officer).expect(201)).body.id as string;
    const status = async () => (await get(`/equipment/items/${ladder}`, officer)).body.status as string;
    await post(`/equipment/items/${ladder}/inspections`, { inspectionKey: 'ladder-load', date: today, result: 'failed' }, officer).expect(201);
    expect(await status()).toBe('defective');
    // Without notes the defect only names inspection type and result (no German text stored).
    const [defect] = (await get(`/equipment/defects?itemId=${ladder}`, officer)).body as { id: string; description: string; finding: { result: string; name: { en: string } } }[];
    expect(defect).toMatchObject({ description: '', finding: { result: 'failed', name: { en: 'Load test' } } });
    // A passed inspection of another type does not make it ready (open defect, load test failed).
    await post(`/equipment/items/${ladder}/inspections`, { inspectionKey: 'ladder-visual', date: today, result: 'passed' }, officer).expect(201);
    expect(await status()).toBe('defective');
    await put(`/equipment/defects/${defect.id}`, { status: 'fixed', resolution: 'Holm getauscht' }, officer).expect(200);
    expect(await status()).toBe('in-inspection');
    // The load test is still failed: another type passing does not release it.
    await post(`/equipment/items/${ladder}/inspections`, { inspectionKey: 'ladder-visual', date: today, result: 'passed' }, officer).expect(201);
    expect(await status()).toBe('defective');
    await post(`/equipment/items/${ladder}/inspections`, { inspectionKey: 'ladder-load', date: today, result: 'passed' }, officer).expect(201);
    expect(await status()).toBe('ready');
    ids.ladder2 = ladder;
  });

  it('gives corrections and cancellations the consequences of the result', async () => {
    const ladder = ids.ladder2;
    const item = async () => (await get(`/equipment/items/${ladder}`, officer)).body as { status: string; openDefects: number };
    const passed = (await post(`/equipment/items/${ladder}/inspections`, { inspectionKey: 'ladder-visual', date: today, result: 'passed' }, officer).expect(201)).body.id as string;
    // Corrected to "failed": defect and status as for a new failed inspection.
    await put(`/equipment/inspections/${passed}`, { date: today, result: 'failed', notes: 'Sprosse gebrochen', reason: 'Ergebnis vertauscht' }, officer).expect(200);
    expect(await item()).toMatchObject({ status: 'defective', openDefects: 1 });
    // Corrected back to "passed": the defect of the inspection is withdrawn, the item is ready again.
    await put(`/equipment/inspections/${passed}`, { date: today, result: 'passed', reason: 'Doch bestanden' }, officer).expect(200);
    expect(await item()).toMatchObject({ status: 'ready', openDefects: 0 });
    const withdrawn = ((await get(`/equipment/defects?itemId=${ladder}`, officer)).body as { status: string; resolution: string }[]).find((d) => d.status === 'withdrawn');
    expect(withdrawn).toMatchObject({ resolution: 'Doch bestanden' });
    // Cancelling a failed inspection withdraws its defect and settles the status.
    const failed = (await post(`/equipment/items/${ladder}/inspections`, { inspectionKey: 'ladder-load', date: today, result: 'failed' }, officer).expect(201)).body.id as string;
    expect(await item()).toMatchObject({ status: 'defective', openDefects: 1 });
    await post(`/equipment/inspections/${failed}/cancel`, { reason: 'Falsches Gerät' }, officer).expect(200);
    expect(await item()).toMatchObject({ status: 'ready', openDefects: 0 });
  });

  it('makes a settled trigger due again when its inspection is cancelled', async () => {
    const hose = (await post('/equipment/items', { inventoryNumber: 'S-B-0002', name: 'B-Schlauch', typeKey: 'pressure-hose-b', categoryKey: 'hoses', departmentId: ids.musterstadt }, officer).expect(201)).body.id as string;
    await post(`/equipment/items/${hose}/trigger`, { inspectionKey: 'hose-washing' }, officer).expect(200);
    const inspection = (await post(`/equipment/items/${hose}/inspections`, { inspectionKey: 'hose-washing', date: today, result: 'passed' }, officer).expect(201)).body.id as string;
    expect((await get(`/equipment/items/${hose}`, officer)).body.dues[0].dueOn).toBeNull();
    await post(`/equipment/inspections/${inspection}/cancel`, { reason: 'Falscher Schlauch' }, officer).expect(200);
    expect((await get(`/equipment/items/${hose}`, officer)).body.dues[0]).toMatchObject({ dueOn: today, overdue: true });
    ids.hose2 = hose;
  });

  it('records bulk inspections all or nothing, without e-mails on failure', async () => {
    const mails = test.app.get(MailService).sent.length;
    const before = events.length;
    const count = async (id: string) => ((await get(`/equipment/items/${id}/inspections`, officer)).body as unknown[]).length;
    const counts = async () => [await count(ids.hose2), await count(ids.scba), await count(ids.ladder2)];
    const initial = await counts();
    // The breathing apparatus officer may inspect the breathing apparatus but not the ladder: nothing is written.
    await post('/equipment/inspections/bulk', { itemIds: [ids.scba, ids.ladder2], inspectionKey: 'scba-check', date: today, result: 'failed' }, agw).expect(403);
    // The ladder has no inspection type "after washing": nothing is written, not even the hose.
    expect((await post('/equipment/inspections/bulk', { itemIds: [ids.hose2, ids.ladder2], inspectionKey: 'hose-washing', date: today, result: 'failed' }, officer).expect(400)).body.code).toBe('equipment.unknownInspection');
    expect(await counts()).toEqual(initial);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(test.app.get(MailService).sent.length).toBe(mails);
    expect(events.length).toBe(before);
  });

  it('lets the breathing apparatus officer maintain breathing apparatus items only', async () => {
    const mask = { inventoryNumber: 'AS-M-0001', name: 'Vollmaske 1', typeKey: 'full-face-mask', categoryKey: 'breathing', departmentId: ids.musterstadt };
    const created = (await post('/equipment/items', mask, agw).expect(201)).body;
    const updated = (await put(`/equipment/items/${created.id}`, { ...mask, name: 'Vollmaske 1 (Gr. M)', version: created.version }, agw).expect(200)).body;
    // Not into another category, and no items of other categories.
    await put(`/equipment/items/${created.id}`, { ...mask, typeKey: null, categoryKey: 'ladders', version: updated.version }, agw).expect(403);
    await post('/equipment/items', { inventoryNumber: 'L-0300', name: 'Leiter', typeKey: 'portable-ladder', categoryKey: 'ladders', departmentId: ids.musterstadt }, agw).expect(403);
    await post(`/equipment/items/${ids.ladder2}/retire`, { date: today, reason: 'Test' }, agw).expect(403);
    await post(`/equipment/items/${created.id}/retire`, { date: today, reason: 'Test' }, agw).expect(200);
  });

  it('checks dates and releases items without inspection types when the defect is fixed', async () => {
    const binder = { inventoryNumber: 'OB-0001', name: 'Ölbinder', typeKey: 'oil-binder', categoryKey: 'consumables', departmentId: ids.musterstadt };
    expect((await post('/equipment/items', { ...binder, purchasedOn: '2099-01-01' }, officer).expect(400)).body.code).toBe('equipment.purchaseInFuture');
    const id = (await post('/equipment/items', binder, officer).expect(201)).body.id as string;
    const defect = (await post(`/equipment/items/${id}/defects`, { description: 'Sack gerissen' }, officer).expect(201)).body.id as string;
    await put(`/equipment/defects/${defect}`, { status: 'in-progress' }, officer).expect(200);
    await put(`/equipment/defects/${defect}`, { status: 'fixed', resolution: 'Umgefüllt' }, officer).expect(200);
    // Nothing to inspect: ready right away instead of "in inspection" forever.
    expect((await get(`/equipment/items/${id}`, officer)).body.status).toBe('ready');

    const ladder = (await post('/equipment/items', { inventoryNumber: 'L-0400', name: 'Leiter', typeKey: 'portable-ladder', categoryKey: 'ladders', departmentId: ids.musterstadt, purchasedOn: '2026-01-15' }, officer).expect(201)).body.id as string;
    expect((await post(`/equipment/items/${ladder}/inspections`, { inspectionKey: 'ladder-visual', date: '2026-01-14', result: 'passed' }, officer).expect(400)).body.code).toBe('equipment.inspectionBeforePurchase');
    expect((await post('/equipment/items', { inventoryNumber: 'L-0401', name: 'Leiter', typeKey: 'portable-ladder', categoryKey: 'ladders', departmentId: ids.musterstadt, initialInspections: [{ inspectionKey: 'ladder-visual', date: '1899-12-31' }] }, officer).expect(400)).body.code).toBe('equipment.dateTooEarly');
    await post(`/equipment/items/${ladder}/retire`, { date: today, reason: 'Test' }, officer).expect(200);
  });

  it('sends defects and deadlines of breathing apparatus to the breathing apparatus officer', async () => {
    const mail = test.app.get(MailService);
    const sent = mail.sent.length;
    await post(`/equipment/items/${ids.scba}/defects`, { description: 'Maske rissig' }, reporter).expect(201);
    await post(`/equipment/items/${ids.ladder}/defects`, { description: 'Sprosse locker' }, reporter).expect(201);
    await new Promise((resolve) => setTimeout(resolve, 200));
    const recipients = mail.sent.slice(sent).map((m) => [m.to, m.subject]);
    expect(recipients).toEqual(expect.arrayContaining([['agw@example.org', 'Neuer Mangel: Pressluftatmer 1 (AS-PA-0001)'], ['gw@example.org', 'Neuer Mangel: Steckleiter (L-0099)']]));
    expect(recipients).not.toContainEqual(['agw@example.org', 'Neuer Mangel: Steckleiter (L-0099)']);
    expect(recipients).not.toContainEqual(['gw@example.org', 'Neuer Mangel: Pressluftatmer 1 (AS-PA-0001)']);

    const ofAgw = await subjects(agw);
    expect(ofAgw).toContain(ids.scba);
    expect(ofAgw).not.toContain(ids.ladder);
    const ofOfficer = await subjects(officer);
    expect(ofOfficer).toContain(ids.ladder);
    expect(ofOfficer).not.toContain(ids.scba);
    const tasks = (await get(`/core/tasks?asOf=${today}`, officer).expect(200)).body as { kind: string; subject: { id: string }; to?: string }[];
    expect(tasks.find((t) => t.kind === 'equipment-inspection' && t.subject.id === ids.ladder)?.to).toBe(`/equipment/items/${ids.ladder}?tab=inspections`);
    expect(tasks.find((t) => t.kind === 'equipment-defect' && t.subject.id === ids.ladder)?.to).toBe(`/equipment/items/${ids.ladder}?tab=defects`);
    // Lead times come from the settings.
    expect((await put('/core/settings/equipment.settings', { inspectionLeadDays: 0, expiryLeadDays: 10, dueSoonDays: 14 }).expect(200)).body).toMatchObject({ dueSoonDays: 14 });
    await put('/core/settings/equipment.settings', {}).expect(200);
  });

  it('blocks items of locking categories while an inspection is overdue', async () => {
    const cylinder = (await post('/equipment/items', { inventoryNumber: 'AS-FL-0001', name: 'Flasche', typeKey: 'air-cylinder', categoryKey: 'breathing', departmentId: ids.musterstadt, initialInspections: [{ inspectionKey: 'cylinder-check', date: '2026-01-01' }, { inspectionKey: 'cylinder-pressure', date: '2021-01-01' }] }, officer).expect(201)).body;
    expect(cylinder).toMatchObject({ status: 'ready', blocked: true });
    const inventory = (await get('/core/lists/equipment.inventory', officer)).body.rows.find((r: { number: string }) => r.number === 'AS-FL-0001');
    expect(inventory.status).toBe('gesperrt (Prüfung überfällig)');
    await post(`/equipment/items/${cylinder.id}/retire`, { date: today, reason: 'Test' }, officer).expect(200);
  });

  it('prints labels per item and marks them as printed', async () => {
    const without = (await get('/equipment/items?withoutLabel=true', officer).expect(200)).body as { id: string }[];
    expect(without.map((i) => i.id)).toContain(ids.ladder);
    await post('/equipment/items/labels/printed', { itemIds: [ids.ladder] }, member).expect(403);
    expect((await post('/equipment/items/labels/printed', { itemIds: [ids.ladder] }, officer).expect(200)).body).toEqual({ marked: 1 });
    expect(((await get('/equipment/items?withoutLabel=true', officer)).body as { id: string }[]).map((i) => i.id)).not.toContain(ids.ladder);
  });

  it('records equipment used in a report and makes after-incident inspections due on release', async () => {
    // Usage of a report that does not exist: neither readable nor writable.
    const reportId = '01a16846-0000-7000-8000-00000000e001';
    await put(`/equipment/reports/${reportId}/usage`, [{ itemId: ids.scba, inspectAfter: true }], member).expect(404);
    await get(`/equipment/reports/${reportId}/usage`, member).expect(404);
    const event: ReportReleasedEvent = {
      reportId, incidentId: '01a16846-0000-7000-8000-00000000e002', departmentId: ids.musterstadt, unit: null, level: 'billing', alarmedAt: new Date().toISOString(),
      dispatchNumber: '2026-1', reportNumber: '2026-001', alarmKeyword: 'B2', compensationKind: 'incident', personnel: [], vehicleIds: [ids.lf],
    };
    // The test app has no usage for the made-up report; mark the item via the vehicle and the usage table.
    await test.app.get(DomainEvents).publish(INCIDENTS_EVENTS.reportReleased, event);
    await post(`/equipment/items/${ids.scba}/trigger`, { inspectionKey: 'scba-after-use' }, officer).expect(200);
    const scba = (await get(`/equipment/items/${ids.scba}`, officer)).body;
    expect(scba.dues.find((d: { key: string }) => d.key === 'scba-after-use')).toMatchObject({ dueOn: today, overdue: true });

    // The equipment file lists the incidents of real reports (the report above is made up).
    await post('/incidents/keywords/templates/bw', {}).expect(201);
    const incident = (await post('/incidents/incidents', { dispatchNumber: '2026-555', alarmKeyword: 'B2', alarmedAt: new Date().toISOString(), location: { street: 'Hauptstraße', houseNumber: '1', city: 'Musterstadt' }, departmentIds: [ids.musterstadt] }).expect(201)).body;
    const realReport = incident.reports[0].id;
    // The group leader of the department writes the usage of the draft; others neither read nor write it.
    await put(`/equipment/reports/${realReport}/usage`, [{ itemId: ids.scba, inspectAfter: false }], member).expect(200);
    expect((await get(`/equipment/reports/${realReport}/usage`, member)).body).toMatchObject([{ itemId: ids.scba, inspectAfter: false, stock: false }]);
    await get(`/equipment/reports/${realReport}/usage`, reporter).expect(404);
    await put(`/equipment/reports/${realReport}/usage`, [], reporter).expect(404);
    // Items of another department are refused.
    const foreign = (await post('/equipment/items', { inventoryNumber: 'AH-0001', name: 'Fremd', typeKey: 'portable-ladder', categoryKey: 'ladders', departmentId: ids.ahornfeld }).expect(201)).body.id;
    expect((await put(`/equipment/reports/${realReport}/usage`, [{ itemId: foreign }], member).expect(400)).body.code).toBe('equipment.otherDepartment');
    const used = (await get(`/equipment/items/${ids.scba}/incidents`, officer).expect(200)).body;
    expect(used).toEqual([expect.objectContaining({ reportId: realReport, dispatchNumber: '2026-555', alarmKeyword: 'B2', location: 'Hauptstraße 1, Musterstadt', quantity: 1, inspectAfter: false })]);
  });

  it('records equipment used in a training session and makes after-use inspections due on closing', async () => {
    await post('/training/types/templates/bw', {}).expect(201);
    const start = new Date(Date.now() - 3 * 3_600_000).toISOString();
    const session = (await post('/training/sessions', { type: 'exercise', title: 'Atemschutzübung', startsAt: start, endsAt: new Date(Date.now() - 3_600_000).toISOString(), departmentIds: [ids.musterstadt] }).expect(201)).body.id as string;
    await put(`/equipment/sessions/${session}/usage`, [{ itemId: ids.scba, inspectAfter: true }], reporter).expect(404);
    await put('/equipment/sessions/01a16846-0000-7000-8000-00000000e009/usage', []).expect(404);
    await put(`/equipment/sessions/${session}/usage`, [{ itemId: ids.scba, inspectAfter: true }]).expect(200);
    expect((await get(`/equipment/sessions/${session}/usage`).expect(200)).body).toMatchObject([{ itemId: ids.scba, inspectAfter: true }]);
    // A training session does not appear among the incidents of the item.
    expect(((await get(`/equipment/items/${ids.scba}/incidents`, officer)).body as { reportId: string }[]).some((u) => u.reportId === session)).toBe(false);
    await put(`/training/sessions/${session}/attendance`, [{ personId: ids.max, status: 'present' }]).expect(200);
    await post(`/training/sessions/${session}/close`, {}).expect(200);
    // Closed: the usage cannot be changed any more.
    await put(`/equipment/sessions/${session}/usage`, []).expect(409);
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
    expect(((await get('/equipment/defects?open=true', officer)).body as { itemId: string }[]).filter((d) => d.itemId === ids.hose)).toHaveLength(0);
    expect(((await get('/equipment/items', officer)).body as { id: string }[]).map((i) => i.id)).toEqual(expect.arrayContaining([ids.scba, ids.ladder]));

    await del(`/masterdata/vehicles/${ids.lf}`).expect(409);

    for (const list of ['due', 'inventory', 'loading', 'inspections', 'defects', 'retired', 'stock']) await get(`/core/lists/equipment.${list}`, officer).expect(200);
    const loading = (await get('/core/lists/equipment.loading', officer)).body;
    expect(loading.rows).toContainEqual(expect.objectContaining({ vehicle: 'Florian Musterstadt 1/44', place: 'G1', name: 'Pressluftatmer 1' }));
    const tasks = (await get(`/core/tasks?asOf=${today}`, officer).expect(200)).body as { kind: string }[];
    expect(tasks.some((t) => t.kind === 'equipment-inspection')).toBe(true);
    const hits = (await get('/core/search?q=AS-PA', officer).expect(200)).body as { title: string }[];
    expect(hits.some((h) => h.title.includes('AS-PA-0001'))).toBe(true);

    // One row per inspection type: the last visual check and the last load test of the same ladder.
    const csv = 'Inventar-Nr.;Bezeichnung;Gerätetyp;Abteilung;Fahrzeug;Beladeplatz;Prüfart;letzte Prüfung\nL-0001;Steckleiter 4-teilig;Tragbare Leiter;Musterstadt;Florian Musterstadt 1/44;Dach;Sichtprüfung;01.03.2026\nL-0001;Steckleiter 4-teilig;Tragbare Leiter;Musterstadt;Florian Musterstadt 1/44;Dach;ladder-load;01.02.2025\n';
    const upload = await test.http.post('/api/core/imports').set('Cookie', officer).set(UI).attach('file', Buffer.from(csv, 'utf8'), 'inventar.csv').expect(201);
    const mapping = upload.body.suggestions['equipment.inventory'];
    const applied = await post(`/core/imports/${upload.body.id}/apply`, { profile: 'equipment.inventory', mapping }, officer).expect(200);
    expect(applied.body.counts).toMatchObject({ create: 1, update: 1, error: 0 });
    const ladder = ((await get('/equipment/items?q=L-0001', officer)).body as { dues: { key: string; lastDate: string | null }[]; vehicleId: string }[])[0];
    expect(ladder.vehicleId).toBe(ids.lf);
    expect(ladder.dues.find((d) => d.key === 'ladder-visual')?.lastDate).toBe('2026-03-01');
    expect(ladder.dues.find((d) => d.key === 'ladder-load')?.lastDate).toBe('2025-02-01');

    // A file with only some columns keeps the other fields; a "last inspection" without inspection type is reported.
    const partial = 'Inventar-Nr.;Bezeichnung;Abteilung;letzte Prüfung\nL-0001;Steckleiter;Musterstadt;01.04.2026\nOB-0001;Ölbinder;Musterstadt;01.04.2026\n';
    const second = await test.http.post('/api/core/imports').set('Cookie', officer).set(UI).attach('file', Buffer.from(partial, 'utf8'), 'teil.csv').expect(201);
    const partialMapping = second.body.suggestions['equipment.inventory'];
    const preview = await post(`/core/imports/${second.body.id}/preview`, { profile: 'equipment.inventory', mapping: partialMapping }, officer).expect(200);
    const discarded = (preview.body.rows as { label: string; messages: { code: string }[] }[]).find((r) => r.label.startsWith('OB-0001'));
    expect(discarded?.messages).toEqual([{ code: 'equipment.import.inspectionDiscarded', params: { date: '2026-04-01' } }]);
    const appliedPartial = await post(`/core/imports/${second.body.id}/apply`, { profile: 'equipment.inventory', mapping: partialMapping }, officer).expect(200);
    expect(appliedPartial.body.counts).toMatchObject({ update: 2, error: 0 });
    expect((appliedPartial.body.rows as { messages: { code: string }[] }[]).flatMap((r) => r.messages.map((m) => m.code))).toEqual(['equipment.import.inspectionDiscarded']);
    const kept = ((await get('/equipment/items?q=L-0001', officer)).body as { name: string; typeKey: string; vehicleId: string; loadingPlace: string; dues: { key: string; lastDate: string | null }[] }[])[0];
    expect(kept).toMatchObject({ name: 'Steckleiter', typeKey: 'portable-ladder', vehicleId: ids.lf, loadingPlace: 'Dach' });
    expect(kept.dues.find((d) => d.key === 'ladder-visual')?.lastDate).toBe('2026-04-01');
  });

  it('maps a blank department to a department and creates an unknown equipment type', async () => {
    const gesamt = (await post('/masterdata/departments', { name: 'Gesamtfeuerwehr', shortName: 'Gesamt', type: 'command' }).expect(201)).body.id as string;
    await post('/equipment/categories', { key: 'measuring', name: { de: 'Messgeräte', en: 'Measuring devices' } }).expect(201);
    const csv = 'Inventar-Nr.;Bezeichnung;Gerätetyp;Abteilung\nMG-1;Multigaswarngerät;Altair 4X Multigas Messgerät;\n';
    const upload = await test.http.post('/api/core/imports').set('Cookie', officer).set(UI).attach('file', Buffer.from(csv, 'utf8'), 'messgeraete.csv').expect(201);
    const mapping = upload.body.suggestions['equipment.inventory'];
    const preview = await post(`/core/imports/${upload.body.id}/preview`, { profile: 'equipment.inventory', mapping }, officer).expect(200);
    expect(preview.body.unmatched).toEqual([
      { kind: 'department', value: '', count: 1 },
      { kind: 'equipment-type', value: 'Altair 4X Multigas Messgerät', count: 1 },
    ]);
    expect(preview.body.counts).toMatchObject({ error: 1 });

    const lookups = (await get('/core/imports/lookups').expect(200)).body as { kind: string; creatable: boolean; createCategoryKind: string | null }[];
    expect(lookups.find((l) => l.kind === 'department')).toMatchObject({ creatable: false, createCategoryKind: null });
    expect(lookups.find((l) => l.kind === 'equipment-type')).toMatchObject({ creatable: true, createCategoryKind: 'equipment-category' });
    expect((await post('/core/imports/lookups/equipment-type', { key: 'altair-without-category', name: 'Altair' }).expect(400)).body.code).toBe('equipment.unknownCategory');
    const created = (await post('/core/imports/lookups/equipment-type', { key: 'altair-4x', name: 'Altair 4X Multigas Messgerät', categoryKey: 'measuring' }).expect(201)).body;
    expect(created).toMatchObject({ key: 'altair-4x', name: { de: 'Altair 4X Multigas Messgerät' } });
    expect((await post('/core/imports/lookups/equipment-type', { key: 'altair-4x', name: 'Altair', categoryKey: 'measuring' }).expect(400)).body.code).toBe('equipment.keyTaken');

    const applied = await post(`/core/imports/${upload.body.id}/apply`, {
      profile: 'equipment.inventory',
      mapping,
      mappings: { department: { '': gesamt }, 'equipment-type': { 'Altair 4X Multigas Messgerät': 'altair-4x' } },
    }, officer).expect(200);
    expect(applied.body).toMatchObject({ counts: { create: 1, error: 0 }, unmatched: [] });
    const item = ((await get('/equipment/items?q=MG-1', officer)).body as { departmentId: string; typeKey: string; categoryKey: string }[])[0];
    expect(item).toMatchObject({ departmentId: gesamt, typeKey: 'altair-4x', categoryKey: 'measuring' });

    // The next file has no department column; the blank cell and the type name are remembered.
    const againCsv = 'Inventar-Nr.;Bezeichnung;Gerätetyp\nMG-2;Zweites Messgerät;Altair 4X Multigas Messgerät\n';
    const again = await test.http.post('/api/core/imports').set('Cookie', officer).set(UI).attach('file', Buffer.from(againCsv, 'utf8'), 'messgeraete-2.csv').expect(201);
    const remembered = await post(`/core/imports/${again.body.id}/apply`, { profile: 'equipment.inventory', mapping: again.body.suggestions['equipment.inventory'] }, officer).expect(200);
    expect(remembered.body).toMatchObject({ counts: { create: 1, error: 0 }, unmatched: [] });
    const second = ((await get('/equipment/items?q=MG-2', officer)).body as { departmentId: string; typeKey: string }[])[0];
    expect(second).toMatchObject({ departmentId: gesamt, typeKey: 'altair-4x' });
  });

  it('deletes a category and keeps its subcategories and types', async () => {
    const parent = (await post('/equipment/categories', { key: 'spare', name: { de: 'Reserve', en: 'Spare' } }).expect(201)).body as { id: string };
    const child = (await post('/equipment/categories', { key: 'spare-child', name: { de: 'Kind', en: 'Child' }, parentKey: 'spare' }).expect(201)).body as { id: string };
    await post('/equipment/categories', { key: 'spare-grandchild', name: { de: 'Enkel', en: 'Grandchild' }, parentKey: 'spare-child' }).expect(201);
    await post('/equipment/types', { key: 'spare-type', name: { de: 'Typ', en: 'Type' }, categoryKey: 'spare-child' }).expect(201);

    await del(`/equipment/categories/${child.id}`).expect(204);
    const categories = (await get('/equipment/categories').expect(200)).body as { key: string; parentKey: string | null }[];
    expect(categories.find((c) => c.key === 'spare-child')).toBeUndefined();
    expect(categories.find((c) => c.key === 'spare-grandchild')).toMatchObject({ parentKey: 'spare' });
    const type = ((await get('/equipment/types').expect(200)).body as { key: string; categoryKey: string }[]).find((t) => t.key === 'spare-type');
    expect(type).toMatchObject({ categoryKey: 'spare' });

    const loose = (await post('/equipment/categories', { key: 'loose', name: { de: 'Lose', en: 'Loose' } }).expect(201)).body as { id: string };
    await post('/equipment/types', { key: 'loose-type', name: { de: 'Lose', en: 'Loose' }, categoryKey: 'loose' }).expect(201);
    expect((await del(`/equipment/categories/${loose.id}`).expect(400)).body.code).toBe('equipment.categoryHasTypes');

    await post('/equipment/items', { inventoryNumber: 'SP-1', name: 'Reserve', categoryKey: 'spare', departmentId: ids.musterstadt }).expect(201);
    expect((await del(`/equipment/categories/${parent.id}`).expect(400)).body.code).toBe('equipment.categoryInUse');
  });
});
