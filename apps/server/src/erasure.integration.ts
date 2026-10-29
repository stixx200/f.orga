import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type EntityName, EntityManager } from '@mikro-orm/core';
import type { ErasureCheck, PrivacyRequest } from '@forga/core-contracts';
import { AuditEntry } from '@forga/core-api';
import type { AccessReportFixture } from './testing/access-report/fixture';
import { findAnywhere, IDENTIFYING, leaveLongAgo, seedEverything } from './testing/erasure/seed';
import { setUp, startTestApp, type TestApp } from './testing/test-app';

/**
 * Erasure of a request (L7, Art. 17): every module reports per data area whether it deletes, anonymises or keeps the
 * data until the end of the retention period; executing it erases what is allowed, restricts the rest and leaves an
 * audit entry with counts only.
 */
let test: TestApp;
let fx: AccessReportFixture;
let requestId: string;
const entity = (name: string) => name as unknown as EntityName<object>;
const em = () => test.app.get(EntityManager).fork();
const check = async () => (await fx.get(`/core/privacy/requests/${requestId}/erasure`).expect(200)).body as ErasureCheck;
const area = (c: ErasureCheck, key: string) => c.areas.find((a) => a.key === key);

beforeAll(async () => {
  process.env['FORGA_SECRET_KEY'] = randomBytes(32).toString('base64');
  test = await startTestApp();
  const admin = await setUp(test);
  ({ fx, requestId } = await seedEverything(test, admin));
}, 240_000);

afterAll(async () => {
  await test?.app.close();
  delete process.env['FORGA_SECRET_KEY'];
});

