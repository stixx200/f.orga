import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MailService, PasswordResetService } from '@forga/core-api';
import { setUp, startTestApp, type TestApp, UI, TOKEN_FIELDS } from './testing/test-app';

let test: TestApp;
let admin: string;
const ids: Record<string, string> = {};
const roles: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const del = (path: string, cookie = admin) => test.http.delete(`/api${path}`).set('Cookie', cookie).set(UI);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const user = async (username: string, roleIds: { roleId: string; departmentId?: string | null }[], extra: Record<string, unknown> = {}) =>
  (await post('/core/users', { username, displayName: username, password: `${username}-passwort-1`, roles: roleIds, ...extra }).expect(201)).body as { id: string };
const userCount = async () => ((await get('/core/users')).body as unknown[]).length;
const login = (username: string) => test.login({ username, password: `${username}-passwort-1` });

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  await post('/training/types/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.youth = (await post('/masterdata/departments', { name: 'Jugendfeuerwehr Musterstadt', shortName: 'Jugend', type: 'youth', parentId: ids.musterstadt }).expect(201)).body.id;
  ids.veterans = (await post('/masterdata/departments', { name: 'Altersabteilung Musterstadt', shortName: 'Alters', type: 'veterans', parentId: ids.musterstadt }).expect(201)).body.id;
  ids.ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
  const member = (firstName: string, status: string, departmentId: string, email = '') =>
    post('/masterdata/persons', { firstName, lastName: 'Test', status, email, memberships: [{ departmentId, from: '2020-01-01', primary: true }] }).expect(201);
  ids.youngster = (await member('Jan', 'youth', ids.youth)).body.id;
  ids.senior = (await member('Sepp', 'active', ids.musterstadt)).body.id;
  ids.veteran = (await member('Vera', 'veterans', ids.veterans)).body.id;
  ids.foreign = (await member('Anna', 'active', ids.ahornfeld)).body.id;
  ids.commanderPerson = (await member('Kurt', 'active', ids.musterstadt, 'kurt@example.org')).body.id;
  ids.invitee = (await member('Ines', 'active', ids.musterstadt, 'ines.test@example.org')).body.id;
  ids.noMail = (await member('Otto', 'active', ids.musterstadt)).body.id;
  for (const role of (await get('/core/roles')).body as { id: string; templateKey: string | null }[]) if (role.templateKey) roles[role.templateKey] = role.id;
  roles.manager = (await post('/core/roles', { name: 'Benutzerpflege', permissions: ['core.users.manage', 'core.roles.manage', 'core.tokens.manage', 'incidents.api.create'] }).expect(201)).body.id;
  ids.manager = (await user('pfleger', [{ roleId: roles.manager }])).id;
  ids.commander = (await user('kommandant', [{ roleId: roles['department-commander'], departmentId: ids.musterstadt }], { personId: ids.commanderPerson })).id;
  ids.admin = ((await get('/core/session')).body as { user: { id: string } }).user.id;
});

afterAll(() => test?.app.close());

describe('managing users with fewer permissions than the target', () => {
  it('cannot take over a more privileged account', async () => {
    const manager = await login('pfleger');
    const target = (await get(`/core/users/${ids.admin}`)).body;
    const change = (body: Record<string, unknown>) => put(`/core/users/${ids.admin}`, { ...target, ...body }, manager);
    expect((await change({ password: 'uebernommen-123' }).expect(403)).body.code).toBe('users.targetWider');
    expect((await change({ email: 'angreifer@example.org' }).expect(403)).body.code).toBe('users.targetWider');
    expect((await change({ active: false }).expect(403)).body.code).toBe('users.targetWider');
    expect((await del(`/core/users/${ids.admin}/oidc`, manager).expect(403)).body.code).toBe('users.targetWider');
    await test.login();

    // Users within the own permissions can be changed.
    const colleague = await user('kollege', [{ roleId: roles.manager }]);
    const body = (await get(`/core/users/${colleague.id}`)).body;
    await put(`/core/users/${colleague.id}`, { ...body, email: 'kollege@example.org' }, manager).expect(200);
  });

  it('validates departments and persons and links a person to one user only', async () => {
    const body = { username: 'neu', displayName: 'Neu', password: 'neu-passwort-12' };
    expect((await post('/core/users', { ...body, roles: [{ roleId: roles.member, departmentId: '0190c0de-0000-7000-8000-000000000000' }] }).expect(400)).body.code).toBe('users.unknownDepartment');
    expect((await post('/core/users', { ...body, personId: '0190c0de-0000-7000-8000-000000000000' }).expect(400)).body.code).toBe('users.unknownPerson');
    expect((await post('/core/users', { ...body, personId: 'kein-uuid' }).expect(400)).body.code).toBe('users.unknownPerson');
    expect((await post('/core/users', { ...body, personId: ids.commanderPerson }).expect(409)).body.code).toBe('users.personTaken');
  });
});

