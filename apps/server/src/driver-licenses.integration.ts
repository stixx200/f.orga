import { randomBytes } from 'node:crypto';
import { EntityManager } from '@mikro-orm/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
/** Department commander of Musterstadt (role template, holds `masterdata.licenses.check`). */
let commander: string;
/** Department commander of Ahornfeld. */
let ahornfeld: string;
/** Group leader of Musterstadt: reads the personnel file, does not check licences. */
let leader: string;
/** Tobias, a member linked to his person. */
let member: string;
let terminal: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const kiosk = (body: object, cookie = terminal) => test.http.post('/api/info-terminal/kiosk/driver-license').set('Cookie', cookie).set(UI).send(body);
const sql = (statement: string, params: unknown[] = []) => test.app.get(EntityManager).getConnection().execute(statement, params);

const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const addMonths = (date: string, months: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

type File = {
  license: { classes: { class: string; expiresOn: string | null }[]; lastCheckedOn: string | null; lastCheckMethod: string | null; documentExpiresOn: string | null; expiryToVerify: boolean };
  state: string | null;
  monitored: boolean;
  dues: { kind: string; dueOn: string; classes: string[] }[];
  checks: { id: string; method: string; checkedOn: string; first: boolean; checkedBy: { name: string } | null; requestId: string | null; cancelledAt: string | null; selfDeclaration: string; device: string }[];
  requests: { id: string; reason: string; completedByCheckId: string | null; withdrawnAt: string | null }[];
  tokens: { id: string; kind: string; suffix: string; revokedAt: string | null }[];
  canCheck: boolean;
};
const file = async (personId: string, cookie = admin) => (await get(`/masterdata/persons/${personId}/driver-license`, cookie).expect(200)).body as File;
const tasks = async (asOf: string, cookie = commander) =>
  ((await get(`/core/tasks?asOf=${asOf}&all=true`, cookie).expect(200)).body as { kind: string; subject: { id: string }; dueOn: string; title: { de: string }; to?: string }[]).filter((t) => t.kind.startsWith('driver-license'));

const CLASSES = [
  { class: 'B', expiresOn: null },
  { class: 'BE', expiresOn: null },
  { class: 'C', expiresOn: '2031-04-16' },
  { class: 'CE', expiresOn: '2031-04-16' },
];
const check = (values: object = {}) => ({ checkedOn: today(), checkedById: ids.markus, originalPresented: true, classes: CLASSES, documentExpiresOn: '2034-04-16', note: '', ...values });

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  process.env['FORGA_SECRET_KEY'] = randomBytes(32).toString('base64');
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
  ids.station = (await post('/masterdata/stations', { name: 'Feuerwehrhaus Musterstadt', departmentId: ids.musterstadt }).expect(201)).body.id;
  const person = async (firstName: string, lastName: string, departmentId = ids.musterstadt, status = 'active') =>
    (await post('/masterdata/persons', { firstName, lastName, status, memberships: [{ departmentId, from: '2000-01-01', primary: true }] }).expect(201)).body.id as string;
  ids.markus = await person('Markus', 'Vogt');
  ids.tobias = await person('Tobias', 'Rief');
  ids.jana = await person('Jana', 'Fischer');
  ids.michael = await person('Michael', 'Bauer');
  ids.lena = await person('Lena', 'Brenner', ids.ahornfeld);
  ids.paul = await person('Paul', 'Passiv', ids.musterstadt, 'passive');
  await post(`/masterdata/persons/${ids.michael}/qualifications`, { qualification: 'machinist', acquiredOn: '2020-01-01' }).expect(201);

  const roles = (await get('/core/roles').expect(200)).body as { id: string; templateKey: string | null }[];
  const role = (key: string) => roles.find((r) => r.templateKey === key)!.id;
  const user = async (username: string, displayName: string, templateKey: string, departmentId: string, personId: string | null = null) => {
    await post('/core/users', { username, displayName, password: 'auch-sehr-geheim', ...(personId ? { personId } : {}), roles: [{ roleId: role(templateKey), departmentId }] }).expect(201);
    return test.login({ username, password: 'auch-sehr-geheim' });
  };
  commander = await user('kdt', 'Markus Vogt', 'department-commander', ids.musterstadt, ids.markus);
  ahornfeld = await user('kdt.ahornfeld', 'Kdt Ahornfeld', 'department-commander', ids.ahornfeld);
  leader = await user('gf.musterstadt', 'GF Musterstadt', 'group-leader', ids.musterstadt);
  member = await user('tobias', 'Tobias Rief', 'member', ids.musterstadt, ids.tobias);
});

