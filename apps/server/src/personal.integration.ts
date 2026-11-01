import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MailService } from '@forga/core-api';
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
    postalCode: '12345',
    city: 'Musterstadt',
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
    expect(file.body).toMatchObject({ firstName: 'Jonas', lastName: 'Keller', street: 'Hauptstraße 1', city: 'Musterstadt' });
    expect(JSON.stringify(file.body)).not.toContain('DE89370400440532013000');
    expect(JSON.stringify(file.body)).not.toContain('nur Filtergerät');
    expect(file.body.respiratory.evidence.map((row: { kind: string }) => row.kind)).toEqual(['briefing']);
    expect(file.body.respiratory.examinations).toEqual([{ date: '2026-01-15', validUntil: '2029-01-15', result: 'no-concerns' }]);
    expect(file.body.respiratory.color).toBeTruthy();

    await test.http.post('/api/personal/kiosk/session').set(UI).send({ key: 'fpa_nope' }).expect(401);

    const mail = test.app.get(MailService);
    const sent = mail.sent.length;
    expect((await post(`/personal/persons/${personId}/link/mail`).expect(201)).body.email).toBe('jonas@example.org');
    expect(mail.sent[sent]).toMatchObject({ to: 'jonas@example.org', subject: 'f.orga: Persönlicher Zugang / Personal access' });
    expect(mail.sent[sent]?.text).toContain(url);
  });

  it('stops a revoked key', async () => {
    const opened = await test.http.post('/api/personal/kiosk/session').set(UI).send({ key: keyOf(url) }).expect(200);
    const cookie = String(opened.headers['set-cookie']).split(';')[0];
    await del(`/personal/persons/${personId}/link`).expect(200);
    await test.http.get('/api/personal/kiosk/file').set('Cookie', cookie).expect(401);
    expect((await get(`/personal/persons/${personId}/link`).expect(200)).body.active).toBe(false);
  });

  it('refuses the link and the kiosk while processing is restricted', async () => {
    const departmentId = (await get('/masterdata/departments')).body[0].id as string;
    const restrictedId = (await post('/masterdata/persons', {
      firstName: 'Eva',
      lastName: 'Gesperrt',
      status: 'active',
      email: 'eva@example.org',
      memberships: [{ departmentId, from: '2020-01-01', primary: true }],
    }).expect(201)).body.id as string;
    await test.http.put(`/api/privacy/persons/${restrictedId}/restriction`).set('Cookie', admin).set(UI).send({ reason: 'retention' }).expect(200);
    expect((await post(`/personal/persons/${restrictedId}/link`).expect(403)).body.code).toBe('privacy.processingRestricted');

    await test.http.delete(`/api/privacy/persons/${restrictedId}/restriction`).set('Cookie', admin).set(UI).expect(204);
    const created = await post(`/personal/persons/${restrictedId}/link`).expect(201);
    const opened = await test.http.post('/api/personal/kiosk/session').set(UI).send({ key: keyOf(created.body.url as string) }).expect(200);
    const cookie = String(opened.headers['set-cookie']).split(';')[0];
    await test.http.put(`/api/privacy/persons/${restrictedId}/restriction`).set('Cookie', admin).set(UI).send({ reason: 'retention' }).expect(200);
    expect((await test.http.get('/api/personal/kiosk/file').set('Cookie', cookie).expect(403)).body.code).toBe('privacy.processingRestricted');
  });
});