describe('linking users to persons', () => {
  it('needs the permission for the sensitive data of the person and never changes the own account', async () => {
    const manager = await login('pfleger');
    const own = (await get(`/core/users/${ids.manager}`)).body;
    expect((await put(`/core/users/${ids.manager}`, { ...own, personId: ids.senior }, manager).expect(403)).body.code).toBe('users.cannotRelinkSelf');
    const colleague = ((await get('/core/users')).body as { id: string; username: string }[]).find((u) => u.username === 'kollege')!;
    const colleagueBody = (await get(`/core/users/${colleague.id}`)).body;
    expect((await put(`/core/users/${colleague.id}`, { ...colleagueBody, personId: ids.senior }, manager).expect(403)).body.code).toBe('users.personForbidden');
    expect((await post('/core/users', { username: 'neuling', displayName: 'Neuling', password: 'neuling-passwort-1', personId: ids.senior }, manager).expect(403)).body.code).toBe('users.personForbidden');

    // Whoever may see the sensitive data of a department links users to its persons, and only to them.
    const hr = (await post('/core/roles', { name: 'Personalpflege', permissions: ['masterdata.persons.read', 'masterdata.persons.sensitive'], permissionsAllDepartments: ['core.users.manage'] }).expect(201)).body.id;
    await user('personal', [{ roleId: hr, departmentId: ids.musterstadt }]);
    const personal = await login('personal');
    const target = await user('verknuepft', []);
    const body = (await get(`/core/users/${target.id}`)).body;
    expect((await put(`/core/users/${target.id}`, { ...body, personId: ids.foreign }, personal).expect(403)).body.code).toBe('users.personForbidden');
    await put(`/core/users/${target.id}`, { ...body, personId: ids.senior }, personal).expect(200);
    // Not even the administrator changes the person of his own account.
    const adminBody = (await get(`/core/users/${ids.admin}`)).body;
    expect((await put(`/core/users/${ids.admin}`, { ...adminBody, personId: ids.foreign }).expect(403)).body.code).toBe('users.cannotRelinkSelf');

    const audit = (await get('/core/audit?action=users.person-linked')).body as { details: { userId: string; personId: string | null; previousPersonId: string | null } }[];
    expect(audit.map((e) => e.details)).toContainEqual({ userId: target.id, previousPersonId: null, personId: ids.senior });
  });
});

describe('the last administrator', () => {
  it('always keeps one active user with all permissions', async () => {
    const own = (await get(`/core/users/${ids.admin}`)).body;
    expect((await put(`/core/users/${ids.admin}`, { ...own, roles: [] }).expect(400)).body.code).toBe('users.lastAdministrator');
    const role = (await get('/core/roles')).body.find((r: { id: string }) => r.id === roles.administrator);
    expect((await put(`/core/roles/${roles.administrator}`, { ...role, permissions: ['core.users.manage'] }).expect(400)).body.code).toBe('users.lastAdministrator');
    expect((await del(`/core/roles/${roles.administrator}`).expect(400)).body.code).toBe('users.lastAdministrator');
    // Rolled back: the administrator still has all permissions.
    expect((await get('/core/session')).body.permissions['core.users.manage']).toBe('brigade');

    // With a second administrator, one of them may lose the role or be locked.
    const second = await user('admin2', [{ roleId: roles.administrator }]);
    const secondBody = (await get(`/core/users/${second.id}`)).body;
    await put(`/core/users/${second.id}`, { ...secondBody, active: false }).expect(200);
    // Locked administrators do not count.
    expect((await put(`/core/users/${ids.admin}`, { ...own, roles: [] }).expect(400)).body.code).toBe('users.lastAdministrator');
    await put(`/core/users/${second.id}`, { ...secondBody, active: true }).expect(200);
  });

  it('applies role templates only within the own permissions', async () => {
    const manager = await login('pfleger');
    const commander = (await get('/core/roles')).body.find((r: { id: string }) => r.id === roles.commander);
    await put(`/core/roles/${roles.commander}`, { ...commander, permissions: [] }).expect(200);
    expect((await post(`/core/roles/${roles.commander}/apply-template`, {}, manager).expect(403)).body.code).toBe('users.roleWider');
    await post(`/core/roles/${roles.commander}/apply-template`, {}).expect(200);
  });
});

