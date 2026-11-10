import { randomBytes } from 'node:crypto';
import { EntityManager } from '@mikro-orm/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setUp, startTestApp, type TestApp, UI } from './testing/test-app';

let test: TestApp;
let admin: string;
/** Department commander of Musterstadt: edits the persons there (`masterdata.persons.write`). */
let commander: string;
/** Group leader of Musterstadt: reads the personnel file, does not edit it. */
let leader: string;
const ids: Record<string, string> = {};

const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const sql = (statement: string, params: unknown[] = []) => test.app.get(EntityManager).getConnection().execute(statement, params);

type Device = { id: string; kind: string; suffix: string; revokedAt: string | null; revokeReason: string | null; revokedBy: string | null };

beforeAll(async () => {
  test = await startTestApp();
  admin = await setUp(test);
  process.env['FORGA_SECRET_KEY'] = randomBytes(32).toString('base64');
  await post('/masterdata/catalog/templates/bw', {}).expect(201);
  ids.musterstadt = (await post('/masterdata/departments', { name: 'Abteilung Musterstadt', shortName: 'Musterstadt', type: 'operational' }).expect(201)).body.id;
  ids.ahornfeld = (await post('/masterdata/departments', { name: 'Abteilung Ahornfeld', shortName: 'Ahornfeld', type: 'operational' }).expect(201)).body.id;
  const person = async (firstName: string, departmentId = ids.musterstadt) =>
    (await post('/masterdata/persons', { firstName, lastName: 'Geraet', status: 'active', memberships: [{ departmentId, from: '2000-01-01', primary: true }] }).expect(201)).body.id as string;
  ids.tobias = await person('Tobias');
  ids.jana = await person('Jana');
  ids.lena = await person('Lena', ids.ahornfeld);

  const roles = (await get('/core/roles').expect(200)).body as { id: string; templateKey: string | null }[];
  const role = (key: string) => roles.find((r) => r.templateKey === key)!.id;
  const user = async (username: string, displayName: string, templateKey: string, departmentId: string) => {
    await post('/core/users', { username, displayName, password: 'auch-sehr-geheim', roles: [{ roleId: role(templateKey), departmentId }] }).expect(201);
    return test.login({ username, password: 'auch-sehr-geheim' });
  };
  commander = await user('kdt.geraete', 'Kdt Geräte', 'department-commander', ids.musterstadt);
  leader = await user('gf.geraete', 'GF Geräte', 'group-leader', ids.musterstadt);
});

afterAll(() => test?.app.close());