afterAll(() => test?.app.close());

describe('driving licence checks: on-occasion mode', () => {
  it('starts in the on-occasion mode with C1, C1E, C, CE and the machinist as target group', async () => {
    expect((await get('/core/settings/masterdata.driverLicense').expect(200)).body).toEqual({
      mode: 'on-occasion', intervalMonths: 6, monitoredClasses: ['C1', 'C1E', 'C', 'CE'], driverQualifications: ['machinist'], leadDays: 30, selfCheck: false, inPersonEveryMonths: 12,
    });
    // The machinist without classes is monitored; the others have no class yet.
    expect(await file(ids.michael)).toMatchObject({ monitored: true, state: 'classes-missing', dues: [{ kind: 'driver-license-first-check' }] });
    expect(await file(ids.tobias)).toMatchObject({ monitored: false, state: null, dues: [] });
  });

  it('records a check with the original: the classes with their own expiry replace those of the person', async () => {
    await post(`/masterdata/persons/${ids.tobias}/driver-license/checks`, check({ originalPresented: false })).expect(400);
    expect((await post(`/masterdata/persons/${ids.tobias}/driver-license/checks`, check({ checkedOn: addDays(today(), 1) }), commander).expect(400)).body.code).toBe('masterdata.checkInFuture');
    const saved = (await post(`/masterdata/persons/${ids.tobias}/driver-license/checks`, check({ note: 'Ersterfassung' }), commander).expect(201)).body as File;
    expect(saved.license).toMatchObject({ classes: CLASSES, documentExpiresOn: '2034-04-16', lastCheckedOn: today(), lastCheckMethod: 'in-person', expiryToVerify: false });
    expect(saved.checks).toMatchObject([{ method: 'in-person', first: true, checkedBy: { name: 'Markus Vogt' } }]);
    expect(saved).toMatchObject({ monitored: true, state: 'checked', canCheck: true });
    // On-occasion: the only deadline is the expiry of C and CE.
    expect(saved.dues).toEqual([{ kind: 'driver-license-class-expires', dueOn: '2031-04-16', classes: ['C', 'CE'], inPerson: true }]);
    // The person file and the statistics read the classes; the person form cannot change them.
    const person = (await get(`/masterdata/persons/${ids.tobias}`).expect(200)).body;
    expect(person.driverLicense.classes.map((c: { class: string }) => c.class)).toEqual(['B', 'BE', 'C', 'CE']);
    const { id: _i, rank: _r, memberships: _m, qualifications: _q, ranks: _rs, honors: _h, offices: _o, restPeriods: _rp, sensitiveHidden: _s, status: _st, probationEndsOn: _p, probationDecidedOn: _pd, admittedOn: _a, leftOn: _l, exitReason: _e, anonymizedAt: _an, ...fields } = person;
    await put(`/masterdata/persons/${ids.tobias}`, { ...fields, driverLicense: { classes: [] } }).expect(200);
    expect((await file(ids.tobias)).license.classes).toHaveLength(4);
  });

  it('creates deadlines per class expiry, for the first check and on request, for the checkers only', async () => {
    await post(`/masterdata/persons/${ids.jana}/driver-license/checks`, check({ classes: [{ class: 'B', expiresOn: null }, { class: 'C1', expiresOn: addDays(today(), 10) }] }), commander).expect(201);
    const soon = await tasks(today());
    expect(soon).toContainEqual(expect.objectContaining({ kind: 'driver-license-class-expires', subject: expect.objectContaining({ id: ids.jana }), dueOn: addDays(today(), 10), title: expect.objectContaining({ de: 'Führerscheinklasse läuft ab: C1' }), to: `/masterdata/persons/${ids.jana}/driver-license` }));
    expect(soon).toContainEqual(expect.objectContaining({ kind: 'driver-license-first-check', subject: expect.objectContaining({ id: ids.michael }) }));
    expect(soon.some((t) => t.kind === 'driver-license-check-due')).toBe(false);
    expect((await tasks('2031-04-01')).filter((t) => t.subject.id === ids.tobias).map((t) => t.kind)).toEqual(['driver-license-class-expires']);
    // Group leaders and other departments have no such tasks.
    expect(await tasks(today(), leader)).toEqual([]);
    expect((await tasks(today(), ahornfeld)).some((t) => t.subject.id === ids.jana)).toBe(false);
  });

  it('requests a presentation with a reason that only the checkers see; the next check settles it', async () => {
    await post(`/masterdata/persons/${ids.tobias}/driver-license/requests`, { reason: 'Hinweis auf Fahrverbot', dueOn: addDays(today(), 14) }, leader).expect(403);
    await post(`/masterdata/persons/${ids.tobias}/driver-license/requests`, { reason: '', dueOn: addDays(today(), 14) }, commander).expect(400);
    const requested = (await post(`/masterdata/persons/${ids.tobias}/driver-license/requests`, { reason: 'Hinweis auf Fahrverbot', dueOn: addDays(today(), 14) }, commander).expect(201)).body as File;
    expect(requested).toMatchObject({ state: 'requested', requests: [{ reason: 'Hinweis auf Fahrverbot', completedByCheckId: null }] });
    const task = (await tasks(today())).find((t) => t.kind === 'driver-license-request')!;
    expect(task).toMatchObject({ subject: { id: ids.tobias }, title: { de: 'Führerschein erneut vorlegen' } });
    // The group leader reads the licence but neither the reason nor the stickers, and its history entries are masked.
    const read = await file(ids.tobias, leader);
    expect(read).toMatchObject({ canCheck: false, tokens: [], requests: [{ reason: '' }] });
    const history = (await get(`/core/history/masterdata.person/${ids.tobias}`, leader).expect(200)).body as { entity: string; changes: Record<string, { hidden?: boolean; new: unknown }> }[];
    const entry = history.find((e) => e.entity === 'masterdata.driver_license_request')!;
    expect(entry.changes['reason']).toMatchObject({ hidden: true, new: null });
    expect(JSON.stringify(history)).not.toContain('Fahrverbot');

    const settled = (await post(`/masterdata/persons/${ids.tobias}/driver-license/checks`, check(), commander).expect(201)).body as File;
    expect(settled.requests[0].completedByCheckId).toBe(settled.checks[0].id);
    expect(settled.checks[0].requestId).toBe(settled.requests[0].id);
    expect(settled.state).toBe('checked');
  });

  it('cancels a check with a reason; it stays in the list and no longer counts', async () => {
    const before = await file(ids.jana);
    const cancelled = (await post(`/masterdata/persons/${ids.jana}/driver-license/checks/${before.checks[0].id}/cancel`, { reason: 'falsche Person' }, commander).expect(200)).body as File;
    expect(cancelled.checks[0].cancelledAt).not.toBeNull();
    expect(cancelled).toMatchObject({ state: 'first-check-missing', license: { lastCheckedOn: null } });
    await post(`/masterdata/persons/${ids.jana}/driver-license/checks/${before.checks[0].id}/cancel`, { reason: 'noch einmal' }, commander).expect(409);
  });

  it('lists the target group of the own departments with their state', async () => {
    await get('/masterdata/driver-licenses', leader).expect(403);
    const overview = (await get('/masterdata/driver-licenses', commander).expect(200)).body as { mode: string; rows: { personId: string; state: string; lastCheck: { method: string } | null; token: boolean }[] };
    expect(overview.mode).toBe('on-occasion');
    const state = Object.fromEntries(overview.rows.map((r) => [r.personId, r.state]));
    expect(state).toEqual({ [ids.tobias]: 'checked', [ids.jana]: 'first-check-missing', [ids.michael]: 'classes-missing' });
    expect(((await get('/masterdata/driver-licenses', ahornfeld).expect(200)).body as { rows: unknown[] }).rows).toEqual([]);
    // Neither the licence of another department nor its checks are visible.
    await get(`/masterdata/persons/${ids.tobias}/driver-license`, ahornfeld).expect(404);
    await post(`/masterdata/persons/${ids.tobias}/driver-license/checks`, check(), ahornfeld).expect(404);
  });

  it('offers the proof for the municipality without reasons and the state as list templates', async () => {
    const proof = (await get(`/core/lists/masterdata.driver-license-checks?from=${addDays(today(), -1)}&to=${today()}`, commander).expect(200)).body as { rows: Record<string, unknown>[] };
    expect(proof.rows.map((r) => [r['name'], r['method'], r['original']])).toEqual([
      ['Rief, Tobias', 'Original vorgelegt', 'ja'],
      ['Rief, Tobias', 'Original vorgelegt', 'ja'],
    ]);
    expect(proof.rows[0]['classes']).toBe('B, BE, C bis 16.04.2031, CE bis 16.04.2031');
    expect(JSON.stringify(proof)).not.toContain('Fahrverbot');
    const state = (await get('/core/lists/masterdata.driver-licenses?state=classes-missing', commander).expect(200)).body as { rows: Record<string, unknown>[] };
    expect(state.rows.map((r) => r['name'])).toEqual(['Bauer, Michael']);
    // Not offered without the permission.
    await get('/core/lists/masterdata.driver-license-checks', leader).expect(404);
  });

  it('shows the own licence in "My area"', async () => {
    expect((await get('/masterdata/me/driver-license', member).expect(200)).body).toMatchObject({
      mode: 'on-occasion', monitored: true, state: 'checked', lastCheck: { method: 'in-person', checkedBy: 'Markus Vogt' }, next: { kind: 'driver-license-class-expires', dueOn: '2031-04-16' },
    });
  });
});