describe('API tokens', () => {
  it('get no administrative scopes and never more than their creator holds', async () => {
    const manager = await login('pfleger');
    expect((await post('/core/tokens', { ...TOKEN_FIELDS, name: 'Hintertür', scopes: ['core.users.manage'] }, manager).expect(400)).body.code).toBe('tokens.coreScopes');
    expect((await post('/core/tokens', { ...TOKEN_FIELDS, name: 'Hintertür', scopes: ['core.roles.manage'] }).expect(400)).body.code).toBe('tokens.coreScopes');
    expect((await post('/core/tokens', { ...TOKEN_FIELDS, name: 'Zu weit', scopes: ['masterdata.persons.read'] }, manager).expect(403)).body.code).toBe('tokens.scopesWider');
    await post('/core/tokens', { ...TOKEN_FIELDS, name: 'Alarmfax', scopes: ['incidents.api.create'] }, manager).expect(201);
    // The token page lists the permissions with the token permission alone.
    const tokenRole = (await post('/core/roles', { name: 'Tokens', permissions: ['core.tokens.manage'] }).expect(201)).body.id;
    await user('tokenpfleger', [{ roleId: tokenRole }]);
    expect((await get('/core/permissions', await login('tokenpfleger')).expect(200)).body.length).toBeGreaterThan(10);
    await get('/core/permissions', await login('kommandant')).expect(403);
  });
});

describe('deactivated modules', () => {
  it('stay closed whatever the case of the path, also for API tokens', async () => {
    const permissions = (await get('/core/permissions')).body as { id: string }[];
    const scope = permissions.find((p) => p.id.startsWith('cost-recovery.'))!.id;
    const token = (await post('/core/tokens', { ...TOKEN_FIELDS, name: 'Kostenersatz', scopes: [scope] }).expect(201)).body.token as string;
    const bearer = { Authorization: `Bearer ${token}` };
    expect(Object.keys((await test.http.get('/api/core/session').set(bearer).expect(200)).body.permissions)).toEqual([scope]);

    await put('/core/modules/cost-recovery', { active: false }).expect(200);
    for (const path of ['/api/cost-recovery/notices', '/api/Cost-Recovery/notices', '/api/COST-RECOVERY/notices', '/api/cost%2Drecovery/notices']) {
      expect((await test.http.get(path).set('Cookie', admin).expect(404)).body.code).toBe('modules.inactive');
    }
    expect((await test.http.get('/api/core/session').set(bearer).expect(200)).body.permissions).toEqual({});
    await put('/core/modules/cost-recovery', { active: true }).expect(200);
  });

  it('keep their permissions out of reach of role, token and user managers', async () => {
    const scope = ((await get('/core/permissions')).body as { id: string }[]).find((p) => p.id.startsWith('cost-recovery.'))!.id;
    const manager = await login('pfleger');
    await put('/core/modules/cost-recovery', { active: false }).expect(200);
    try {
      // Neither holds the manager these permissions, nor would they be "wider" only while the module is off.
      expect((await post('/core/roles', { name: 'Kostenersatz heimlich', permissions: ['cost-recovery.*'] }, manager).expect(403)).body.code).toBe('users.roleWider');
      expect((await post('/core/tokens', { ...TOKEN_FIELDS, name: 'Kostenersatz heimlich', scopes: [scope] }, manager).expect(403)).body.code).toBe('tokens.scopesWider');
      // The administrator holds them (`*`) and may prepare a role.
      const role = (await post('/core/roles', { name: 'Kostenersatz später', permissions: ['cost-recovery.*'] }).expect(201)).body.id;
      const target = await user('spaeter', []);
      const body = (await get(`/core/users/${target.id}`)).body;
      expect((await put(`/core/users/${target.id}`, { ...body, roles: [{ roleId: role }] }, manager).expect(403)).body.code).toBe('users.roleWider');
      await put(`/core/users/${target.id}`, { ...body, roles: [{ roleId: role }] }).expect(200);
      // Users holding them cannot be changed by the manager either.
      expect((await put(`/core/users/${target.id}`, { ...body, roles: [{ roleId: role }], email: 'spaeter@example.org' }, manager).expect(403)).body.code).toBe('users.targetWider');
    } finally {
      await put('/core/modules/cost-recovery', { active: true }).expect(200);
    }
  });
});

