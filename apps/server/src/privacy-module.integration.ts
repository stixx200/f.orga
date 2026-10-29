import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

/**
 * The module `privacy` can be switched off (Verwaltung → Module): its pages and endpoints are gone, nobody is
 * restricted, consents do not filter lists, nothing is written to the read log; the security of the core keeps working.
 */
let test: TestApp;
let admin: string;
let adminUnconfirmed: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
const year = () => today().slice(0, 4);
const idsOf = (rows: { id: string }[]) => rows.map((r) => r.id);
const listRows = async (id: string, query: string) => (await get(`/core/lists/${id}?${query}`).expect(200)).body.rows as Record<string, unknown>[];
const phoneOf = (rows: Record<string, unknown>[], first: string) => rows.find((r) => String(r['name']).endsWith(first))?.['phoneMobile'];
const readLog = async (personId: string) => (await get(`/privacy/access-log?personId=${personId}`).expect(200)).body as { count: number }[];
const setActive = (active: boolean) => put('/core/modules/privacy', { active }).expect(200);

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  adminUnconfirmed = await test.login(undefined, { elevated: false });
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  ids.department = (await post('/masterdata/departments', { name: 'Abteilung Modul', shortName: 'Modul', type: 'operational' }).expect(201)).body.id;
  const person = async (firstName: string) =>
    (await post('/masterdata/persons', { firstName, lastName: 'Modul', status: 'active', phoneMobile: `0170 ${firstName.length}11111`, birthDate: '1990-05-12', memberships: [{ departmentId: ids.department, from: '2020-01-01', primary: true }] }).expect(201)).body
      .id as string;
  ids.anna = await person('Anna');
  ids.ben = await person('Ben');
  ids.carla = await person('Carla');
  // Consents for the phone list and the birthday posting: only Anna consents.
  const catalog = (await post('/privacy/consents/templates', {}).expect(200)).body as { consents: { key: string; version: number }[] };
  for (const c of catalog.consents) await post(`/privacy/consents/${c.key}/review`, { version: c.version }).expect(200);
  await post(`/privacy/persons/${ids.anna}/consents`, { key: 'phone-list-mobile', givenOn: today(), via: 'written' }).expect(201);
  await post(`/privacy/persons/${ids.anna}/consents`, { key: 'birthday-posting', givenOn: today(), via: 'written' }).expect(201);
  // Carla's processing is restricted, with a planned end (a task for data protection).
  await put(`/privacy/persons/${ids.carla}/restriction`, { reason: 'accuracy-contested', until: today() }).expect(200);
});

afterAll(() => test?.app.close());

describe('module privacy active', () => {
  it('restricts, filters lists by consent and logs reads', async () => {
    expect(idsOf((await get('/masterdata/persons').expect(200)).body)).not.toContain(ids.carla);
    expect((await get(`/masterdata/persons/${ids.carla}`).expect(200)).body.processingRestricted).toBe(true);
    expect(phoneOf(await listRows('masterdata.phones', `departmentId=${ids.department}`), 'Ben')).toBe('über Gruppenführer');
    const posting = await listRows('masterdata.birthdays', `from=${year()}-01-01&to=${year()}-12-31&departmentId=${ids.department}&purpose=posting`);
    expect(posting.map((r) => r['name'])).toEqual(['Modul, Anna']);
    expect(((await get(`/core/tasks?asOf=${today()}&all=true`).expect(200)).body as { kind: string }[]).some((t) => t.kind === 'restriction-ends')).toBe(true);
    expect((await readLog(ids.ben)).length).toBeGreaterThan(0);
    expect((await get('/core/modules').expect(200)).body.map((m: { id: string }) => m.id)).toContain('privacy');
  });
});

describe('module privacy switched off', () => {
  let logged: number;

  beforeAll(async () => {
    logged = (await readLog(ids.ben)).reduce((sum, r) => sum + r.count, 0);
    await setActive(false);
  });

  afterAll(() => setActive(true));

  it('answers its endpoints like other inactive modules, also the public notice', async () => {
    for (const path of ['/privacy/requests', '/privacy/register', `/privacy/persons/${ids.anna}`, '/privacy/access-log', '/privacy/me']) {
      expect((await get(path).expect(404)).body).toEqual({ code: 'modules.inactive', module: 'privacy' });
    }
    expect((await test.http.get('/api/privacy/notice').expect(404)).body.code).toBe('modules.inactive');
    expect((await test.http.get('/api/core/modules/kiosk/privacy-notice').expect(404)).body.code).toBe('modules.inactive');
    expect((await get('/core/modules').expect(200)).body.map((m: { id: string }) => m.id)).not.toContain('privacy');
    // Its permissions are not granted while it is off.
    expect(Object.keys((await get('/core/session').expect(200)).body.permissions)).not.toContain('privacy.manage');
  });

  it('restricts nobody: lists, search, person file and tasks show the person again', async () => {
    expect(idsOf((await get('/masterdata/persons').expect(200)).body)).toContain(ids.carla);
    expect((await get(`/masterdata/persons/${ids.carla}`).expect(200)).body.processingRestricted).toBe(false);
    expect(((await get('/core/search?q=Carla').expect(200)).body as { personId?: string }[]).some((h) => h.personId === ids.carla)).toBe(true);
    expect(((await get(`/core/tasks?asOf=${today()}&all=true`).expect(200)).body as { kind: string }[]).some((t) => t.kind === 'restriction-ends')).toBe(false);
  });

  it('has no consent management: lists behave as without consents', async () => {
    const phones = await listRows('masterdata.phones', `departmentId=${ids.department}`);
    expect(phoneOf(phones, 'Ben')).toBe('0170 311111');
    expect(phoneOf(phones, 'Anna')).toBe('0170 411111');
    const posting = await listRows('masterdata.birthdays', `from=${year()}-01-01&to=${year()}-12-31&departmentId=${ids.department}&purpose=posting`);
    expect(posting.map((r) => r['name'])).toEqual(expect.arrayContaining(['Modul, Anna', 'Modul, Ben', 'Modul, Carla']));
  });

  it('records nothing in the read log', async () => {
    await listRows('masterdata.phones', `departmentId=${ids.department}`);
    await get(`/masterdata/persons/${ids.ben}`).expect(200);
    await setActive(true);
    expect((await readLog(ids.ben)).reduce((sum, r) => sum + r.count, 0)).toBe(logged);
    await setActive(false);
  });

  it('keeps the security of the core: step-up, sessions, retention plan', async () => {
    expect((await get('/core/users', adminUnconfirmed).expect(403)).body.code).toBe('auth.stepUpRequired');
    await get('/core/users').expect(200);
    await get('/core/me/sessions').expect(200);
    await get('/core/settings/retention').expect(200);
    await get('/core/security/status').expect(200);
    // The register of processing activities belongs to the module; the core's measures stay registered.
    expect(((await get('/core/onboarding').expect(200)).body as { key: string }[]).map((i) => i.key)).not.toContain('privacyContacts');
  });
});

describe('module privacy switched on again', () => {
  it('restores restriction and consents as recorded', async () => {
    expect(idsOf((await get('/masterdata/persons').expect(200)).body)).not.toContain(ids.carla);
    expect(phoneOf(await listRows('masterdata.phones', `departmentId=${ids.department}`), 'Ben')).toBe('über Gruppenführer');
    expect(((await get('/core/onboarding').expect(200)).body as { key: string }[]).map((i) => i.key)).toContain('privacyContacts');
  });
});