describe('erasure check', () => {
  it('needs core.privacy.manage and a request on erasure', async () => {
    await fx.get(`/core/privacy/requests/${requestId}/erasure`, fx.member).expect(403);
    const access = (await fx.post('/core/privacy/requests', { personId: fx.ids.person, kind: 'access', receivedOn: new Date().toISOString().slice(0, 10), channel: 'letter' }).expect(201)).body as PrivacyRequest;
    expect((await fx.get(`/core/privacy/requests/${access.id}/erasure`).expect(400)).body.code).toBe('privacy.notErasure');
  });

  it('keeps master data of a member until the period starts with leaving', async () => {
    const c = await check();
    expect(c.personName).toBe('Tobias Probe');
    expect(c.areas[0].module).toBe('masterdata');
    expect(c.areas.at(-1)!.module).toBe('core');
    for (const key of ['masterdata.contact', 'masterdata.person-file', 'masterdata.person-core']) expect(area(c, key), key).toMatchObject({ outcome: 'keep', keepUntil: null });
    expect(area(c, 'masterdata.person-core')!.reason!.de).toBe('Grunddaten Ausgeschiedener: Frist beginnt mit Austritt');
    expect(c.restrictUntil).toBeNull();
  });

  it('reports every module with data about the member', async () => {
    const c = await check();
    expect(area(c, 'respiratory-protection.evidence')).toMatchObject({ outcome: 'delete', count: 3 });
    expect(area(c, 'respiratory-protection.evidence')!.data.de).toBe('2 Nachweise, 1 Eignungsuntersuchung');
    expect(area(c, 'training.attendance')).toMatchObject({ outcome: 'anonymize' });
    expect(area(c, 'incidents.personnel')).toMatchObject({ outcome: 'anonymize' });
    expect(area(c, 'clothing.sizes')).toMatchObject({ outcome: 'delete' });
    // The jacket is still issued.
    expect(area(c, 'clothing.issues')).toMatchObject({ outcome: 'keep', keepUntil: null });
    expect(area(c, 'promotions.exclusions')).toMatchObject({ outcome: 'delete' });
    expect(area(c, 'promotions.lists')).toMatchObject({ outcome: 'anonymize' });
    expect(area(c, 'duty-officer.roster')).toMatchObject({ outcome: 'anonymize' });
    expect(area(c, 'equipment.defects')).toMatchObject({ outcome: 'anonymize' });
    // The item is in use: the proof of inspection stays with it.
    expect(area(c, 'equipment.inspections')).toMatchObject({ outcome: 'keep', keepUntil: null });
    // The run of the seed is closed, not paid out.
    expect(area(c, 'compensation.payouts')).toMatchObject({ outcome: 'keep', keepUntil: null });
    expect(area(c, 'compensation.open')).toMatchObject({ outcome: 'delete' });
    expect(area(c, 'mp-feuer.transfer')).toMatchObject({ outcome: 'anonymize' });
    expect(area(c, 'core.account')).toMatchObject({ outcome: 'anonymize', count: 1 });
    expect(area(c, 'core.privacy')).toMatchObject({ outcome: 'anonymize' });
    // Audit log: 2 years by default.
    expect(area(c, 'core.protocols')).toMatchObject({ outcome: 'keep' });
    expect(area(c, 'core.protocols')!.keepUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('follows the retention plan once the member has left', async () => {
    await leaveLongAgo(test, fx.ids.person);
    await fx.put('/core/settings/privacy', {
      retention: {
        'masterdata.person-file': { years: 10, action: 'anonymize' },
        'masterdata.person-core': { years: 10, action: 'anonymize' },
      },
    }).expect(200);
    const c = await check();
    expect(area(c, 'masterdata.contact')).toMatchObject({ outcome: 'delete' });
    expect(area(c, 'masterdata.person-file')).toMatchObject({ outcome: 'delete' });
    expect(area(c, 'masterdata.person-core')).toMatchObject({ outcome: 'anonymize' });
  });
});

describe('executing the erasure', () => {
  let result: ErasureCheck;

  it('asks for the name of the person', async () => {
    expect((await fx.post(`/core/privacy/requests/${requestId}/erasure`, { confirmName: 'Max Dritter' }).expect(400)).body.code).toBe('privacy.erasureConfirmation');
    await fx.post(`/core/privacy/requests/${requestId}/erasure`, { confirmName: 'Tobias Probe' }, fx.member).expect(403);
  });

  it('erases what is allowed, restricts the rest and logs counts only', async () => {
    result = (await fx.post(`/core/privacy/requests/${requestId}/erasure`, { confirmName: ' tobias  probe ' }).expect(201)).body as ErasureCheck;
    expect(result.executed).toMatchObject({ deleted: expect.any(Number), anonymized: expect.any(Number), kept: expect.any(Number), restrictedUntil: null });
    expect(result.executed!.kept).toBeGreaterThan(0);
    const audit = await em().find(AuditEntry, { action: 'privacy.erasure-executed' });
    expect(audit).toHaveLength(1);
    expect(audit[0].details).toMatchObject({ requestId, personId: fx.ids.person, kept: result.executed!.kept });
    expect(JSON.stringify(audit[0].details)).not.toMatch(/Tobias|Probe|Lindenweg/);
    const restricted = await em().find(AuditEntry, { action: 'privacy.restricted' });
    expect(restricted.at(-1)!.details).toMatchObject({ personId: fx.ids.person, reason: 'retention', requestId });
  });

  it('deletes, anonymises and keeps as reported', async () => {
    expect(await em().count(entity('EvidenceEntity'), { personId: fx.ids.person })).toBe(0);
    expect(await em().count(entity('SizeProfileEntity'), { personId: fx.ids.person })).toBe(0);
    expect(await em().count(entity('ExclusionEntity'), { personId: fx.ids.person })).toBe(0);
    // Booking records stay.
    expect(await em().count(entity('ItemEntity'), { personId: fx.ids.person })).toBeGreaterThan(0);
    const person = (await em().findOneOrFail(entity('Person'), { id: fx.ids.person })) as { firstName: string; restrictionReason: string; restrictedUntil: string | null };
    expect(person).toMatchObject({ firstName: 'N.', restrictionReason: 'retention', restrictedUntil: null });
  });

  it('leaves the identifying data nowhere, as the name was erased', async () => {
    expect(await findAnywhere(test, IDENTIFYING)).toEqual([]);
  });

  it('shows the execution at the request and refuses a second one', async () => {
    const request = (await fx.get(`/core/privacy/requests/${requestId}`).expect(200)).body as PrivacyRequest;
    expect(request.erasure).toEqual(result.executed);
    expect((await check()).executed).toEqual(result.executed);
    expect((await fx.post(`/core/privacy/requests/${requestId}/erasure`, { confirmName: 'N. N.' }).expect(409)).body.code).toBe('privacy.erasureExecuted');
  });
});