describe('settings', () => {
  it('shows server accounts and the feed token only to the managers', async () => {
    await put('/core/settings/smtp', { host: 'smtp.example.org', username: 'forga@example.org', sender: 'forga@example.org' }).expect(200);
    const general = (await get('/core/settings/training.general')).body;
    await put('/core/settings/training.general', { ...general, feedToken: 'geheimer-feed-token-123' }).expect(200);
    const commander = await login('kommandant');
    for (const section of ['smtp', 'oidc', 'privacy', 'reminders']) await get(`/core/settings/${section}`, commander).expect(403);
    expect((await get('/core/settings/brigade', commander).expect(200)).body.name).toBe('Feuerwehr Musterstadt');
    expect((await get('/core/settings/incidents.general', commander).expect(200)).body).not.toBeNull();
    const training = (await get('/core/settings/training.general', commander).expect(200)).body;
    expect(training).not.toHaveProperty('feedToken');
    expect((await get('/core/settings/training.general').expect(200)).body.feedToken).toBe('geheimer-feed-token-123');
  });
});

describe('department commander and the departments below', () => {
  it('covers youth and veterans department of his operational department', async () => {
    const commander = await login('kommandant');
    const session = (await get('/core/session', commander)).body;
    expect(session.permissions['masterdata.persons.read']).toEqual(expect.arrayContaining([ids.musterstadt, ids.youth, ids.veterans]));
    expect(session.permissions['masterdata.persons.read']).not.toContain(ids.ahornfeld);
    await get(`/masterdata/persons/${ids.youngster}`, commander).expect(200);
    await get(`/masterdata/persons/${ids.veteran}`, commander).expect(200);
    await get(`/masterdata/persons/${ids.foreign}`, commander).expect(404);

    await post(`/masterdata/persons/${ids.youngster}/transfer-to-operational`, { departmentId: ids.musterstadt, on: '2026-01-01', probationEndsOn: null, reason: 'Jugendfeuerwehr' }, commander).expect(201);
    await post(`/masterdata/persons/${ids.senior}/transfer-to-veterans`, { departmentId: ids.veterans, on: '2026-01-01' }, commander).expect(201);

    const startsAt = new Date(Date.now() + 48 * 3_600_000);
    const joint = { type: 'exercise', title: 'Gemeinsame Übung', startsAt: startsAt.toISOString(), endsAt: new Date(startsAt.getTime() + 7_200_000).toISOString() };
    await post('/training/sessions', { ...joint, departmentIds: [ids.musterstadt, ids.youth] }, commander).expect(201);
    await post('/training/sessions', { ...joint, departmentIds: [ids.musterstadt, ids.ahornfeld] }, commander).expect(403);
  });
});

describe('lists', () => {
  it('tell which departments the user may choose', async () => {
    const lists = (await get('/core/lists', await login('kommandant')).expect(200)).body as { permission?: string; departments: string[] | 'brigade' }[];
    expect(lists.length).toBeGreaterThan(0);
    for (const list of lists) expect(list.departments === 'brigade' ? [] : list.departments).not.toContain(ids.ahornfeld);
    expect(((await get('/core/lists').expect(200)).body as { departments: unknown }[]).every((l) => l.departments === 'brigade')).toBe(true);
  });

  it('offer persons and entries of the modules instead of IDs to type', async () => {
    const lists = (await get('/core/lists').expect(200)).body as { id: string; parameters: { key: string; type: string }[] }[];
    const statement = lists.find((l) => l.id === 'compensation.statement')!;
    expect(statement.parameters.find((p) => p.key === 'personId')).toEqual(expect.objectContaining({ type: 'person' }));
    expect(statement.parameters.find((p) => p.key === 'runId')).toEqual(expect.objectContaining({ type: 'choice' }));
    expect(statement.parameters.find((p) => p.key === 'runId')).not.toHaveProperty('choices');
    const persons = (await get('/core/lists/compensation.statement/parameters/personId/options?q=Kurt').expect(200)).body as { value: string }[];
    expect(persons.map((p) => p.value)).toContain(ids.commanderPerson);
    const sessions = (await get('/core/lists/training.participants/parameters/sessionId/options').expect(200)).body as { label: string }[];
    expect(sessions.map((s) => s.label)).toContain('Gemeinsame Übung');
    await get('/core/lists/training.participants/parameters/gibt-es-nicht/options').expect(404);
    await get('/core/lists/training.participants/parameters/sessionId/options', await login('pfleger')).expect(404);
  });
});

