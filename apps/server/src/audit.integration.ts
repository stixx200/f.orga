import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { EntityManager } from '@mikro-orm/core';
import { Audit, AuditReferenceRegistry, type AuditReferenceKind } from '@forga/core-api';
import type { AuditEntry } from '@forga/core-contracts';
import { TRAINING_MANIFEST } from '@forga/training-contracts';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const entries = async (action: string) => (await get(`/core/audit?action=${action}`).expect(200)).body as AuditEntry[];

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  ids.department = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  const person = async (firstName: string, lastName: string) =>
    (await post('/masterdata/persons', { firstName, lastName, status: 'active', memberships: [{ departmentId: ids.department, from: '2020-01-01', primary: true }] }).expect(201)).body.id as string;
  ids.max = await person('Max', 'Mustermann');
  ids.erika = await person('Erika', 'Beispiel');
});

afterAll(() => test?.app.close());

describe('readable audit log', () => {
  it('shows persons by name with a link and keeps the ID for support', async () => {
    await get(`/core/export/person/${ids.max}`).expect(200);
    const [entry] = await entries('data.person-exported');
    expect(entry.details).toEqual({ personId: ids.max });
    expect(entry.references[ids.max]).toEqual({ kind: 'masterdata.person', label: 'Mustermann, Max', to: `/masterdata/persons/${ids.max}` });
  });

  it('resolves users, roles and departments, also inside lists of objects', async () => {
    const roles = (await get('/core/roles')).body as { id: string; templateKey: string | null; name: { de: string } }[];
    const role = roles.find((r) => r.templateKey === 'department-commander')!;
    const user = (await post('/core/users', { username: 'kommandant', displayName: 'Karl Kommandant', password: 'kommandant-passwort-1', roles: [{ roleId: role.id, departmentId: ids.department }] }).expect(201)).body as { id: string };
    const [entry] = await entries('users.created');
    expect(entry.references[user.id]).toMatchObject({ kind: 'core.user', label: 'Karl Kommandant' });
    expect(entry.references[role.id]).toMatchObject({ kind: 'core.role', label: role.name, to: '/admin/roles' });
    expect(entry.references[ids.department]).toMatchObject({ kind: 'masterdata.department', label: 'Abteilung Musterstadt', to: '/masterdata/organization' });
  });

  it('names modules in both languages', async () => {
    await put('/core/modules/training', { active: false }).expect(200);
    await put('/core/modules/training', { active: true }).expect(200);
    const [entry] = await entries('modules.deactivated');
    expect(entry.references.training).toEqual({ kind: 'core.module', label: TRAINING_MANIFEST.name });
    expect(TRAINING_MANIFEST.name.de).not.toBe(TRAINING_MANIFEST.name.en);
  });

  it('marks anonymised persons and records that no longer exist', async () => {
    const em = test.app.get(EntityManager).fork();
    await em.getConnection().execute(`update "masterdata"."person" set "anonymized_at" = now(), "first_name" = 'x', "last_name" = 'x' where "id" = ?`, [ids.erika]);
    const gone = '0190c0de-0000-7000-8000-000000000000';
    await test.app.get(Audit).log('data.person-exported', { personId: ids.erika });
    await test.app.get(Audit).log('data.person-exported', { personId: gone });
    const [deleted, anonymized] = await entries('data.person-exported');
    expect(anonymized.references[ids.erika]).toEqual({ kind: 'masterdata.person', label: null, anonymized: true });
    expect(deleted.references[gone]).toEqual({ kind: 'masterdata.person', label: null });
  });

  it('resolves the references of a whole page with one query per kind', async () => {
    const registry = test.app.get(AuditReferenceRegistry) as unknown as { kinds: Map<string, AuditReferenceKind> };
    const kind = registry.kinds.get('masterdata.person')!;
    const original = kind.resolve;
    const resolve = vi.fn(original);
    registry.kinds.set('masterdata.person', { ...kind, resolve });
    try {
      const page = (await get('/core/audit').expect(200)).body as AuditEntry[];
      expect(page.filter((e) => e.action === 'data.person-exported').length).toBeGreaterThan(2);
      expect(resolve).toHaveBeenCalledTimes(1);
      expect([...resolve.mock.calls[0][0]].toSorted()).toEqual(expect.arrayContaining([ids.max, ids.erika].toSorted()));
    } finally {
      registry.kinds.set('masterdata.person', kind);
    }
  });

  it('needs the permission to read the audit log', async () => {
    await post('/core/users', { username: 'leser', displayName: 'Leser', password: 'leser-passwort-12', roles: [] }).expect(201);
    const reader = await test.login({ username: 'leser', password: 'leser-passwort-12' });
    await get('/core/audit', reader).expect(403);
  });
});
