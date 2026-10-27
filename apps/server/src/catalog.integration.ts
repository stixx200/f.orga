import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
const ids: Record<string, string> = {};
const T = (time: string) => `2026-10-21T${time}:00+02:00`;

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const del = (path: string, cookie = admin) => test.http.delete(`/api${path}`).set('Cookie', cookie).set(UI);

const entry = async (kind: string, key: string) => (await post('/masterdata/catalog', { kind, key, name: { de: key, en: key } }).expect(201)).body.id as string;
/** Saves the report with the version currently stored. */
const saveReport = async (personnel: object[]) => {
  const current = await get(`/incidents/reports/${ids.report}`).expect(200);
  await put(`/incidents/reports/${ids.report}`, {
    version: current.body.version,
    times: { alarmedAt: T('13:05'), returnedAt: T('15:50') },
    situation: 'Rauch',
    actions: 'Belüftung',
    personnel,
  }).expect(200);
};

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/incidents/keywords/templates/bw', {}).expect(201);
  await put('/core/settings/duty-officer.general', { reportRequired: false }).expect(200);
  ids.department = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.person = (
    await post('/masterdata/persons', { firstName: 'Jonas', lastName: 'Test', status: 'active', memberships: [{ departmentId: ids.department, from: '2020-01-01', primary: true }] }).expect(201)
  ).body.id;
});

afterAll(() => test?.app.close());

describe('deleting catalog entries', () => {
  it('deletes an unused entry, only with the permission to manage catalogs', async () => {
    const id = await entry('honor', 'unused-honor');
    const role = await post('/core/roles', { name: 'Leser', permissions: ['masterdata.persons.read'] }).expect(201);
    await post('/core/users', { username: 'leser', displayName: 'Leser', password: 'auch-sehr-geheim', roles: [{ roleId: role.body.id, departmentId: null }] }).expect(201);
    const reader = await test.login({ username: 'leser', password: 'auch-sehr-geheim' });
    await del(`/masterdata/catalog/${id}`, reader).expect(403);

    await del(`/masterdata/catalog/${id}`).expect(204);
    expect((await get('/masterdata/catalog?kind=honor').expect(200)).body.map((e: { key: string }) => e.key)).not.toContain('unused-honor');
    await del(`/masterdata/catalog/${id}`).expect(404);
    // The deletion is kept in the history of the entry.
    const history = await get(`/core/history/masterdata.catalog_entry/${id}`).expect(200);
    expect(history.body.map((h: { action: string }) => h.action)).toContain('deleted');
  });

  it('refuses entries held by a person until the qualification is removed', async () => {
    const id = await entry('qualification', 'test-qualification');
    const held = await post(`/masterdata/persons/${ids.person}/qualifications`, { qualification: 'test-qualification', acquiredOn: '2024-01-01' }).expect(201);
    const conflict = await del(`/masterdata/catalog/${id}`).expect(409);
    expect(conflict.body).toMatchObject({ code: 'catalog.inUse', kind: 'qualification', key: 'test-qualification', usages: [{ module: 'masterdata', count: 1 }] });

    const qualification = held.body.qualifications.find((q: { qualification: string }) => q.qualification === 'test-qualification');
    await del(`/masterdata/persons/${ids.person}/qualifications/${qualification.id}`).expect(200);
    await del(`/masterdata/catalog/${id}`).expect(204);
  });

  it('refuses functions used in incident reports', async () => {
    const id = await entry('function', 'test-function');
    const incident = await post('/incidents/incidents', { alarmKeyword: 'B2', alarmedAt: T('13:05'), departmentIds: [ids.department] }).expect(201);
    ids.report = incident.body.reports[0].id;
    await saveReport([{ personId: ids.person, function: 'test-function' }]);

    const conflict = await del(`/masterdata/catalog/${id}`).expect(409);
    expect(conflict.body).toMatchObject({ code: 'catalog.inUse', usages: [{ module: 'incidents', count: 1 }] });

    await saveReport([{ personId: ids.person, function: null }]);
    await del(`/masterdata/catalog/${id}`).expect(204);
  });

  it('refuses entries referenced in module settings', async () => {
    const office = await entry('office', 'test-office');
    const allowance = { key: 'test-allowance', name: { de: 'Test', en: 'Test' }, amount: 100, office: 'test-office' };
    await put('/core/settings/compensation.general', { functionAllowances: [allowance] }).expect(200);
    expect((await del(`/masterdata/catalog/${office}`).expect(409)).body).toMatchObject({ code: 'catalog.inUse', usages: [{ module: 'compensation', count: 1 }] });
    await put('/core/settings/compensation.general', { functionAllowances: [] }).expect(200);
    await del(`/masterdata/catalog/${office}`).expect(204);

    // A rank in a promotion rule and a qualification in the membership rules.
    const rank = await entry('rank', 'test-rank');
    const qualification = await entry('qualification', 'test-probation');
    const rule = { key: 'test', rank: 'test-rank', description: { de: 'Test', en: 'Test' }, condition: { type: 'qualification', keys: ['test-probation'] } };
    await put('/core/settings/promotions.general', { rules: [rule] }).expect(200);
    await put('/core/settings/masterdata.membership', { probationQualifications: ['test-probation'] }).expect(200);
    expect((await del(`/masterdata/catalog/${rank}`).expect(409)).body.usages).toEqual([{ module: 'promotions', count: 1 }]);
    expect((await del(`/masterdata/catalog/${qualification}`).expect(409)).body.usages).toEqual([
      { module: 'masterdata', count: 1 },
      { module: 'promotions', count: 1 },
    ]);
    await put('/core/settings/promotions.general', { rules: [] }).expect(200);
    await put('/core/settings/masterdata.membership', { probationQualifications: [] }).expect(200);
    await del(`/masterdata/catalog/${rank}`).expect(204);
    await del(`/masterdata/catalog/${qualification}`).expect(204);
  });

  it('never deletes entries the code relies on', async () => {
    const id = await entry('qualification', 'breathing-apparatus');
    const conflict = await del(`/masterdata/catalog/${id}`).expect(409);
    expect(conflict.body.code).toBe('catalog.required');
    expect(conflict.body.modules).toEqual(expect.arrayContaining(['masterdata', 'incidents', 'respiratory-protection']));
    const duty = await entry('function', 'duty-officer');
    expect((await del(`/masterdata/catalog/${duty}`).expect(409)).body).toMatchObject({ code: 'catalog.required', modules: ['duty-officer'] });
  });
});