describe('invitations', () => {
  it('create a user from a person and send a link to set the password', async () => {
    expect((await post('/core/users/invitations', { personId: ids.invitee, roles: [{ roleId: roles.member, departmentId: ids.musterstadt }] }).expect(503)).body.code).toBe('auth.resetNotConfigured');
    await put('/core/settings/brigade', { name: 'Feuerwehr Musterstadt', publicUrl: 'https://forga.example.org' }).expect(200);
    const invited = (await post('/core/users/invitations', { personId: ids.invitee, roles: [{ roleId: roles.member, departmentId: ids.musterstadt }] }).expect(201)).body;
    expect(invited).toMatchObject({ username: 'ines.test', displayName: 'Ines Test', email: 'ines.test@example.org', personId: ids.invitee, passwordSet: false });
    const mail = test.app.get(MailService).sent.at(-1)!;
    expect(mail).toMatchObject({ to: 'ines.test@example.org', subject: 'f.orga: Einladung' });
    expect(mail.text).toContain('7 Tage');
    const token = /reset-password\?token=([\w-]+)/.exec(mail.text)![1];
    await test.http.post('/api/core/password-reset/confirm').set(UI).send({ token, password: 'mein-eigenes-1' }).expect(200);
    await test.login({ username: 'ines.test', password: 'mein-eigenes-1' });
    expect((await get(`/core/users/${invited.id}`)).body.passwordSet).toBe(true);
    expect((await post(`/core/users/${invited.id}/invitation`, {}).expect(400)).body.code).toBe('users.alreadyActivated');

    expect((await post('/core/users/invitations', { personId: ids.noMail }).expect(400)).body.code).toBe('users.personWithoutEmail');
    expect((await post('/core/users/invitations', { personId: ids.invitee }).expect(409)).body.code).toBe('users.personTaken');
    // The manager cannot invite with roles he does not hold.
    expect((await post('/core/users/invitations', { personId: ids.foreign, roles: [{ roleId: roles.administrator }] }, await login('pfleger')).expect(403)).body.code).toBe('users.roleWider');
  });

  it('create users for several persons at once', async () => {
    const result = (await post('/core/users/invitations/bulk', { personIds: [ids.invitee, ids.noMail, ids.veteran], roles: [{ roleId: roles.member, departmentId: ids.musterstadt }] }).expect(200)).body;
    expect(result.invited).toEqual([]);
    expect(result.skipped).toEqual(
      expect.arrayContaining([
        { personId: ids.invitee, reason: 'hasUser' },
        { personId: ids.noMail, reason: 'noEmail' },
        { personId: ids.veteran, reason: 'noEmail' },
      ]),
    );
    await put(`/masterdata/persons/${ids.foreign}`, { ...(await get(`/masterdata/persons/${ids.foreign}`)).body, email: 'anna@example.org' }).expect(200);
    const second = (await post('/core/users/invitations/bulk', { personIds: [ids.foreign] }).expect(200)).body;
    expect(second.invited).toHaveLength(1);
    expect(test.app.get(MailService).sent.at(-1)!.to).toBe('anna@example.org');
  });

  it('check the mail server first and leave no user behind when sending fails', async () => {
    const mail = test.app.get(MailService);
    const person = async (firstName: string) =>
      (await post('/masterdata/persons', { firstName, lastName: 'Mail', status: 'active', email: `${firstName.toLowerCase()}@example.org`, memberships: [{ departmentId: ids.musterstadt, from: '2020-01-01', primary: true }] }).expect(201)).body.id as string;
    const mara = await person('Mara');
    const malte = await person('Malte');
    const users = await userCount();

    await put('/core/settings/smtp', { host: '', sender: 'forga@example.org' }).expect(200);
    expect((await post('/core/users/invitations', { personId: mara }).expect(400)).body.code).toBe('mail.notConfigured');
    expect((await post('/core/users/invitations/bulk', { personIds: [mara] }).expect(400)).body.code).toBe('mail.notConfigured');
    await put('/core/settings/smtp', { host: 'smtp.example.org', username: 'forga@example.org', sender: 'forga@example.org' }).expect(200);

    mail.failWith = 'mail.connectionFailed';
    try {
      expect((await post('/core/users/invitations', { personId: mara }).expect(502)).body.code).toBe('mail.connectionFailed');
      expect(await userCount()).toBe(users);
      const bulk = (await post('/core/users/invitations/bulk', { personIds: [mara, malte] }).expect(200)).body;
      expect(bulk.invited).toEqual([]);
      expect(bulk.skipped).toEqual([
        { personId: mara, reason: 'mailFailed', code: 'mail.connectionFailed' },
        { personId: malte, reason: 'mailFailed', code: 'mail.connectionFailed' },
      ]);
      expect(await userCount()).toBe(users);
    } finally {
      mail.failWith = null;
    }

    // Persons the manager may not link are skipped as well.
    const forbidden = (await post('/core/users/invitations/bulk', { personIds: [mara] }, await login('pfleger')).expect(200)).body;
    expect(forbidden.skipped).toEqual([{ personId: mara, reason: 'forbidden' }]);
    const invited = (await post('/core/users/invitations/bulk', { personIds: [mara, malte] }).expect(200)).body;
    expect(invited.invited).toHaveLength(2);
  });

  it('end earlier links when the invitation is sent again', async () => {
    const mails = test.app.get(MailService).sent;
    const malte = ((await get('/core/users')).body as { id: string; username: string }[]).find((u) => u.username === 'malte')!;
    const first = /reset-password\?token=([\w-]+)/.exec(mails.filter((m) => m.to === 'malte@example.org').at(-1)!.text)![1];
    await post(`/core/users/${malte.id}/invitation`, {}).expect(200);
    const second = /reset-password\?token=([\w-]+)/.exec(mails.at(-1)!.text)![1];
    await test.http.post('/api/core/password-reset/confirm').set(UI).send({ token: first, password: 'mein-eigenes-1' }).expect(400);
    await test.http.post('/api/core/password-reset/confirm').set(UI).send({ token: second, password: 'mein-eigenes-1' }).expect(200);
  });
});