describe('stickers and self-checks at the info terminal', () => {
  it('registers a sticker only with the server key, as HMAC, once per person, audited', async () => {
    const key = process.env['FORGA_SECRET_KEY'];
    delete process.env['FORGA_SECRET_KEY'];
    expect((await post(`/masterdata/persons/${ids.tobias}/driver-license/tokens`, { kind: 'nfc', code: '04:A2:1F:7F:3A' }, commander).expect(503)).body.code).toBe('masterdata.noSecretKey');
    process.env['FORGA_SECRET_KEY'] = key;
    await post(`/masterdata/persons/${ids.tobias}/driver-license/tokens`, { kind: 'nfc', code: '04:A2:1F:7F:3A' }, leader).expect(403);
    const registered = (await post(`/masterdata/persons/${ids.tobias}/driver-license/tokens`, { kind: 'nfc', code: '04:a2:1f:7f:3a' }, commander).expect(201)).body as File;
    expect(registered.tokens).toMatchObject([{ kind: 'nfc', suffix: '7F3A', revokedAt: null }]);
    expect((await post(`/masterdata/persons/${ids.jana}/driver-license/tokens`, { kind: 'nfc', code: '04A21F7F3A' }, commander).expect(409)).body.code).toBe('masterdata.tokenTaken');
    const [stored] = await sql('select code_hash from masterdata.driver_license_token where person_id = ?', [ids.tobias]);
    expect(stored.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.code_hash).not.toContain('04A21F');
    const audit = (await get('/core/audit?action=masterdata.license-token-registered').expect(200)).body as { action: string; details: Record<string, unknown> }[];
    expect(audit).toContainEqual(expect.objectContaining({ action: 'masterdata.license-token-registered', details: expect.objectContaining({ personId: ids.tobias, suffix: '7F3A' }) }));
    // A sticker in the check dialog replaces the previous one.
    const replaced = (await post(`/masterdata/persons/${ids.jana}/driver-license/checks`, check({ token: { kind: 'barcode', code: 'FS-0001-JANA' } }), commander).expect(201)).body as File;
    expect(replaced.tokens).toMatchObject([{ kind: 'barcode', suffix: 'JANA' }]);
  });

  it('shows only the state at the terminal in the on-occasion mode', async () => {
    await put('/core/settings/brigade', { name: 'Feuerwehr Musterstadt', publicUrl: 'https://forga.example.org/' }).expect(200);
    const created = (await post('/info-terminal/terminals', { stationId: ids.station, name: 'Tablet Fahrzeughalle' }).expect(201)).body as { url: string };
    const opened = await test.http.post('/api/info-terminal/kiosk/session').set(UI).send({ key: created.url.slice(created.url.indexOf('#k=') + 3) }).expect(200);
    terminal = String(opened.headers['set-cookie']).split(';')[0];
    expect(opened.body.driverLicenseCheck).toBe(false);
    const view = (await kiosk({ code: '04A21F7F3A' }).expect(200)).body;
    expect(view).toMatchObject({ firstName: 'Tobias', lastName: 'Rief', state: 'off', next: { kind: 'driver-license-class-expires', dueOn: '2031-04-16' }, confirmed: null });
    expect(Object.keys(view).toSorted()).toEqual(['classes', 'confirmed', 'firstName', 'inPersonDueOn', 'lastCheck', 'lastName', 'next', 'state']);
    expect((await kiosk({ code: '04A21F7F3A', confirm: true }).expect(403)).body.code).toBe('info-terminal.licenseCheckOff');
  });

  it('accepts self-checks in the periodic mode with the self-declaration, never as a check with the original', async () => {
    await put('/core/settings/masterdata.driverLicense', { mode: 'periodic', intervalMonths: 6, selfCheck: true, inPersonEveryMonths: 12 }, commander).expect(403);
    await put('/core/settings/masterdata.driverLicense', { mode: 'periodic', intervalMonths: 6, selfCheck: true, inPersonEveryMonths: 12 }).expect(200);
    expect((await get('/info-terminal/kiosk/terminal', terminal).expect(200)).body.driverLicenseCheck).toBe(true);
    // Periodic: the interval after the latest check is a deadline.
    expect((await tasks(addMonths(today(), 6))).filter((t) => t.subject.id === ids.tobias).map((t) => t.kind)).toContain('driver-license-check-due');

    const view = (await kiosk({ code: '04-a2-1f-7f-3a' }).expect(200)).body;
    expect(view).toMatchObject({ state: 'allowed', inPersonDueOn: addMonths(today(), 12) });
    const confirmed = (await kiosk({ code: '04A21F7F3A', confirm: true, language: 'de' }).expect(200)).body;
    expect(confirmed.confirmed.nextDueOn).toBe(addMonths(today(), 6));
    const after = await file(ids.tobias);
    expect(after.checks[0]).toMatchObject({ method: 'transponder', checkedBy: null, device: 'Infoterminal Feuerwehrhaus Musterstadt · Tablet Fahrzeughalle', selfDeclaration: expect.stringContaining('Mein Führerschein ist gültig') });
    // A self-check never changes the classes and does not postpone the original.
    expect(after.license.classes).toHaveLength(4);
    expect(after.dues.find((d) => d.kind === 'driver-license-in-person-due')?.dueOn).toBe(addMonths(today(), 12));
    expect(after.license.lastCheckMethod).toBe('transponder');
  });

  it('refuses self-checks while the original is due and does not say why', async () => {
    await post(`/masterdata/persons/${ids.tobias}/driver-license/requests`, { reason: 'Unfall mit Dienstfahrzeug', dueOn: addDays(today(), 7) }, commander).expect(201);
    const view = (await kiosk({ code: '04A21F7F3A' }).expect(200)).body;
    expect(view.state).toBe('in-person');
    expect(JSON.stringify(view)).not.toContain('Unfall');
    expect((await kiosk({ code: '04A21F7F3A', confirm: true }).expect(409)).body.code).toBe('info-terminal.licenseInPerson');
    const open = (await file(ids.tobias)).requests.find((r) => !r.completedByCheckId)!;
    await post(`/masterdata/persons/${ids.tobias}/driver-license/requests/${open.id}/withdraw`, { reason: 'erledigt' }, commander).expect(200);
    expect((await kiosk({ code: '04A21F7F3A' }).expect(200)).body.state).toBe('allowed');
  });

  it('treats unknown and revoked stickers alike, limits unknown codes and logs them once', async () => {
    const tokens = (await file(ids.tobias)).tokens;
    await post(`/masterdata/persons/${ids.tobias}/driver-license/tokens/${tokens[0].id}/revoke`, { reason: 'verloren' }, commander).expect(200);
    expect((await kiosk({ code: '04A21F7F3A' }).expect(404)).body.code).toBe('info-terminal.licenseNotRegistered');
    const audit = (await get('/core/audit?action=masterdata.license-token-revoked').expect(200)).body as unknown[];
    expect(audit).toHaveLength(1);
    for (let i = 0; i < 9; i++) await kiosk({ code: `UNBEKANNT-${i}` }).expect(404);
    expect((await kiosk({ code: 'UNBEKANNT-X' }).expect(429)).body.code).toBe('info-terminal.tooManyRequests');
    // Blocked for a while, also for registered stickers.
    await kiosk({ code: 'FS-0001-JANA' }).expect(429);
    expect((await get('/core/audit?action=info-terminal.unknown-license-code').expect(200)).body).toHaveLength(1);
  });
});

