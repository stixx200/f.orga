import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MailService } from '@forga/core-api';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let member: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const del = (path: string, cookie = admin) => test.http.delete(`/api${path}`).set('Cookie', cookie).set(UI);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const inHours = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/training/types/templates/bw', {}).expect(201);
  await post('/equipment/templates/dguv', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
  ids.lena = (await post('/masterdata/persons', { firstName: 'Lena', lastName: 'Test', status: 'active', email: 'lena@example.org', notes: 'Intern: Gespräch geplant', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id;
  ids.other = (await post('/masterdata/persons', { firstName: 'Otto', lastName: 'Anders', status: 'active', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id;
  await post(`/masterdata/persons/${ids.lena}/qualifications`, { qualification: 'breathing-apparatus', acquiredOn: '2021-01-01' }).expect(201);

  const roles = (await get('/core/roles')).body as { id: string; templateKey: string }[];
  const role = roles.find((r) => r.templateKey === 'member')!.id;
  await post('/core/users', { username: 'lena', displayName: 'Lena Test', password: 'auch-sehr-geheim', personId: ids.lena, roles: [{ roleId: role, departmentId: ids.musterstadt }] }).expect(201);
  member = await test.login({ username: 'lena', password: 'auch-sehr-geheim' });
  const officer = roles.find((r) => r.templateKey === 'equipment-officer')!.id;
  await post('/core/users', { username: 'gw.musterstadt', displayName: 'GW Musterstadt', email: 'gw.musterstadt@example.org', password: 'auch-sehr-geheim', roles: [{ roleId: officer, departmentId: ids.musterstadt }] }).expect(201);
  await post('/core/users', { username: 'gw.ahornfeld', displayName: 'GW Ahornfeld', email: 'gw.ahornfeld@example.org', password: 'auch-sehr-geheim', roles: [{ roleId: officer, departmentId: ids.ahornfeld }] }).expect(201);

  ids.session = (await post('/training/sessions', { type: 'exercise', title: 'Übung Löschangriff', startsAt: inHours(48), endsAt: inHours(50), departmentIds: [ids.musterstadt] }).expect(201)).body.id;
  ids.foreign = (await post('/training/sessions', { type: 'exercise', title: 'Übung Ahornfeld', startsAt: inHours(48), endsAt: inHours(50), departmentIds: [ids.ahornfeld] }).expect(201)).body.id;
  ids.item = (await post('/equipment/items', { inventoryNumber: 'LE-0007', name: 'Steckleiter', typeKey: 'portable-ladder', categoryKey: 'ladders', departmentId: ids.musterstadt }).expect(201)).body.id;
});

afterAll(() => test?.app.close());

describe('my area', () => {
  it('shows the own file without internal notes and nothing else', async () => {
    const me = (await get('/masterdata/me', member).expect(200)).body;
    expect(me).toMatchObject({ id: ids.lena, firstName: 'Lena', notes: '', sensitiveHidden: false });
    await get(`/masterdata/persons/${ids.other}`, member).expect(403);
    await get('/masterdata/me').expect(404);
  });

  it('changes contact details and bank account with history', async () => {
    const me = (await get('/masterdata/me', member).expect(200)).body;
    const updated = (await put('/masterdata/me', { version: me.version, street: 'Neue Straße 1', postalCode: '12345', city: 'Musterstadt', phonePrivate: '', phoneMobile: '0170 1234567', phoneWork: '', email: 'lena@example.org', bank: { iban: 'DE02120300000000202051', accountHolder: 'Lena Test' } }, member).expect(200)).body;
    expect(updated).toMatchObject({ street: 'Neue Straße 1', phoneMobile: '0170 1234567', bank: { iban: 'DE02120300000000202051' } });
    // Other fields cannot be changed this way, and a stale version is refused.
    await put('/masterdata/me', { version: me.version, street: 'Alt', postalCode: '', city: '', phonePrivate: '', phoneMobile: '', phoneWork: '', email: '' }, member).expect(409);
    const file = (await get(`/masterdata/persons/${ids.lena}`).expect(200)).body;
    expect(file).toMatchObject({ firstName: 'Lena', street: 'Neue Straße 1', notes: 'Intern: Gespräch geplant' });
  });

  it('lists sessions of the own departments and takes excuses in advance', async () => {
    const mine = (await get('/training/me', member).expect(200)).body;
    expect(mine.upcoming.map((s: { id: string }) => s.id)).toEqual([ids.session]);
    expect(mine.year).toEqual({ sessions: 0, present: 0, excused: 0 });

    const excused = (await put(`/training/me/sessions/${ids.session}/excuse`, { reason: 'work', note: 'Spätdienst' }, member).expect(200)).body;
    expect(excused.own).toEqual({ status: 'excused', excuseReason: 'work', note: 'Spätdienst' });
    const session = (await get(`/training/sessions/${ids.session}`).expect(200)).body;
    expect(session.attendance).toEqual([expect.objectContaining({ personId: ids.lena, status: 'excused', note: 'Spätdienst' })]);
    await put(`/training/me/sessions/${ids.foreign}/excuse`, { reason: 'private' }, member).expect(404);

    expect((await del(`/training/me/sessions/${ids.session}/excuse`, member).expect(200)).body.own).toBeNull();
  });

  it('shows the own respiratory protection status', async () => {
    const own = (await get('/respiratory-protection/me', member).expect(200)).body;
    expect(own.status).toMatchObject({ personId: ids.lena, color: 'red' });
    await get(`/respiratory-protection/persons/${ids.lena}`, member).expect(403);
    // The wearer is reminded of her own missing evidence.
    const tasks = (await get('/core/tasks', member).expect(200)).body as { kind: string; subject: { type: string } }[];
    expect(tasks.find((t) => t.kind === 'breathing-apparatus-own-examination')).toMatchObject({ subject: { type: 'core.me' } });
    expect(tasks.some((t) => t.kind === 'breathing-apparatus-examination')).toBe(false);
  });

  it('reports a defect found by inventory number and lists the own reports', async () => {
    const found = (await get('/equipment/me/items?q=LE-00', member).expect(200)).body;
    expect(found).toEqual([{ id: ids.item, inventoryNumber: 'LE-0007', name: 'Steckleiter', place: '' }]);
    await post(`/equipment/items/${ids.item}/defects`, { description: 'Sprosse locker' }, member).expect(201);
    // The reporter attaches a photo to the open defect; the content must match the type.
    const defectId = (await get('/equipment/me/defects', member).expect(200)).body[0].id as string;
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const attach = (body: Buffer, name: string, type: string, cookie = member) => test.http.post(`/api/core/attachments?type=equipment.defect&id=${defectId}`).set('Cookie', cookie).set(UI).attach('file', body, { filename: name, contentType: type });
    const photo = (await attach(png, 'Sprosse.png', 'image/png').expect(201)).body;
    expect(photo).toMatchObject({ fileName: 'Sprosse.png', contentType: 'image/png', createdBy: 'Lena Test' });
    expect((await attach(Buffer.from('kein Bild'), 'falsch.png', 'image/png').expect(400)).body.code).toBe('attachments.type');
    const file = await get(`/core/attachments/${photo.id}/file`, member).expect(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect((await get(`/core/attachments?type=equipment.defect&id=${defectId}`).expect(200)).body).toHaveLength(1);
    await get(`/core/attachments?type=gibt-es-nicht&id=${defectId}`).expect(404);

    // Only the equipment officer of the department is told.
    const mails = test.app.get(MailService).sent.filter((m) => m.subject.includes('LE-0007'));
    expect(mails.map((m) => m.to)).toEqual(['gw.musterstadt@example.org']);
    expect(mails[0].text).toContain('Sprosse locker');
    expect((await get('/equipment/me/defects', member).expect(200)).body).toEqual([expect.objectContaining({ itemId: ids.item, description: 'Sprosse locker', reportedBy: 'Lena Test' })]);
    expect((await get('/equipment/me/defects').expect(200)).body).toEqual([]);
  });
});