describe('own profile', () => {
  it('changes the own e-mail address only with the password and a confirmed link', async () => {
    const commander = await login('kommandant');
    const profile = { language: 'de', receiveDigest: true };
    const mails = test.app.get(MailService).sent;
    await put('/core/profile', { ...profile, email: 'keine-adresse', currentPassword: 'kommandant-passwort-1' }, commander).expect(400);
    // Without (or with a wrong) password nothing changes: the address receives password reset links.
    expect((await put('/core/profile', { ...profile, email: 'angreifer@example.org' }, commander).expect(401)).body.code).toBe('auth.passwordRequired');
    await put('/core/profile', { ...profile, email: 'angreifer@example.org', currentPassword: 'falsch-falsch' }, commander).expect(401);
    // An address of another active user is refused.
    await put('/core/settings/smtp', { host: 'smtp.example.org', sender: 'forga@example.org' }).expect(200);
    await put(`/core/users/${ids.manager}`, { ...(await get(`/core/users/${ids.manager}`)).body, email: 'pfleger@example.org' }).expect(200);
    expect((await put('/core/profile', { ...profile, email: 'Pfleger@example.org', currentPassword: 'kommandant-passwort-1' }, commander).expect(409)).body.code).toBe('auth.emailTaken');

    // A reset link sent before the change stops working once the new address is confirmed.
    await put(`/core/users/${ids.commander}`, { ...(await get(`/core/users/${ids.commander}`)).body, email: 'kurt@example.org' }).expect(200);
    await test.http.post('/api/core/password-reset').set(UI).send({ login: 'kommandant' }).expect(200);
    await test.app.get(PasswordResetService).pending;
    const resetToken = /reset-password\?token=([\w-]+)/.exec(mails.at(-1)!.text)![1];

    const changed = await put('/core/profile', { ...profile, email: 'kurt.neu@example.org', currentPassword: 'kommandant-passwort-1' }, commander).expect(200);
    expect(changed.body.confirmationSent).toBe(true);
    let session = (await get('/core/session', commander)).body.user;
    expect(session).toMatchObject({ email: 'kurt@example.org', pendingEmail: 'kurt.neu@example.org' });
    const mail = mails.at(-1)!;
    expect(mail.to).toBe('kurt.neu@example.org');
    const token = /confirm-email\?token=([\w-]+)/.exec(mail.text)![1];
    // The confirmation link cannot set a password.
    await test.http.post('/api/core/password-reset/confirm').set(UI).send({ token, password: 'uebernommen-1234' }).expect(400);
    await test.http.post('/api/core/email-confirmation').set(UI).send({ token }).expect(200);
    await test.http.post('/api/core/email-confirmation').set(UI).send({ token }).expect(400);
    session = (await get('/core/session', commander)).body.user;
    expect(session).toMatchObject({ email: 'kurt.neu@example.org', pendingEmail: null });
    // The old address learns of the change.
    expect(mails.at(-1)!.to).toBe('kurt@example.org');
    await test.http.post('/api/core/password-reset/confirm').set(UI).send({ token: resetToken, password: 'uebernommen-1234' }).expect(400);

    // Left out: unchanged.
    await put('/core/profile', { language: 'de', receiveDigest: false }, commander).expect(200);
    expect((await get('/core/session', commander)).body.user.email).toBe('kurt.neu@example.org');
  });

  it('hides chosen modules and kinds of tasks in bell and start page', async () => {
    const all = (await get('/core/tasks?asOf=2030-01-01&all=true').expect(200)).body as { module: string; kind: string }[];
    expect(all.length).toBeGreaterThan(0);
    const [first] = all;
    await put('/core/profile', { language: 'de', receiveDigest: true, hiddenTasks: [`${first.module}:${first.kind}`] }).expect(200);
    expect((await get('/core/session')).body.user.hiddenTasks).toEqual([`${first.module}:${first.kind}`]);
    const shown = (await get('/core/tasks?asOf=2030-01-01').expect(200)).body as { module: string; kind: string }[];
    expect(shown.some((t) => t.module === first.module && t.kind === first.kind)).toBe(false);
    expect(shown.length).toBe(all.filter((t) => !(t.module === first.module && t.kind === first.kind)).length);
    await put('/core/profile', { language: 'de', receiveDigest: true, hiddenTasks: [first.module] }).expect(200);
    expect(((await get('/core/tasks?asOf=2030-01-01').expect(200)).body as { module: string }[]).some((t) => t.module === first.module)).toBe(false);
    await put('/core/profile', { language: 'de', receiveDigest: true, hiddenTasks: [] }).expect(200);
    expect((await get('/core/tasks?asOf=2030-01-01').expect(200)).body).toHaveLength(all.length);
  });
});

