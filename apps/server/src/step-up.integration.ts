import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntityManager } from '@mikro-orm/core';
import { ApiToken, AuditEntry, generateSecret, hashSecret, MailService, totp, User, UserMfa } from '@forga/core-api';
import { ADMIN, setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let http: TestApp['http'];
/** Session as after a real login: not confirmed with the second factor. */
let admin: string;
let adminSecret = '';
let adminCodes: string[] = [];
const ids: Record<string, string> = {};
const CLERK = { username: 'kasse', password: 'kasse-geheim-123' };

const em = () => test.app.get(EntityManager).fork();
/** A code of the current time step; forgets the last used step first, so tests do not wait for the next 30 seconds. */
async function freshCode(username: string, secret: string): Promise<string> {
  const user = await em().findOneOrFail(User, { username });
  await em().nativeUpdate(UserMfa, { user }, { lastStep: null, failures: 0, lockedUntil: null, failureWindowStart: null });
  return totp(secret);
}
const stepUp = (cookie: string, body: object) => http.post('/api/core/step-up').set('Cookie', cookie).set(UI).send(body);
const endStepUp = (cookie: string) => http.post('/api/core/step-up/end').set('Cookie', cookie).set(UI).expect(204);
const session = async (cookie: string) => (await http.get('/api/core/session').set('Cookie', cookie).expect(200)).body;
const actions = async () => (await em().find(AuditEntry, {}, { orderBy: { timestamp: 'asc' } })).map((e) => e.action);

/** Sets up the factor of the logged-in user; returns secret and recovery codes. */
async function enrol(cookie: string, password: string): Promise<{ secret: string; codes: string[] }> {
  const started = await http.post('/api/core/mfa/enrolment').set('Cookie', cookie).set(UI).send({ password }).expect(200);
  const confirmed = await http.post('/api/core/mfa/enrolment/confirm').set('Cookie', cookie).set(UI).send({ code: totp(started.body.secret) }).expect(200);
  return { secret: started.body.secret, codes: confirmed.body.recoveryCodes };
}

beforeAll(async () => {
  process.env['FORGA_SECRET_KEY'] = randomBytes(32).toString('base64');
  test = await startTestApp();
  http = test.http;
  const elevated = await setUp(test);
  // Data for the read and write paths, created in a confirmed session.
  ids.department = (await http.post('/api/masterdata/departments').set('Cookie', elevated).set(UI).send({ name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  const person = await http.post('/api/masterdata/persons').set('Cookie', elevated).set(UI).send({
    firstName: 'Jonas',
    lastName: 'Keller',
    birthDate: '1990-05-01',
    notes: 'interne Notiz',
    memberships: [{ departmentId: ids.department, from: '2020-01-01', primary: true }],
  }).expect(201);
  ids.person = person.body.id;
  const role = await http.post('/api/core/roles').set('Cookie', elevated).set(UI).send({ name: 'Kasse', permissions: ['masterdata.persons.read', 'masterdata.persons.sensitive'] }).expect(201);
  ids.clerk = (await http.post('/api/core/users').set('Cookie', elevated).set(UI).send({ ...CLERK, displayName: 'Kasse', email: 'kasse@example.org', roles: [{ roleId: role.body.id, departmentId: null }] }).expect(201)).body.id;
  admin = await test.login(ADMIN, { elevated: false });
});

afterAll(async () => {
  delete process.env['FORGA_SECRET_KEY'];
  await test?.app.close();
});

describe('step-up without a factor', () => {
  it('reports the state of the session and asks for the second factor', async () => {
    const state = await session(admin);
    expect(state).toMatchObject({ elevatedUntil: null, mfa: { enrolled: false, available: true, passwordRequired: true } });
    expect(state.stepUpPermissions).toEqual(expect.arrayContaining(['core.users.manage', 'masterdata.persons.sensitive', 'respiratory-protection.examinations', 'backup.manage']));
    // The permissions are held (navigation), but take effect only after the step-up.
    expect(state.permissions['core.users.manage']).toBe('brigade');
    const refused = await http.get('/api/core/users').set('Cookie', admin).expect(403);
    expect(refused.body).toEqual({ code: 'auth.stepUpRequired', enrolled: false });
    expect((await http.get('/api/core/step-up').set('Cookie', admin).expect(403)).body.code).toBe('auth.stepUpRequired');
    // Without the permission at all it stays `auth.forbidden`.
    const clerk = await test.login(CLERK, { elevated: false });
    expect((await http.get('/api/core/users').set('Cookie', clerk).expect(403)).body.code).toBe('auth.forbidden');
  });
});

describe('enrolment', () => {
  it('needs the password and a valid code, and counts as step-up', async () => {
    expect((await http.post('/api/core/mfa/enrolment').set('Cookie', admin).set(UI).send({ password: 'falsch-falsch' }).expect(401)).body.code).toBe('auth.passwordRequired');
    const started = await http.post('/api/core/mfa/enrolment').set('Cookie', admin).set(UI).send({ password: ADMIN.password }).expect(200);
    expect(started.body.uri).toMatch(/^otpauth:\/\/totp\/f\.orga%20Feuerwehr%20Musterstadt%3Aadmin\?secret=[A-Z2-7]+&/);
    adminSecret = started.body.secret;
    const wrong = String((Number(totp(adminSecret)) + 1) % 1_000_000).padStart(6, '0');
    expect((await http.post('/api/core/mfa/enrolment/confirm').set('Cookie', admin).set(UI).send({ code: wrong }).expect(400)).body.code).toBe('auth.invalidCode');
    const confirmed = await http.post('/api/core/mfa/enrolment/confirm').set('Cookie', admin).set(UI).send({ code: totp(adminSecret) }).expect(200);
    adminCodes = confirmed.body.recoveryCodes;
    expect(adminCodes).toHaveLength(10);
    expect(Date.parse(confirmed.body.elevatedUntil) - Date.now()).toBeGreaterThan(29 * 60_000);

    // The secret is stored encrypted, the recovery codes as hashes only.
    const stored = await em().findOneOrFail(UserMfa, { user: { username: 'admin' } });
    expect(stored.secret).not.toContain(adminSecret);
    expect(stored.recoveryCodes).not.toContain(adminCodes[0]);
    expect(JSON.stringify(await session(admin))).not.toContain(adminSecret);

    await http.get('/api/core/users').set('Cookie', admin).expect(200);
    expect((await session(admin)).mfa).toMatchObject({ enrolled: true, recoveryCodesLeft: 10 });
    expect(await actions()).toContain('auth.mfa-enrolled');
    // A second enrolment does not replace the factor.
    expect((await http.post('/api/core/mfa/enrolment').set('Cookie', admin).set(UI).send({ password: ADMIN.password }).expect(409)).body.code).toBe('auth.mfaEnrolled');
  });

  it('shows the factor status in the user list', async () => {
    const users = (await http.get('/api/core/users').set('Cookie', admin).expect(200)).body as { username: string; mfaEnrolled: boolean; mfaNeeded: boolean }[];
    expect(users.find((u) => u.username === 'admin')).toMatchObject({ mfaEnrolled: true, mfaNeeded: true });
    expect(users.find((u) => u.username === 'kasse')).toMatchObject({ mfaEnrolled: false, mfaNeeded: true });
  });
});

describe('step-up', () => {
  it('ends early, then confirms again with a code, which counts only once (replay)', async () => {
    await endStepUp(admin);
    expect((await http.get('/api/core/users').set('Cookie', admin).expect(403)).body).toEqual({ code: 'auth.stepUpRequired', enrolled: true });
    const code = await freshCode('admin', adminSecret);
    const confirmed = await stepUp(admin, { code }).expect(200);
    expect(Date.parse(confirmed.body.elevatedUntil)).toBeGreaterThan(Date.now() + 29 * 60_000);
    expect((await session(admin)).elevatedUntil).toBe(confirmed.body.elevatedUntil);
    await http.get('/api/core/users').set('Cookie', admin).expect(200);
    await http.get('/api/core/step-up').set('Cookie', admin).expect(204);

    await endStepUp(admin);
    expect((await stepUp(admin, { code }).expect(400)).body.code).toBe('auth.invalidCode');
    expect(await actions()).toEqual(expect.arrayContaining(['auth.step-up', 'auth.step-up-failed']));
  });

  it('accepts each recovery code once', async () => {
    await endStepUp(admin);
    await stepUp(admin, { recoveryCode: adminCodes[0].toLowerCase() }).expect(200);
    expect((await session(admin)).mfa.recoveryCodesLeft).toBe(9);
    await endStepUp(admin);
    expect((await stepUp(admin, { recoveryCode: adminCodes[0] }).expect(400)).body.code).toBe('auth.invalidCode');
    const entry = (await em().find(AuditEntry, { action: 'auth.step-up' })).find((e) => e.details['factor'] === 'recovery-code');
    expect(entry?.details).toMatchObject({ recoveryCodesLeft: 9 });
  });

  it('locks after five wrong codes in the database', async () => {
    await freshCode('admin', adminSecret);
    for (let i = 0; i < 4; i++) expect((await stepUp(admin, { code: '000000' }).expect(400)).body.code).toBe('auth.invalidCode');
    expect((await stepUp(admin, { code: '000000' }).expect(429)).body.code).toBe('auth.stepUpLocked');
    // Locked even for the right code, also from another session.
    expect((await stepUp(admin, { code: totp(adminSecret) }).expect(429)).body.code).toBe('auth.stepUpLocked');
    const other = await test.login(ADMIN, { elevated: false });
    await stepUp(other, { recoveryCode: adminCodes[1] }).expect(429);
    const stored = await em().findOneOrFail(UserMfa, { user: { username: 'admin' } });
    expect(stored.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    await stepUp(admin, { code: await freshCode('admin', adminSecret) }).expect(200);
  });

  it('ends with a password change', async () => {
    await http.put('/api/core/password').set('Cookie', admin).set(UI).send({ current: ADMIN.password, new: 'neues-geheimnis-456' }).expect(200);
    expect((await session(admin)).elevatedUntil).toBeNull();
    await http.put('/api/core/password').set('Cookie', admin).set(UI).send({ current: 'neues-geheimnis-456', new: ADMIN.password }).expect(200);
    await stepUp(admin, { code: await freshCode('admin', adminSecret) }).expect(200);
  });
});

describe('sensitive data without confirmation', () => {
  it('leaves out sensitive person fields and refuses to write them', async () => {
    const clerk = await test.login(CLERK, { elevated: false });
    const person = (await http.get(`/api/masterdata/persons/${ids.person}`).set('Cookie', clerk).expect(200)).body;
    expect(person).toMatchObject({ sensitiveHidden: true, stepUpAvailable: true, notes: '' });
    expect(person.birthDate).toBeUndefined();
    // The history hides the sensitive fields as well.
    const history = await http.get(`/api/core/history/masterdata.person/${ids.person}`).set('Cookie', clerk);
    expect(JSON.stringify(history.body)).not.toContain('1990-05-01');

    // Writing a sensitive field is refused instead of silently ignored.
    const elevatedAdmin = admin;
    const current = (await http.get(`/api/masterdata/persons/${ids.person}`).set('Cookie', elevatedAdmin).expect(200)).body;
    const base = { version: current.version, firstName: 'Jonas', lastName: 'Keller', memberships: current.memberships };
    const adminLocked = await test.login(ADMIN, { elevated: false });
    expect((await http.put(`/api/masterdata/persons/${ids.person}`).set('Cookie', adminLocked).set(UI).send({ ...base, birthDate: '1991-01-01' }).expect(403)).body.code).toBe('auth.stepUpRequired');
    // Without sensitive fields the change goes through and keeps the hidden values.
    await http.put(`/api/masterdata/persons/${ids.person}`).set('Cookie', adminLocked).set(UI).send({ ...base, city: 'Musterstadt' }).expect(200);
    const after = (await http.get(`/api/masterdata/persons/${ids.person}`).set('Cookie', elevatedAdmin).expect(200)).body;
    expect(after).toMatchObject({ birthDate: '1990-05-01', notes: 'interne Notiz', city: 'Musterstadt', sensitiveHidden: false, stepUpAvailable: false });
  });

  it('redacts medical examinations and refuses to record them', async () => {
    const locked = await test.login(ADMIN, { elevated: false });
    const view = (await http.get(`/api/respiratory-protection/persons/${ids.person}`).set('Cookie', locked).expect(200)).body;
    expect(view.stepUpAvailable).toBe(true);
    const examination = { personId: ids.person, kind: 'examination', date: '2026-01-10', validUntil: '2027-01-10', result: 'no-concerns' };
    expect((await http.post('/api/respiratory-protection/evidence').set('Cookie', locked).set(UI).send(examination).expect(403)).body.code).toBe('auth.stepUpRequired');
    expect((await http.get(`/api/respiratory-protection/persons/${ids.person}`).set('Cookie', admin).expect(200)).body.stepUpAvailable).toBe(false);
  });

  it('offers lists with sensitive data, but creates them only after the step-up', async () => {
    const locked = await test.login(ADMIN, { elevated: false });
    const lists = (await http.get('/api/core/lists').set('Cookie', locked).expect(200)).body as { id: string; stepUp: boolean }[];
    expect(lists.find((l) => l.id === 'masterdata.birthdays')).toMatchObject({ stepUp: true });
    expect(lists.find((l) => l.id === 'masterdata.phones')).toMatchObject({ stepUp: false });
    expect((await http.get('/api/core/lists/masterdata.birthdays').set('Cookie', locked).expect(403)).body.code).toBe('auth.stepUpRequired');
    await http.get('/api/core/lists/masterdata.birthdays').set('Cookie', admin).expect(200);
  });

  it('protects single endpoints marked @StepUp (transfer files)', async () => {
    const locked = await test.login(ADMIN, { elevated: false });
    expect((await http.get('/api/compensation/runs/00000000-0000-7000-8000-000000000000/transfer.xml').set('Cookie', locked).expect(403)).body.code).toBe('auth.stepUpRequired');
    expect((await http.get('/api/compensation/runs/00000000-0000-7000-8000-000000000000/transfer.xml').set('Cookie', admin)).status).not.toBe(403);
  });
});

describe('API tokens', () => {
  it('never get permissions with step-up; existing ones lose them', async () => {
    const refused = await http.post('/api/core/tokens').set('Cookie', admin).set(UI).send({ name: 'Leitstelle', scopes: ['masterdata.persons.read', 'masterdata.persons.sensitive'] }).expect(400);
    expect(refused.body).toMatchObject({ code: 'tokens.stepUpScope', scopes: ['masterdata.persons.sensitive'] });

    // A token from before the update with such a scope.
    const plain = `forga_${generateSecret()}`;
    const fork = em();
    const user = fork.create(User, { username: 'api-token-alt', displayName: 'Alt', technical: true });
    fork.create(ApiToken, { name: 'Alt', user, scopes: ['masterdata.persons.read', 'masterdata.persons.sensitive'], prefix: plain.slice(0, 12), hash: hashSecret(plain), createdAt: new Date() });
    await fork.flush();
    const tokens = (await http.get('/api/core/tokens').set('Cookie', admin).expect(200)).body as { name: string; inactiveScopes: string[] }[];
    expect(tokens.find((t) => t.name === 'Alt')?.inactiveScopes).toEqual(['masterdata.persons.sensitive']);
    const person = (await http.get(`/api/masterdata/persons/${ids.person}`).set('Authorization', `Bearer ${plain}`).expect(200)).body;
    expect(person).toMatchObject({ sensitiveHidden: true, stepUpAvailable: false });
    expect(person.birthDate).toBeUndefined();
    await http.get('/api/core/lists/masterdata.birthdays').set('Authorization', `Bearer ${plain}`).expect(404);
  });
});

describe('impersonation', () => {
  it('starts unconfirmed and is confirmed with the factor of the administrator', async () => {
    const own = admin;
    const started = await http.post(`/api/core/users/${ids.clerk}/impersonate`).set('Cookie', own).set(UI).send({ reason: 'Test der Ansicht' }).expect(200);
    const impersonated = String(started.headers['set-cookie']).split(',').map((c) => c.trim().split(';')[0]).find((c) => c.startsWith('forga_session='))!;
    const state = await session(impersonated);
    expect(state).toMatchObject({ elevatedUntil: null, mfa: { enrolled: true } });
    expect((await http.get(`/api/masterdata/persons/${ids.person}`).set('Cookie', impersonated).expect(200)).body.stepUpAvailable).toBe(true);
    // The impersonated user has no factor; the administrator's counts.
    await stepUp(impersonated, { code: await freshCode('admin', adminSecret) }).expect(200);
    expect((await http.get(`/api/masterdata/persons/${ids.person}`).set('Cookie', impersonated).expect(200)).body.birthDate).toBe('1990-05-01');
    // Setting up a factor is not possible while acting as somebody else.
    expect((await http.post('/api/core/mfa/enrolment').set('Cookie', impersonated).set(UI).send({}).expect(403)).body.code).toBe('auth.impersonationNotAllowed');
    await http.post('/api/core/impersonation/end').set('Cookie', impersonated).set(UI).expect(200);
  });
});

describe('reset by an administrator', () => {
  it('removes the factor with a reason, ends the sessions and informs the user', async () => {
    const clerk = await test.login(CLERK, { elevated: false });
    await enrol(clerk, CLERK.password);
    expect((await session(clerk)).mfa.enrolled).toBe(true);

    const locked = await test.login(ADMIN, { elevated: false });
    expect((await http.delete(`/api/core/users/${ids.clerk}/mfa`).set('Cookie', locked).set(UI).send({ reason: 'Telefon verloren' }).expect(403)).body.code).toBe('auth.stepUpRequired');
    await http.delete(`/api/core/users/${ids.clerk}/mfa`).set('Cookie', admin).set(UI).send({}).expect(400);
    const adminId = (await session(admin)).user.id;
    expect((await http.delete(`/api/core/users/${adminId}/mfa`).set('Cookie', admin).set(UI).send({ reason: 'eigener' }).expect(403)).body.code).toBe('users.mfaResetSelf');

    const mail = test.app.get(MailService);
    const before = mail.sent.length;
    await http.delete(`/api/core/users/${ids.clerk}/mfa`).set('Cookie', admin).set(UI).send({ reason: 'Telefon verloren' }).expect(204);
    await http.get('/api/core/session').set('Cookie', clerk).expect(401);
    expect(mail.sent.slice(before)).toEqual([expect.objectContaining({ to: 'kasse@example.org', subject: 'f.orga: Zweiter Faktor zurückgesetzt' })]);
    const entry = await em().findOneOrFail(AuditEntry, { action: 'auth.mfa-reset' });
    expect(entry.details).toEqual({ userId: ids.clerk, reason: 'Telefon verloren' });
    const again = await test.login(CLERK, { elevated: false });
    expect((await session(again)).mfa.enrolled).toBe(false);
  });

  it('renews the recovery codes only in a confirmed session', async () => {
    const locked = await test.login(ADMIN, { elevated: false });
    expect((await http.post('/api/core/mfa/recovery-codes').set('Cookie', locked).set(UI).expect(403)).body.code).toBe('auth.stepUpRequired');
    const renewed = await http.post('/api/core/mfa/recovery-codes').set('Cookie', admin).set(UI).expect(200);
    expect(renewed.body.recoveryCodes).toHaveLength(10);
    await endStepUp(admin);
    expect((await stepUp(admin, { recoveryCode: adminCodes[2] }).expect(400)).body.code).toBe('auth.invalidCode');
    await stepUp(admin, { recoveryCode: renewed.body.recoveryCodes[0] }).expect(200);
    expect(await actions()).toContain('auth.recovery-codes-renewed');
  });
});

describe('without server key', () => {
  it('cannot set up a factor', async () => {
    const key = process.env['FORGA_SECRET_KEY'];
    delete process.env['FORGA_SECRET_KEY'];
    try {
      const clerk = await test.login(CLERK, { elevated: false });
      expect((await session(clerk)).mfa.available).toBe(false);
      expect((await http.post('/api/core/mfa/enrolment').set('Cookie', clerk).set(UI).send({ password: CLERK.password }).expect(503)).body.code).toBe('auth.mfaNoSecretKey');
      const onboarding = (await http.get('/api/core/onboarding').set('Cookie', admin).expect(200)).body as { key: string; done: boolean }[];
      expect(onboarding.find((i) => i.key === 'secretKey')).toMatchObject({ done: false });
    } finally {
      process.env['FORGA_SECRET_KEY'] = key;
    }
  });
});