describe('devices of persons for the info terminal', () => {
  it('registers an NFC sticker after the person was identified; only its last characters are shown', async () => {
    const registered = (await post(`/masterdata/persons/${ids.tobias}/device-tokens`, { kind: 'nfc', code: '04:A2:1F:7F:3A' }, commander).expect(201)).body as Device[];
    expect(registered).toMatchObject([{ kind: 'nfc', suffix: '7F3A', revokedAt: null, revokedBy: null }]);
    expect(JSON.stringify(registered)).not.toContain('04A21F7F3A');
    // Only the HMAC is stored, never the ID.
    const [stored] = await sql('select code_hash from masterdata.person_device_token where person_id = ?', [ids.tobias]);
    expect(stored.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.code_hash).not.toContain('04a21f7f3a');
    const audit = (await get('/core/audit?action=masterdata.person-token-registered').expect(200)).body as { action: string; details: Record<string, unknown> }[];
    expect(audit).toContainEqual(expect.objectContaining({ action: 'masterdata.person-token-registered', details: expect.objectContaining({ personId: ids.tobias, suffix: '7F3A' }) }));
  });

  it('refuses the registration without the permission to edit the person (403)', async () => {
    await post(`/masterdata/persons/${ids.tobias}/device-tokens`, { kind: 'barcode', code: 'TOB-CARD01' }, leader).expect(403);
    // Reading is allowed for the group leader.
    expect(((await get(`/masterdata/persons/${ids.tobias}/device-tokens`, leader).expect(200)).body as Device[]).length).toBe(1);
  });

  it('refuses an ID that another person already has (409, as the licence stickers) and an ID of a licence sticker of another person', async () => {
    expect((await post(`/masterdata/persons/${ids.jana}/device-tokens`, { kind: 'nfc', code: '04A21F7F3A' }, commander).expect(409)).body.code).toBe('masterdata.tokenTaken');
    await post(`/masterdata/persons/${ids.lena}/driver-license/tokens`, { kind: 'barcode', code: 'FS-0100-LENA' }, admin).expect(201);
    expect((await post(`/masterdata/persons/${ids.jana}/device-tokens`, { kind: 'barcode', code: 'FS-0100-LENA' }, commander).expect(409)).body.code).toBe('masterdata.tokenTaken');
    // And the other way round: a licence sticker cannot take an ID that is a device of another person.
    expect((await post(`/masterdata/persons/${ids.jana}/driver-license/tokens`, { kind: 'nfc', code: '04A21F7F3A' }, commander).expect(409)).body.code).toBe('masterdata.tokenTaken');
    expect((await post(`/masterdata/persons/${ids.jana}/device-tokens`, { kind: 'nfc', code: 'x' }, commander).expect(400)).body.code).toBe('validation.failed');
  });

  it('keeps one active device per person: the same ID changes nothing, another one replaces the device and keeps it in the history', async () => {
    const same = (await post(`/masterdata/persons/${ids.tobias}/device-tokens`, { kind: 'nfc', code: '04-a2-1f-7f-3a' }, commander).expect(201)).body as Device[];
    expect(same).toHaveLength(1);
    const replaced = (await post(`/masterdata/persons/${ids.tobias}/device-tokens`, { kind: 'barcode', code: 'TOB-CARD01' }, commander).expect(201)).body as Device[];
    expect(replaced.filter((d) => !d.revokedAt)).toMatchObject([{ kind: 'barcode', suffix: 'RD01' }]);
    expect(replaced.find((d) => d.kind === 'nfc')).toMatchObject({ revokeReason: 'replaced', revokedBy: 'Kdt Geräte' });
    const audit = (await get('/core/audit?action=masterdata.person-token-registered').expect(200)).body as { details: Record<string, unknown> }[];
    expect(audit.some((a) => Array.isArray(a.details['replaced']) && (a.details['replaced'] as string[]).length === 1)).toBe(true);
  });

  it('revokes a device with a reason at once; revoking again changes nothing; the ID is free for another person afterwards', async () => {
    const list = (await get(`/masterdata/persons/${ids.tobias}/device-tokens`, commander).expect(200)).body as Device[];
    const active = list.find((d) => !d.revokedAt)!;
    const revoked = (await post(`/masterdata/persons/${ids.tobias}/device-tokens/${active.id}/revoke`, { reason: 'verloren' }, commander).expect(200)).body as Device[];
    expect(revoked.find((d) => d.id === active.id)).toMatchObject({ revokedBy: 'Kdt Geräte', revokeReason: 'verloren' });
    const again = (await post(`/masterdata/persons/${ids.tobias}/device-tokens/${active.id}/revoke`, { reason: 'noch einmal' }, commander).expect(200)).body as Device[];
    expect(again.find((d) => d.id === active.id)?.revokeReason).toBe('verloren');
    await post(`/masterdata/persons/${ids.tobias}/device-tokens/${active.id}/revoke`, { reason: '' }, commander).expect(400);
    expect((await post(`/masterdata/persons/${ids.jana}/device-tokens`, { kind: 'barcode', code: 'TOB-CARD01' }, commander).expect(201)).body).toMatchObject([{ suffix: 'RD01' }]);
  });

  it('shows the devices in the data access request without the hash and records them in the history of the person', async () => {
    const access = JSON.parse((await get(`/core/export/person/${ids.tobias}`).expect(200)).text) as { data: { masterdata: Record<string, Record<string, unknown>[]> } };
    expect(access.data.masterdata['personDeviceTokens']!.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(access)).not.toMatch(/codeHash|code_hash/);
    const history = (await get(`/core/history/masterdata.person/${ids.tobias}`).expect(200)).body as { entity: string }[];
    expect(history.some((e) => e.entity === 'masterdata.person_device_token')).toBe(true);
  });
});