describe('audit log', () => {
  it('filters on the server and names the users', async () => {
    const commanderRole = (await get('/core/roles')).body.find((r: { id: string }) => r.id === roles.commander);
    expect(commanderRole.permissions).toContain('core.audit.read');
    const reader = await user('chef', [{ roleId: roles.commander }]);
    const cookie = await login('chef');
    const entries = (await get('/core/audit?action=users.', cookie).expect(200)).body as { action: string; userName: string | null; userId: string }[];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.action.startsWith('users.'))).toBe(true);
    expect(entries.find((e) => e.userId === ids.admin)?.userName).toBe('Admin');
    const byUser = (await get(`/core/audit?userId=${ids.manager}`, cookie).expect(200)).body as { userId: string }[];
    expect(byUser.length).toBeGreaterThan(0);
    expect(byUser.every((e) => e.userId === ids.manager)).toBe(true);
    expect((await get('/core/audit?q=Hintert', cookie).expect(200)).body).toEqual([]);
    expect((await get(`/core/audit?q=${reader.id}`, cookie).expect(200)).body.map((e: { action: string }) => e.action)).toContain('users.created');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
    expect((await get(`/core/audit?from=${today}&to=${today}&limit=5`, cookie).expect(200)).body).toHaveLength(5);
    expect((await get('/core/audit?to=2000-01-01', cookie).expect(200)).body).toEqual([]);
    const filters = (await get('/core/audit/filters', cookie).expect(200)).body as { actions: string[]; users: { id: string; name: string }[] };
    expect(filters.actions).toContain('setup.completed');
    expect(filters.users).toContainEqual({ id: ids.admin, name: 'Admin' });
  });
});

