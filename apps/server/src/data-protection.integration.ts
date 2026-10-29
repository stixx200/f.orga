import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DigestService, MailService } from '@forga/core-api';
import { ADMIN, setUp, startTestApp, type TestApp, UI } from './testing/test-app';

/**
 * Data protection, phase 1 (concept `dokumentation/geplant/datenschutz.md`): HTTPS and security headers (L1), stages
 * of the installation (L6), injured persons in reports and excuses (L5), e-mails without health details (L18).
 */
let test: TestApp;
let admin: string;
let writer: string;
let reader: string;
let medic: string;
let leader: string;
let member: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const inDays = (days: number, time = '19:00') => `${new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)}T${time}:00+01:00`;

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/incidents/keywords/templates/bw', {}).expect(201);
  await post('/training/types/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.lf = (await post('/masterdata/vehicles', { designation: 'LF 20', vehicleType: 'lf-20', departmentId: ids.musterstadt }).expect(201)).body.id;
  const person = async (firstName: string) =>
    (await post('/masterdata/persons', { firstName, lastName: 'Test', status: 'active', memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id as string;
  ids.jonas = await person('Jonas');
  ids.max = await person('Max');
  ids.lena = await person('Lena');
  ids.mia = await person('Mia');

  const role = async (name: string, permissions: string[]) => (await post('/core/roles', { name, permissions }).expect(201)).body.id as string;
  const writeRole = await role('Test Schreiber', ['incidents.reports.read', 'incidents.reports.write']);
  const readRole = await role('Test Leser', ['incidents.reports.read']);
  const injuriesRole = await role('Test Verletzte', ['incidents.reports.read', 'incidents.injuries.read']);
  const leaderRole = await role('GF Dienste', ['training.read', 'training.attendance', 'training.self']);
  const readerRole = await role('Test Dienste lesen', ['training.read', 'training.self']);
  const user = async (username: string, roleId: string, personId: string | null = null) => {
    await post('/core/users', { username, displayName: username, password: 'auch-sehr-geheim', ...(personId ? { personId } : {}), roles: [{ roleId, departmentId: ids.musterstadt }] }).expect(201);
    return test.login({ username, password: 'auch-sehr-geheim' });
  };
  writer = await user('schreiber', writeRole, ids.max);
  reader = await user('leser', readRole);
  medic = await user('verletzte', injuriesRole);
  leader = await user('gruppenfuehrer', leaderRole, ids.lena);
  member = await user('mitglied', readerRole, ids.mia);
});

afterEach(() => {
  delete process.env.FORGA_STAGE;
  delete process.env.FORGA_PUBLIC_URL;
});

afterAll(() => test?.app.close());

describe('HTTPS and security headers (L1)', () => {
  it('sends the security headers on every response, HSTS only over HTTPS', async () => {
    for (const response of [await test.http.get('/api/core/setup'), await test.http.get('/api/core/session'), await test.http.get('/api/unknown')]) {
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(response.headers['content-security-policy']).toContain("script-src 'self'");
      expect(response.headers['referrer-policy']).toBe('same-origin');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['permissions-policy']).toContain('camera=(self)');
      expect(response.headers['permissions-policy']).toContain('microphone=()');
      expect(response.headers['strict-transport-security']).toBeUndefined();
    }
  });

  it('sets HSTS and Secure cookies behind a trusted TLS proxy', async () => {
    // Without FORGA_TRUST_PROXY the header of the proxy is not believed.
    const plain = await test.http.post('/api/core/login').set(UI).set('X-Forwarded-Proto', 'https').send(ADMIN).expect(200);
    expect(plain.headers['strict-transport-security']).toBeUndefined();
    expect(String(plain.headers['set-cookie'])).not.toMatch(/;\s*Secure/i);
    test.app.getHttpAdapter().getInstance().set('trust proxy', 'loopback');
    try {
      const secure = await test.http.post('/api/core/login').set(UI).set('X-Forwarded-Proto', 'https').send(ADMIN).expect(200);
      expect(secure.headers['strict-transport-security']).toMatch(/^max-age=\d+/);
      expect(String(secure.headers['set-cookie'])).toMatch(/;\s*Secure/i);
      const status = (await get('/core/security/status').set('X-Forwarded-Proto', 'https').expect(200)).body;
      expect(status).toMatchObject({ https: true, secureCookies: true });
    } finally {
      test.app.getHttpAdapter().getInstance().set('trust proxy', false);
    }
  });

  it('sends Secure cookies as soon as the address of f.orga is https', async () => {
    process.env.FORGA_PUBLIC_URL = 'https://forga.example.org';
    const login = await test.http.post('/api/core/login').set(UI).send(ADMIN).expect(200);
    expect(String(login.headers['set-cookie'])).toMatch(/;\s*Secure/i);
    expect((await get('/core/security/status').expect(200)).body).toEqual({ stage: 'development', https: false, publicUrlHttps: true, secureCookies: true });
    await get('/core/security/status', reader).expect(403);
  });

  it('shows the API documentation only to signed-in users', async () => {
    expect((await test.http.get('/api/docs').expect(401)).body.code).toBe('auth.required');
    await test.http.get('/api/docs/openapi.json').expect(401);
    const document = await get('/docs/openapi.json', reader).expect(200);
    expect(document.body.info.title).toBe('f.orga');
    await get('/docs/', reader).expect(200);
  });

  it('warns in the setup list while f.orga is opened over HTTP, except on the development machine', async () => {
    let items = (await get('/core/onboarding').expect(200)).body as { key: string; done: boolean }[];
    expect(items.some((i) => i.key === 'https')).toBe(false);
    process.env.FORGA_STAGE = 'production';
    items = (await get('/core/onboarding').expect(200)).body;
    expect(items[0]).toEqual({ key: 'https', done: false, to: '/admin/settings?tab=security' });
  });
});

describe('stages of the installation (L6)', () => {
  it('names the stage publicly for the band of the test system', async () => {
    expect((await test.http.get('/api/core/setup').expect(200)).body.stage).toBe('development');
    process.env.FORGA_STAGE = 'test';
    expect((await test.http.get('/api/core/setup').expect(200)).body.stage).toBe('test');
  });

  it('locks the import of persons in the test system, except for the demo data of the seed', async () => {
    const csv = 'Personalnummer;Vorname;Nachname;Abteilung\n9001;Paula;Demo;Musterstadt\n';
    const upload = async () => (await test.http.post('/api/core/imports').set('Cookie', admin).set(UI).attach('file', Buffer.from(csv, 'utf8'), 'personen.csv').expect(201)).body;
    process.env.FORGA_STAGE = 'test';
    const profiles = (await get('/core/imports/profiles').expect(200)).body as { id: string; lockedInTestStage: boolean }[];
    expect(profiles.find((p) => p.id === 'masterdata.persons')?.lockedInTestStage).toBe(true);
    expect(profiles.find((p) => p.id === 'training.sessions')?.lockedInTestStage).toBe(false);
    const first = await upload();
    const request = { profile: 'masterdata.persons', mapping: first.suggestions['masterdata.persons'] };
    expect((await post(`/core/imports/${first.id}/preview`, request).expect(403)).body.code).toBe('imports.lockedInTestStage');
    expect((await post(`/core/imports/${first.id}/apply`, request).expect(403)).body.code).toBe('imports.lockedInTestStage');
    const applied = await post(`/core/imports/${first.id}/apply`, { ...request, demoData: true }).expect(200);
    expect(applied.body.counts.create).toBe(1);
    const audit = (await get('/core/audit?action=imports.applied').expect(200)).body as { details: { profile: string; demoData?: boolean } }[];
    expect(audit[0].details).toMatchObject({ profile: 'masterdata.persons', demoData: true });
    // In production the profile is open.
    process.env.FORGA_STAGE = 'production';
    const second = await upload();
    await post(`/core/imports/${second.id}/preview`, { profile: 'masterdata.persons', mapping: second.suggestions['masterdata.persons'] }).expect(200);
  });

  it('locks the data transfer from MP-Feuer in the test system', async () => {
    process.env.FORGA_STAGE = 'test';
    const upload = await test.http.post('/api/mp-feuer/runs').set('Cookie', admin).set(UI).attach('files', Buffer.from('x'), 'MPTRA_Demo.zip').expect(403);
    expect(upload.body.code).toBe('mp-feuer.lockedInTestStage');
    expect((await post('/mp-feuer/runs/00000000-0000-7000-8000-000000000000/apply', {}).expect(403)).body.code).toBe('mp-feuer.lockedInTestStage');
    expect((await post('/mp-feuer/runs/00000000-0000-7000-8000-000000000000/dry-run', {}).expect(403)).body.code).toBe('mp-feuer.lockedInTestStage');
  });
});

describe('injured persons in reports (L5)', () => {
  it('shows injured and killed only to author, releasers and incidents.injuries.read; others see counts', async () => {
    const incident = (await post('/incidents/incidents', { alarmKeyword: 'B1', alarmedAt: inDays(-1, '13:05'), departmentIds: [ids.musterstadt] }).expect(201)).body;
    ids.report = incident.reports[0].id;
    // Max (user "schreiber") becomes the author: he records the injury. A releaser saving it would lock the report.
    await post(`/incidents/reports/${ids.report}/author`, { authorPersonId: ids.max }).expect(200);
    const current = (await get(`/incidents/reports/${ids.report}`, writer).expect(200)).body;
    await put(`/incidents/reports/${ids.report}`, {
      version: current.version,
      authorPersonId: ids.max,
      times: { alarmedAt: inDays(-1, '13:05'), returnedAt: inDays(-1, '15:50') },
      personnel: [
        { personId: ids.jonas, vehicleId: ids.lf, injured: true },
        { personId: ids.max, vehicleId: ids.lf },
      ],
    }, writer).expect(200);

    const view = async (cookie: string) => (await get(`/incidents/reports/${ids.report}`, cookie).expect(200)).body as { personnel: { personId: string; injured: boolean }[]; injuries: object };
    for (const cookie of [admin, writer, medic]) {
      const report = await view(cookie);
      expect(report.injuries).toEqual({ hidden: false, injured: 1, killed: 0, stepUpAvailable: false });
      expect(report.personnel.find((p) => p.personId === ids.jonas)?.injured).toBe(true);
    }
    const hidden = await view(reader);
    expect(hidden.injuries).toEqual({ hidden: true, injured: 1, killed: 0, stepUpAvailable: false });
    // The permission carries the step-up: without the second factor only the counts, with the offer to confirm.
    const unconfirmed = await test.login({ username: 'verletzte', password: 'auch-sehr-geheim' }, { elevated: false });
    const pending = await view(unconfirmed);
    expect(pending.injuries).toEqual({ hidden: true, injured: 1, killed: 0, stepUpAvailable: true });
    expect(pending.personnel.every((p) => !p.injured)).toBe(true);
    expect(hidden.personnel.every((p) => !p.injured)).toBe(true);

    // The history masks the values for the reader.
    const history = (await get(`/core/history/incidents.report/${ids.report}`, reader).expect(200)).body as { entity: string; changes: Record<string, { hidden?: boolean; new: unknown }> }[];
    const injuredChanges = history.filter((e) => e.entity === 'incidents.report_personnel' && 'injured' in e.changes).map((e) => e.changes['injured']);
    expect(injuredChanges.length).toBeGreaterThan(0);
    expect(injuredChanges.every((c) => c.hidden === true && c.new === null)).toBe(true);
    const visible = (await get(`/core/history/incidents.report/${ids.report}`, medic).expect(200)).body as { entity: string; changes: Record<string, { new: unknown }> }[];
    expect(visible.some((e) => e.entity === 'incidents.report_personnel' && e.changes['injured']?.new === true)).toBe(true);
  });

  it('keeps stored injuries when someone who cannot see them saves the personnel', async () => {
    const role = (await post('/core/roles', { name: 'Schreiber ohne Verfasser', permissions: ['incidents.reports.read', 'incidents.reports.write'] }).expect(201)).body.id;
    await post('/core/users', { username: 'schreiber2', displayName: 'Schreiber 2', password: 'auch-sehr-geheim', roles: [{ roleId: role, departmentId: ids.musterstadt }] }).expect(201);
    const other = await test.login({ username: 'schreiber2', password: 'auch-sehr-geheim' });
    const report = (await get(`/incidents/reports/${ids.report}`, other).expect(200)).body;
    expect(report.injuries.hidden).toBe(true);
    // Sends the personnel as it sees it (injured false) and tries to mark another person as killed.
    const personnel = report.personnel.map((p: { personId: string }) => ({ personId: p.personId, vehicleId: ids.lf, killed: p.personId === ids.max }));
    await put(`/incidents/reports/${ids.report}`, { version: report.version, authorPersonId: report.authorPersonId, times: report.times, personnel }, other).expect(200);
    const stored = (await get(`/incidents/reports/${ids.report}`).expect(200)).body as { personnel: { personId: string; injured: boolean; killed: boolean }[] };
    expect(stored.personnel.find((p) => p.personId === ids.jonas)).toMatchObject({ injured: true, killed: false });
    expect(stored.personnel.find((p) => p.personId === ids.max)).toMatchObject({ injured: false, killed: false });
  });

  it('keeps counting injured own forces in the annual statistics', async () => {
    const year = new Date(Date.now() - 86_400_000).getFullYear();
    const values = (await get(`/incidents/statistics/${year}`).expect(200)).body.values as { question: string; source: string; value: number }[];
    expect(values.find((v) => v.question === 'F26' && v.source === 'incidents')).toMatchObject({ value: 1 });
  });
});

describe('excuses (L5)', () => {
  it('takes the reason as a choice; the text is only for those who record the attendance', async () => {
    const session = (await post('/training/sessions', { type: 'exercise', title: 'Übung', startsAt: inDays(3), endsAt: inDays(3, '21:00'), departmentIds: [ids.musterstadt] }).expect(201)).body.id;
    await put(`/training/me/sessions/${session}/excuse`, { note: 'Spätdienst' }, member).expect(400);
    await put(`/training/me/sessions/${session}/excuse`, { reason: 'unknown' }, member).expect(400);
    const own = (await put(`/training/me/sessions/${session}/excuse`, { reason: 'work', note: 'Spätdienst' }, member).expect(200)).body;
    expect(own.own).toEqual({ status: 'excused', excuseReason: 'work', note: 'Spätdienst' });
    const row = async (cookie: string) => ((await get(`/training/sessions/${session}`, cookie).expect(200)).body.attendance as { personId: string; excuseReason: string; note: string }[]).find((a) => a.personId === ids.mia);
    expect(await row(leader)).toMatchObject({ excuseReason: 'work', note: 'Spätdienst' });
    expect(await row(member)).toMatchObject({ excuseReason: 'work', note: '' });
    const history = (await get(`/core/history/training.session/${session}`, member).expect(200)).body as { entity: string; changes: Record<string, { hidden?: boolean }> }[];
    expect(history.filter((e) => e.entity === 'training.attendance' && 'note' in e.changes).every((e) => e.changes['note'].hidden === true)).toBe(true);
  });
});

/** Jonas becomes a wearer (deadlines of the respiratory protection module); the administrator gets an e-mail address. */
const examination = async () => {
  await post(`/masterdata/persons/${ids.jonas}/qualifications`, { qualification: 'breathing-apparatus', acquiredOn: '2020-01-01' }).expect(201);
  const session = (await get('/core/session').expect(200)).body;
  const { roles } = (await get(`/core/users/${session.user.id}`).expect(200)).body;
  await put(`/core/users/${session.user.id}`, { username: 'admin', displayName: 'Admin', email: 'admin@example.org', roles }).expect(200);
};

describe('e-mails without health details (L18)', () => {

  it('counts deadlines with a health reference in the weekly e-mail instead of naming persons', async () => {
    await examination();
    const asOf = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
    const tasks = (await get(`/core/tasks?asOf=${asOf}`).expect(200)).body as { kind: string; health?: boolean; subject: { id: string } }[];
    expect(tasks.find((t) => t.kind === 'breathing-apparatus-examination' && t.subject.id === ids.jonas)?.health).toBe(true);

    const mail = test.app.get(MailService);
    await test.app.get(DigestService).send(asOf, { resend: true });
    const text = mail.sent.at(-1)!.text;
    expect(text).not.toContain('Eignungsuntersuchung erforderlich – Test, Jonas');
    expect(text).toMatch(/\d+ Frist(en)? im Bereich Atemschutz.* – in f\.orga ansehen/);
    // Other deadlines of the module (briefing) keep the name.
    expect(text).toContain('Atemschutz-Unterweisung fällig – Test, Jonas');

    // All deadlines without names.
    await put('/core/settings/security', { mailHealthWithoutNames: true, mailAllWithoutNames: true }).expect(200);
    await test.app.get(DigestService).send(asOf, { resend: true });
    expect(mail.sent.at(-1)!.text).not.toContain('Test, Jonas');
    // Switched off: names again.
    await put('/core/settings/security', { mailHealthWithoutNames: false, mailAllWithoutNames: false }).expect(200);
    await test.app.get(DigestService).send(asOf, { resend: true });
    expect(mail.sent.at(-1)!.text).toContain('Eignungsuntersuchung erforderlich – Test, Jonas');
    await put('/core/settings/security', { mailHealthWithoutNames: true, mailAllWithoutNames: false }).expect(200);
    // Only managers read the section.
    await get('/core/settings/security', reader).expect(403);
  });
});
