import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let personId: string;
let url: string;

const post = (path: string, body: unknown = {}) => test.http.post(`/api${path}`).set('Cookie', admin).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const del = (path: string) => test.http.delete(`/api${path}`).set('Cookie', admin).set(UI);
const keyOf = (link: string) => link.slice(link.indexOf('#k=') + 3);

beforeAll(async () => {
  process.env['FORGA_SECRET_KEY'] = randomBytes(32).toString('base64');
  process.env['FORGA_PUBLIC_URL'] = 'http://localhost:8080';
  test = await startTestApp();
  admin = await setUp(test);
  const departmentId = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  personId = (await post('/masterdata/persons', {
    firstName: 'Jonas',
    lastName: 'Keller',
    status: 'active',
    street: 'Hauptstraße 1',
    postalCode: '64711',
    city: 'Erbach',
    phoneMobile: '0170 1',
    email: 'jonas@example.org',
    bank: { iban: 'DE89370400440532013000', accountHolder: 'Jonas Keller' },
    memberships: [{ departmentId, from: '2020-01-01', primary: true }],
  }).expect(201)).body.id;
});

afterAll(async () => {
  await test?.app.close();
  delete process.env['FORGA_SECRET_KEY'];
  delete process.env['FORGA_PUBLIC_URL'];
});

describe('personal access', () => {
  it('gives a person a link and shows their file without bank details or examinations', async () => {
    await post('/respiratory-protection/evidence', { personId, kind: 'briefing', date: '2026-02-01', validUntil: '2027-02-01' }).expect(201);
    await post('/respiratory-protection/evidence', {
      personId,
      kind: 'examination',
      date: '2026-01-15',
      validUntil: '2029-01-15',
      result: 'no-concerns',
      restrictions: 'nur Filtergerät',
    }).expect(201);

    const created = await post(`/personal/persons/${personId}/link`).expect(201);
    url = created.body.url as string;
    expect(url).toContain('/personal#k=');
    expect(created.body.key.startsWith('fpa_')).toBe(true);

    const opened = await test.http.post('/api/personal/kiosk/session').set(UI).send({ key: keyOf(url) }).expect(200);
    const cookie = String(opened.headers['set-cookie']).split(';')[0];
    const file = await test.http.get('/api/personal/kiosk/file').set('Cookie', cookie).expect(200);
    expect(file.body).toMatchObject({ firstName: 'Jonas', lastName: 'Keller', street: 'Hauptstraße 1', city: 'Erbach' });
    expect(JSON.stringify(file.body)).not.toContain('DE89370400440532013000');
    expect(JSON.stringify(file.body)).not.toContain('nur Filtergerät');
    expect(file.body.respiratory.evidence.map((row: { kind: string }) => row.kind)).toEqual(['briefing']);
    expect(file.body.respiratory.color).toBeTruthy();

    await test.http.post('/api/personal/kiosk/session').set(UI).send({ key: 'fpa_nope' }).expect(401);
  });

  it('stops a revoked key', async () => {
    const opened = await test.http.post('/api/personal/kiosk/session').set(UI).send({ key: keyOf(url) }).expect(200);
    const cookie = String(opened.headers['set-cookie']).split(';')[0];
    await del(`/personal/persons/${personId}/link`).expect(200);
    await test.http.get('/api/personal/kiosk/file').set('Cookie', cookie).expect(401);
    expect((await get(`/personal/persons/${personId}/link`).expect(200)).body.active).toBe(false);
  });
});