describe('data access request and full export', () => {
  it('include the user account, roles, logins and audit entries of the person without secrets', async () => {
    const access = JSON.parse((await get(`/core/export/person/${ids.commanderPerson}`).expect(200)).text) as {
      data: { core: { users: { username: string; roles: { role: string }[]; sessions: unknown[] }[]; audit: { action: string }[] } };
    };
    const [account] = access.data.core.users;
    expect(account).toMatchObject({ username: 'kommandant', roles: [expect.objectContaining({ departmentId: ids.musterstadt })] });
    expect(account.sessions.length).toBeGreaterThan(0);
    expect(access.data.core.audit.map((e) => e.action)).toEqual(expect.arrayContaining(['auth.login', 'users.created']));
    expect(JSON.stringify(access)).not.toMatch(/passwordHash|scrypt\$/);

    expect((await get('/core/export').expect(200)).body).toContain('core');
    const full = JSON.parse((await get('/core/export/core').expect(200)).text) as { data: { users: unknown[]; roles: unknown[]; settings: Record<string, Record<string, unknown>> } };
    expect(full.data.users.length).toBeGreaterThan(3);
    expect(full.data.settings.smtp).toMatchObject({ host: 'smtp.example.org' });
    expect(full.data.settings.smtp).not.toHaveProperty('password');
    expect(full.data.settings['training.general']).toMatchObject({ feedToken: 'geheimer-feed-token-123' });
    expect(JSON.stringify(full)).not.toMatch(/passwordHash|scrypt\$/);
  });

  it('leave out server accounts and managers\' fields for exporters who do not manage them', async () => {
    const role = (await post('/core/roles', { name: 'Datenschutz', permissions: ['core.data.export'] }).expect(201)).body.id;
    await user('datenschutz', [{ roleId: role }]);
    const cookie = await login('datenschutz');
    const full = JSON.parse((await get('/core/export/core', cookie).expect(200)).text) as { data: { settings: Record<string, Record<string, unknown>> } };
    for (const section of ['smtp', 'oidc', 'privacy', 'reminders']) expect(full.data.settings).not.toHaveProperty(section);
    expect(full.data.settings['training.general']).toBeDefined();
    expect(full.data.settings['training.general']).not.toHaveProperty('feedToken');
    expect(full.data.settings.brigade).toMatchObject({ name: 'Feuerwehr Musterstadt' });
  });

  it('answer 400 for an invalid and 404 for an unknown person', async () => {
    expect((await get('/core/export/person/kein-uuid').expect(400)).body.code).toBe('data.invalidPersonId');
    expect((await get('/core/export/person/0190c0de-0000-7000-8000-000000000000').expect(404)).body.code).toBe('data.unknownPerson');
  });
});

describe('setup checklist', () => {
  it('shows administrators what is still missing', async () => {
    const items = (await get('/core/onboarding').expect(200)).body as { key: string; done: boolean; to: string }[];
    const state = Object.fromEntries(items.map((i) => [i.key, i.done]));
    expect(state).toMatchObject({ publicUrl: true, smtp: true, departments: true, catalogs: true, users: true, 'module:training': true, 'module:compensation': false });
    expect(items.find((i) => i.key === 'module:compensation')?.to).toBe('/compensation/settings');
    await get('/core/onboarding', await login('kommandant')).expect(403);
  });
});

describe('tasks', () => {
  it('carry a link to the page where they are done', async () => {
    const tasks = (await get('/core/tasks?asOf=2030-01-01').expect(200)).body as { subject: { type: string }; to?: string }[];
    for (const task of tasks.filter((t) => t.subject.type === 'core.audit')) expect(task.to).toBe('/admin/audit?action=events.');
  });
});
