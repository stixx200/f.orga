import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DUTY_KIND_TEMPLATE, DUTY_OFFICER_ROSTER } from '@forga/duty-officer-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
let server: Server;
/** Address of the local calendar server, with a secret token in path and query. */
let calendar: string;
let page: string;

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);

const ics = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:evd-43@kalender',
  'SUMMARY:EvD Jonas Test',
  'DTSTART;VALUE=DATE:20261019',
  'DTEND;VALUE=DATE:20261026',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url?.startsWith('/private-s3cr3t/evd.ics')) {
      res.writeHead(200, { 'content-type': 'text/calendar' });
      res.end(ics);
    } else {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html>no calendar</html>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  calendar = `webcal://127.0.0.1:${port}/private-s3cr3t/evd.ics?token=geheim`;
  page = `http://127.0.0.1:${port}/index.html`;

  process.env['FORGA_SECRET_KEY'] = randomBytes(32).toString('base64');
  test = await startTestApp();
  admin = await setUp(test);
  await put('/core/settings/duty-officer.general', { reportRequired: true, dutyKinds: DUTY_KIND_TEMPLATE }).expect(200);
  const department = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  await post('/masterdata/persons', { firstName: 'Jonas', lastName: 'Test', status: 'active', memberships: [{ departmentId: department, from: '2020-01-01', primary: true }] }).expect(201);
});

afterAll(async () => {
  delete process.env['FORGA_IMPORT_URL_ALLOW_PRIVATE'];
  delete process.env['FORGA_SECRET_KEY'];
  await test?.app.close();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe('calendar import from an address', () => {
  it('refuses local addresses unless FORGA_IMPORT_URL_ALLOW_PRIVATE is set', async () => {
    delete process.env['FORGA_IMPORT_URL_ALLOW_PRIVATE'];
    expect((await post('/core/imports/url', { url: calendar }).expect(400)).body.code).toBe('imports.urlForbidden');
    expect((await post('/core/imports/url', { url: 'ftp://example.org/evd.ics' }).expect(400)).body.code).toBe('imports.urlInvalid');
    process.env['FORGA_IMPORT_URL_ALLOW_PRIVATE'] = 'true';
  });

  it('refuses content that is no calendar', async () => {
    expect((await post('/core/imports/url', { url: page }).expect(400)).body.code).toBe('imports.urlNotCalendar');
  });

  it('loads the calendar like an uploaded file and imports the duty roster; the audit log shows no token', async () => {
    const upload = await post('/core/imports/url', { url: calendar, remember: true }).expect(201);
    expect(upload.body).toMatchObject({ fileName: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/…$/), rowCount: 1, headers: expect.arrayContaining(['UID', 'SUMMARY']) });
    const mapping = upload.body.suggestions['duty-officer.roster'];
    expect(mapping).toMatchObject({ uid: 'UID', title: 'SUMMARY', from: 'DTSTART', to: 'DTEND' });
    const preview = await post(`/core/imports/${upload.body.id}/preview`, { profile: 'duty-officer.roster', mapping }).expect(200);
    expect(preview.body.counts).toMatchObject({ create: 1, error: 0 });
    const applied = await post(`/core/imports/${upload.body.id}/apply`, { profile: 'duty-officer.roster', mapping }).expect(200);
    expect(applied.body.counts).toMatchObject({ create: 1 });
    expect((await get('/duty-officer/roster?from=2026-10-01&to=2026-10-31').expect(200)).body).toHaveLength(1);

    const audit = JSON.stringify((await get('/core/audit').expect(200)).body);
    expect(audit).toContain('imports.applied');
    expect(audit).not.toMatch(/s3cr3t|geheim/);
  });

  it('remembers the address only for the user, shows it masked, loads it again with one click and forgets it', async () => {
    const remembered = (await get('/core/imports/url').expect(200)).body;
    expect(remembered).toEqual({ canRemember: true, remembered: { display: expect.stringMatching(/^http:\/\/127\.0\.0\.1:\d+\/…$/), savedAt: expect.any(String) } });
    expect(JSON.stringify(remembered)).not.toMatch(/s3cr3t|geheim/);

    const again = await post('/core/imports/url', {}).expect(201);
    expect(again.body.rowCount).toBe(1);
    const applied = await post(`/core/imports/${again.body.id}/apply`, { profile: 'duty-officer.roster', mapping: again.body.suggestions['duty-officer.roster'] }).expect(200);
    expect(applied.body.counts).toMatchObject({ create: 0, unchanged: 1 });

    // Other users do not see it.
    const role = (await post('/core/roles', { name: 'Dienstplan', permissions: [DUTY_OFFICER_ROSTER] }).expect(201)).body;
    await post('/core/users', { username: 'planer', displayName: 'Planer', password: 'auch-sehr-geheim', roles: [{ roleId: role.id, departmentId: null }] }).expect(201);
    const other = await test.login({ username: 'planer', password: 'auch-sehr-geheim' });
    expect((await get('/core/imports/url', other).expect(200)).body.remembered).toBeNull();
    expect((await post('/core/imports/url', {}, other).expect(404)).body.code).toBe('imports.urlNotRemembered');

    await test.http.delete('/api/core/imports/url').set('Cookie', admin).set(UI).expect(204);
    expect((await get('/core/imports/url').expect(200)).body.remembered).toBeNull();
    expect((await post('/core/imports/url', {}).expect(404)).body.code).toBe('imports.urlNotRemembered');
  });

  it('does not remember without a server key', async () => {
    const key = process.env['FORGA_SECRET_KEY'];
    delete process.env['FORGA_SECRET_KEY'];
    await post('/core/imports/url', { url: calendar, remember: true }).expect(201);
    expect((await get('/core/imports/url').expect(200)).body).toEqual({ canRemember: false, remembered: null });
    process.env['FORGA_SECRET_KEY'] = key;
  });
});