describe('old data, data access request and anonymisation', () => {
  it('reads an old licence with one expiry date and turns its check date into a legacy check', async () => {
    await sql(`update masterdata.person set driver_license = ? where id = ?`, [JSON.stringify({ classes: ['B', 'C1', 'C1E'], expiresOn: '2027-03-01', lastCheckedOn: '2023-05-05' }), ids.lena]);
    const old = (await get(`/masterdata/persons/${ids.lena}`).expect(200)).body;
    expect(old.driverLicense).toMatchObject({ classes: [{ class: 'B', expiresOn: null }, { class: 'C1', expiresOn: '2027-03-01' }, { class: 'C1E', expiresOn: '2027-03-01' }], expiryToVerify: true, lastCheckedOn: '2023-05-05', lastCheckMethod: 'legacy' });
    const checked = (await post(`/masterdata/persons/${ids.lena}/driver-license/checks`, check({ checkedById: ids.lena, classes: [{ class: 'B', expiresOn: null }, { class: 'C1', expiresOn: '2027-03-01' }] }), ahornfeld).expect(201)).body as File;
    expect(checked.checks.map((c) => [c.method, c.checkedOn])).toEqual([['in-person', today()], ['legacy', '2023-05-05']]);
    expect(checked.license).toMatchObject({ expiryToVerify: false, lastCheckMethod: 'in-person' });
    // The statistics still read the class names.
    const [row] = await sql('select driver_license from masterdata.person where id = ?', [ids.lena]);
    expect(row.driver_license.classes).toEqual([{ class: 'B', expiresOn: null }, { class: 'C1', expiresOn: '2027-03-01' }]);
  });

  it('includes checks, requests and stickers without their hash in the data access request and removes them on anonymisation', async () => {
    const access = JSON.parse((await get(`/core/export/person/${ids.tobias}`).expect(200)).text) as { data: { masterdata: Record<string, Record<string, unknown>[]> } };
    expect(access.data.masterdata['driverLicenseChecks'].length).toBeGreaterThanOrEqual(3);
    expect(access.data.masterdata['driverLicenseRequests']).toHaveLength(2);
    expect(access.data.masterdata['driverLicenseTokens']).toHaveLength(1);
    expect(JSON.stringify(access)).not.toMatch(/codeHash|code_hash/);

    await post(`/masterdata/persons/${ids.tobias}/leave`, { leftOn: '2005-12-31', exitReason: 'own-request' }).expect(201);
    await put('/core/settings/privacy', { anonymizeLeftAfterYears: 10, auditRetentionMonths: 24 }).expect(200);
    await post('/core/retention/run', { dryRun: false }).expect(200);
    for (const table of ['driver_license_check', 'driver_license_request', 'driver_license_token']) {
      expect(await sql(`select id from masterdata.${table} where person_id = ?`, [ids.tobias])).toEqual([]);
    }
    expect((await get(`/masterdata/persons/${ids.tobias}`).expect(200)).body.driverLicense.classes).toEqual([]);
  });
});
