import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EntityManager } from '@mikro-orm/core';
import { DomainEvents, ModuleState, ModuleStateService } from '@forga/core-api';
import { ADMIN, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let http: TestApp['http'];
const login = (credentials: { username: string; password: string }) => test.login(credentials);

beforeAll(async () => {
  test = await startTestApp();
  http = test.http;
});

afterAll(() => test?.app.close());

describe('setup and login', () => {
  it('requires a setup on first start and rejects anonymous access', async () => {
    await http.get('/api/core/setup').expect(200, { required: true, brigadeName: null, oidc: null });
    await http.get('/api/core/session').expect(401);
  });

  it('creates the administrator and logs in', async () => {
    const response = await http
      .post('/api/core/setup')
      .send({ brigadeName: 'Feuerwehr Musterstadt', displayName: 'Admin', language: 'en', ...ADMIN })
      .expect(201);
    const cookie = String(response.headers['set-cookie']);
    expect(cookie).toMatch(/forga_session=.+HttpOnly/);

    const session = await http.get('/api/core/session').set('Cookie', cookie.split(';')[0]).expect(200);
    expect(session.body.user).toMatchObject({ username: 'admin', language: 'en' });
    expect(session.body.permissions['core.users.manage']).toBe('brigade');
    expect(session.body.permissions['incidents.reports.release']).toBe('brigade');

    // The setup creates the standard roles in the chosen language, merged from all modules.
    const roles = (await http.get('/api/core/roles').set('Cookie', cookie.split(';')[0])).body as { templateKey: string; name: string; permissions: string[] }[];
    expect(roles.find((r) => r.templateKey === 'course-coordinator')).toMatchObject({ name: 'Course coordinator' });
    expect(roles.find((r) => r.templateKey === 'course-coordinator')?.permissions).toEqual(expect.arrayContaining(['masterdata.persons.read', 'masterdata.courses.plan']));
    expect(roles.find((r) => r.templateKey === 'group-leader')?.permissions).toEqual(
      expect.arrayContaining(['masterdata.persons.read', 'incidents.reports.read', 'incidents.reports.write', 'training.read', 'training.attendance']),
    );

    await http.post('/api/core/setup').send({ brigadeName: 'x', displayName: 'x', ...ADMIN }).expect(409);
    await http.get('/api/core/setup').expect(200, { required: false, brigadeName: 'Feuerwehr Musterstadt', oidc: null });
  });

  it('rejects wrong passwords', async () => {
    await http.post('/api/core/login').send({ ...ADMIN, password: 'falsch-falsch' }).expect(401);
  });

  it('requires the CSRF header for changes made with a session cookie', async () => {
    const cookie = await login(ADMIN);
    const department = { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' };
    await http.post('/api/masterdata/departments').set('Cookie', cookie).send(department).expect(403);
    await http.post('/api/masterdata/departments').set('Cookie', cookie).set(UI).send(department).expect(201);
  });

  it('rejects invalid input with machine-readable issues', async () => {
    const cookie = await login(ADMIN);
    const response = await http
      .post('/api/masterdata/departments')
      .set('Cookie', cookie)
      .set(UI)
      .send({ name: '' })
      .expect(400);
    expect(response.body.code).toBe('validation.failed');
    expect(response.body.issues.map((i: { path: string }) => i.path)).toEqual(['name', 'shortName', 'type']);
  });
});

describe('roles scoped to departments', () => {
  it('limits a user to the departments of his role assignment', async () => {
    const admin = await login(ADMIN);
    const departments = await http.get('/api/masterdata/departments').set('Cookie', admin).expect(200);
    const musterstadt = departments.body.find((d: { shortName: string }) => d.shortName === 'Musterstadt');
    const ahornfeld = await http
      .post('/api/masterdata/departments')
      .set('Cookie', admin)
      .set(UI)
      .send({ name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' })
      .expect(201);

    const role = await http
      .post('/api/core/roles')
      .set('Cookie', admin)
      .set(UI)
      .send({ name: 'Abteilungskommandant', permissions: ['masterdata.*'] })
      .expect(201);
    await http
      .post('/api/core/roles')
      .set('Cookie', admin)
      .set(UI)
      .send({ name: 'Unbekannt', permissions: ['does.not.exist'] })
      .expect(400);

    await http
      .post('/api/core/users')
      .set('Cookie', admin)
      .set(UI)
      .send({
        username: 'kommandant.ahornfeld',
        displayName: 'Kommandant Ahornfeld',
        password: 'auch-sehr-geheim',
        roles: [{ roleId: role.body.id, departmentId: ahornfeld.body.id }],
      })
      .expect(201);

    const user = await login({ username: 'kommandant.ahornfeld', password: 'auch-sehr-geheim' });
    const session = await http.get('/api/core/session').set('Cookie', user).expect(200);
    expect(session.body.permissions['masterdata.persons.read']).toEqual([ahornfeld.body.id]);
    // Brigade-only permissions do not apply to department assignments.
    expect(session.body.permissions['masterdata.catalogs.manage']).toBeUndefined();

    const change = { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld (neu)', type: 'operational' };
    await http.put(`/api/masterdata/departments/${ahornfeld.body.id}`).set('Cookie', user).set(UI).send(change).expect(200);
    await http.put(`/api/masterdata/departments/${musterstadt.id}`).set('Cookie', user).set(UI).send(change).expect(403);
    await http.get('/api/core/users').set('Cookie', user).expect(403);
  });
});

describe('API tokens', () => {
  it('authenticate with their scopes only and can be revoked', async () => {
    const admin = await login(ADMIN);
    const created = await http
      .post('/api/core/tokens')
      .set('Cookie', admin)
      .set(UI)
      .send({ name: 'Alarmfax', scopes: ['incidents.api.create'] })
      .expect(201);
    const bearer = { Authorization: `Bearer ${created.body.token}` };

    const session = await http.get('/api/core/session').set(bearer).expect(200);
    expect(Object.keys(session.body.permissions)).toEqual(['incidents.api.create']);
    // No CSRF header needed, but no permission either.
    await http.post('/api/masterdata/departments').set(bearer).send({}).expect(403);

    const list = await http.get('/api/core/tokens').set('Cookie', admin).expect(200);
    expect(list.body[0]).not.toHaveProperty('token');
    expect(list.body[0].lastUsedAt).not.toBeNull();

    await http.delete(`/api/core/tokens/${created.body.id}`).set('Cookie', admin).set(UI).expect(204);
    await http.get('/api/core/session').set(bearer).expect(401);
  });
});

describe('modules', () => {
  it('checks requirements when deactivating and blocks routes of inactive modules', async () => {
    const admin = await login(ADMIN);
    const deactivate = (id: string) =>
      http.put(`/api/core/modules/${id}`).set('Cookie', admin).set(UI).send({ active: false });

    const blocked = await deactivate('masterdata').expect(400);
    expect(blocked.body).toMatchObject({ code: 'modules.requiredByActive' });
    expect(blocked.body.modules).toContain('incidents');

    // Modules depend only on modules installed before them, so the reverse order works.
    const installed = (await http.get('/api/core/modules/status').set('Cookie', admin)).body as { id: string }[];
    for (const { id } of installed.toReversed().filter((m) => m.id !== 'masterdata')) await deactivate(id).expect(200);
    await deactivate('masterdata').expect(200);
    await http.get('/api/masterdata/departments').set('Cookie', admin).expect(404);
    // Lists and import profiles of inactive modules are not offered through the core either.
    const lists = (await http.get('/api/core/lists').set('Cookie', admin).expect(200)).body as { module: string }[];
    expect(lists.filter((l) => l.module !== 'core')).toEqual([]);
    const profiles = (await http.get('/api/core/imports/profiles').set('Cookie', admin).expect(200)).body as { module: string }[];
    expect(profiles).toEqual([]);
    const active = await http.get('/api/core/modules').set('Cookie', admin).expect(200);
    expect(active.body).toEqual([]);

    await http.put('/api/core/modules/incidents').set('Cookie', admin).set(UI).send({ active: true }).expect(400);
    await http.put('/api/core/modules/masterdata').set('Cookie', admin).set(UI).send({ active: true }).expect(200);
    await http.get('/api/masterdata/departments').set('Cookie', admin).expect(200);
  });

  it('adds new template permissions to roles once and never re-adds removed ones', async () => {
    const admin = await login(ADMIN);
    const em = test.app.get(EntityManager).fork();
    const commander = async () => ((await http.get('/api/core/roles').set('Cookie', admin)).body as { id: string; templateKey: string; permissions: string[] }[]).find((r) => r.templateKey === 'commander')!;
    const role = await commander();
    // The administrator removes a permission of the training module.
    await http.put(`/api/core/roles/${role.id}`).set('Cookie', admin).set(UI).send({ name: 'Kommandant', description: '', permissions: role.permissions.filter((p) => p !== 'training.*'), permissionsAllDepartments: [] }).expect(200);

    // Restart after an upgrade from a version without bookkeeping: only a baseline is recorded.
    await em.nativeUpdate(ModuleState, { id: 'training' }, { grantedTemplates: null });
    await test.app.get(ModuleStateService).onApplicationBootstrap();
    expect((await commander()).permissions).not.toContain('training.*');

    // A module update with a new template permission: added once.
    const state = await em.findOneOrFail(ModuleState, 'training');
    await em.nativeUpdate(ModuleState, { id: 'training' }, { grantedTemplates: { ...state.grantedTemplates, commander: { permissions: [], permissionsAllDepartments: [] } } });
    await test.app.get(ModuleStateService).onApplicationBootstrap();
    expect((await commander()).permissions).toContain('training.*');
  });
});

describe('history and audit', () => {
  it('attributes changes to the logged-in user', async () => {
    const admin = await login(ADMIN);
    const adminId = (await http.get('/api/core/session').set('Cookie', admin)).body.user.id;
    const departments = await http.get('/api/masterdata/departments').set('Cookie', admin);
    const musterstadt = departments.body.find((d: { shortName: string }) => d.shortName === 'Musterstadt');

    const history = await http
      .get(`/api/core/history/masterdata.department/${musterstadt.id}`)
      .set('Cookie', admin)
      .expect(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({ action: 'created', userId: adminId });

    const audit = await http.get('/api/core/audit').set('Cookie', admin).expect(200);
    const actions = audit.body.map((e: { action: string }) => e.action);
    expect(actions).toEqual(expect.arrayContaining(['setup.completed', 'auth.login', 'auth.login-failed', 'tokens.revoked']));
  });

  it('keeps secrets out of the history and denies entities without a check', async () => {
    const admin = await login(ADMIN);
    await http.put('/api/core/settings/smtp').set('Cookie', admin).set(UI).send({ host: 'smtp.example.org', password: 'geheimes-smtp-passwort' }).expect(200);
    const history = await http.get('/api/core/history/core.setting/smtp').set('Cookie', admin).expect(200);
    expect(JSON.stringify(history.body)).not.toContain('geheimes-smtp-passwort');
    expect(history.body[0].changes.value.new.password).toBe('••••••');
    // Child records and unknown entities have no check of their own: denied.
    await http.get('/api/core/history/masterdata.membership/x').set('Cookie', admin).expect(404);
    await http.get('/api/core/history/gibt.es_nicht/x').set('Cookie', admin).expect(404);
    await http.get('/api/core/settings/constructor').set('Cookie', admin).expect(404);
  });
});

const cookies = (response: { headers: Record<string, unknown> }) =>
  Object.fromEntries(([] as string[]).concat(response.headers['set-cookie'] as string[]).map((c) => c.split(';')[0].split('=') as [string, string]));

describe('impersonation', () => {
  it('lets an administrator act as another user and return to the own session', async () => {
    const admin = await login(ADMIN);
    const role = await http.post('/api/core/roles').set('Cookie', admin).set(UI).send({ name: 'Leser', permissions: ['core.audit.read'] }).expect(201);
    const user = await http.post('/api/core/users').set('Cookie', admin).set(UI)
      .send({ username: 'reader', displayName: 'Rita Reader', password: 'auch-sehr-geheim', roles: [{ roleId: role.body.id }] }).expect(201);

    await http.post(`/api/core/users/${user.body.id}/impersonate`).set('Cookie', admin).set(UI).send({ reason: '' }).expect(400);
    const me = (await http.get('/api/core/session').set('Cookie', admin)).body.user.id;
    expect((await http.post(`/api/core/users/${me}/impersonate`).set('Cookie', admin).set(UI).send({ reason: 'Test' }).expect(400)).body.code).toBe('auth.impersonationSelf');

    const started = await http.post(`/api/core/users/${user.body.id}/impersonate`).set('Cookie', admin).set(UI).send({ reason: 'Rechte prüfen' }).expect(200);
    const set = cookies(started);
    expect(set['forga_session_original']).toBe(admin.split('=')[1]);
    const as = `forga_session=${set['forga_session']}; forga_session_original=${set['forga_session_original']}`;

    const session = await http.get('/api/core/session').set('Cookie', as).expect(200);
    expect(session.body.user).toMatchObject({ username: 'reader' });
    expect(session.body.impersonator).toMatchObject({ displayName: 'Admin' });
    expect(session.body.permissions['core.users.manage']).toBeUndefined();

    // Within the impersonation: no password change, no nested impersonation, actions are traced.
    expect((await http.put('/api/core/password').set('Cookie', as).set(UI).send({ current: 'auch-sehr-geheim', new: 'noch-geheimer-123' }).expect(403)).body.code).toBe('auth.impersonationNotAllowed');
    await http.post(`/api/core/users/${me}/impersonate`).set('Cookie', as).set(UI).send({ reason: 'x y z' }).expect(403);

    const ended = await http.post('/api/core/impersonation/end').set('Cookie', as).set(UI).expect(200);
    expect(cookies(ended)['forga_session']).toBe(admin.split('=')[1]);
    await http.get('/api/core/session').set('Cookie', `forga_session=${set['forga_session']}`).expect(401);
    expect((await http.get('/api/core/session').set('Cookie', admin)).body.impersonator).toBeNull();

    const audit = (await http.get('/api/core/audit').set('Cookie', admin)).body as { action: string; userId: string; details: Record<string, unknown> }[];
    expect(audit.find((e) => e.action === 'auth.impersonation-started')).toMatchObject({ userId: me, details: { targetName: 'Rita Reader', reason: 'Rechte prüfen' } });
    expect(audit.find((e) => e.action === 'auth.impersonation-ended')).toMatchObject({ userId: me });
  });

  it('never widens the permissions of the impersonator', async () => {
    const admin = await login(ADMIN);
    const role = await http.post('/api/core/roles').set('Cookie', admin).set(UI).send({ name: 'Support', permissions: ['core.users.impersonate', 'core.users.manage'] }).expect(201);
    await http.post('/api/core/users').set('Cookie', admin).set(UI)
      .send({ username: 'support', displayName: 'Support', password: 'auch-sehr-geheim', roles: [{ roleId: role.body.id }] }).expect(201);
    const support = await login({ username: 'support', password: 'auch-sehr-geheim' });
    const users = (await http.get('/api/core/users').set('Cookie', support)).body as { id: string; username: string }[];
    const adminId = users.find((u) => u.username === 'admin')!.id;
    const readerId = users.find((u) => u.username === 'reader')!.id;
    expect((await http.post(`/api/core/users/${adminId}/impersonate`).set('Cookie', support).set(UI).send({ reason: 'Versuch' }).expect(403)).body.code).toBe('auth.impersonationWider');
    // The reader has the audit permission, which support lacks.
    expect((await http.post(`/api/core/users/${readerId}/impersonate`).set('Cookie', support).set(UI).send({ reason: 'Versuch' }).expect(403)).body.code).toBe('auth.impersonationWider');
  });
});

describe('sessions after password changes', () => {
  it('ends the other sessions when the password changes or the user is locked', async () => {
    const admin = await login(ADMIN);
    const user = await http.post('/api/core/users').set('Cookie', admin).set(UI).send({ username: 'mehrfach', displayName: 'Mehrfach', password: 'erstes-passwort-1' }).expect(201);
    const first = await login({ username: 'mehrfach', password: 'erstes-passwort-1' });
    const second = await login({ username: 'mehrfach', password: 'erstes-passwort-1' });
    await http.put('/api/core/password').set('Cookie', first).set(UI).send({ current: 'erstes-passwort-1', new: 'zweites-passwort-2' }).expect(200);
    await http.get('/api/core/session').set('Cookie', first).expect(200);
    await http.get('/api/core/session').set('Cookie', second).expect(401);

    const { body } = await http.get(`/api/core/users/${user.body.id}`).set('Cookie', admin);
    await http.put(`/api/core/users/${user.body.id}`).set('Cookie', admin).set(UI).send({ ...body, active: false }).expect(200);
    await http.get('/api/core/session').set('Cookie', first).expect(401);
  });
});

describe('domain events', () => {
  it('records handlers that fail twice in the audit log and as a task', async () => {
    const admin = await login(ADMIN);
    const events = test.app.get(DomainEvents);
    let calls = 0;
    const unsubscribe = events.subscribe('test.event', () => {
      calls++;
      throw new Error('kaputt');
    });
    await events.publish('test.event', { id: 'x' });
    unsubscribe();
    expect(calls).toBe(2);
    const audit = (await http.get('/api/core/audit').set('Cookie', admin).expect(200)).body as { action: string; details: { event: string; error: string } }[];
    expect(audit.find((e) => e.action === 'events.handler-failed')).toMatchObject({ details: { event: 'test.event', error: 'kaputt' } });
    const tasks = (await http.get('/api/core/tasks').set('Cookie', admin).expect(200)).body as { kind: string }[];
    expect(tasks.some((t) => t.kind === 'event-handler-failed')).toBe(true);
  });
});

describe('no escalation through user and role management', () => {
  it('refuses roles with permissions the manager does not hold', async () => {
    const admin = await login(ADMIN);
    const role = (name: string, permissions: string[]) => http.post('/api/core/roles').set('Cookie', admin).set(UI).send({ name, description: '', permissions, permissionsAllDepartments: [] }).expect(201);
    const managerRole = (await role('Benutzerpflege', ['core.users.manage', 'core.roles.manage'])).body;
    await http.post('/api/core/users').set('Cookie', admin).set(UI).send({ username: 'pfleger', displayName: 'Pfleger', password: 'pfleger-passwort-1', roles: [{ roleId: managerRole.id, departmentId: null }] }).expect(201);
    const manager = await login({ username: 'pfleger', password: 'pfleger-passwort-1' });
    const roles = (await http.get('/api/core/roles').set('Cookie', admin)).body as { id: string; templateKey: string }[];
    const administrator = roles.find((r) => r.templateKey === 'administrator')!.id;

    const refused = await http.post('/api/core/users').set('Cookie', manager).set(UI).send({ username: 'neuer-admin', displayName: 'X', password: 'x-passwort-123', roles: [{ roleId: administrator, departmentId: null }] }).expect(403);
    expect(refused.body.code).toBe('users.roleWider');
    await http.put(`/api/core/roles/${managerRole.id}`).set('Cookie', manager).set(UI).send({ name: 'Benutzerpflege', description: '', permissions: ['*'], permissionsAllDepartments: [] }).expect(403);
    // Roles within the own permissions are fine.
    await http.post('/api/core/users').set('Cookie', manager).set(UI).send({ username: 'kollege', displayName: 'Kollege', password: 'kollege-passwort-1', roles: [{ roleId: managerRole.id, departmentId: null }] }).expect(201);
  });
});
