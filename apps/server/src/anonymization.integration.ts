import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { type EntityName, EntityManager } from '@mikro-orm/core';
import { PersonDataRegistry, User } from '@forga/core-api';
import { AccessReportService } from '@forga/privacy-api';
import { INSTALLED_MODULES } from './app/installed-modules';
import type { AccessReportFixture } from './testing/access-report/fixture';
import { findAnywhere, IDENTIFYING, leaveLongAgo, seedEverything } from './testing/erasure/seed';
import { setUp, startTestApp, type TestApp } from './testing/test-app';

/**
 * Complete anonymisation (L13, concept "Datenschutz"): a member with data in every module leaves, the retention plan
 * anonymises the basic data after the period, and afterwards no field of any table holds the name, e-mail address,
 * phone number, date of birth, IBAN or street of the member; the access report is refused.
 */
let test: TestApp;
let fx: AccessReportFixture;
let before: string[] = [];

beforeAll(async () => {
  process.env['FORGA_SECRET_KEY'] = randomBytes(32).toString('base64');
  test = await startTestApp();
  const admin = await setUp(test);
  ({ fx } = await seedEverything(test, admin));
  before = await findAnywhere(test, IDENTIFYING);
  await leaveLongAgo(test, fx.ids.person);
  await fx.put('/core/settings/retention', {
    retention: {
      'masterdata.person-file': { years: 10, action: 'anonymize' },
      'masterdata.person-core': { years: 10, action: 'anonymize' },
    },
  }).expect(200);
  await fx.post('/core/retention/run', { dryRun: false }).expect(200);
}, 240_000);

afterAll(async () => {
  await test?.app.close();
  delete process.env['FORGA_SECRET_KEY'];
});

describe('complete anonymisation (L13)', () => {
  it('every module declaring personal data erases and anonymises it', () => {
    const registry = test.app.get(PersonDataRegistry);
    const missing = INSTALLED_MODULES.filter((m) => m.manifest.privacy?.personData && !registry.handlers.has(m.manifest.id)).map((m) => m.manifest.id);
    expect(missing).toEqual([]);
  });

  it('the seeds put the identifying data into many tables', () => {
    const tables = new Set(before.map((f) => f.split(' ')[0]));
    expect(tables.size).toBeGreaterThan(10);
    expect([...tables]).toEqual(expect.arrayContaining(['masterdata.person', 'core.user', 'core.history', 'backup.run', 'backup.restore', 'promotions.promotion_list', 'mp_feuer.mapping', 'info_terminal.terminal', 'mp_feuer.run', 'privacy.request']));
  });

  it('leaves the identifying data nowhere', async () => {
    expect(await findAnywhere(test, IDENTIFYING)).toEqual([]);
  });

  it('keeps the person as „N.“ with memberships and the account locked', async () => {
    const em = test.app.get(EntityManager).fork();
    const person = (await em.findOneOrFail('Person' as unknown as EntityName<object>, { id: fx.ids.person })) as { firstName: string; anonymizedAt: Date | null };
    expect(person.firstName).toBe('N.');
    expect(person.anonymizedAt).toBeTruthy();
    const user = await em.findOneOrFail(User, fx.ids.memberUser);
    expect(user).toMatchObject({ displayName: 'N. N.', email: null, active: false });
  });

  it('refuses the access report for the anonymised person', async () => {
    expect((await fx.get(`/privacy/access-reports/preview?personId=${fx.ids.person}`).expect(409)).body.code).toBe('privacy.personAnonymized');
    expect((await fx.post('/privacy/access-reports', { personId: fx.ids.person, language: 'de', includeJson: false }).expect(409)).body.code).toBe('privacy.personAnonymized');
    await expect(test.app.get(AccessReportService).sections(fx.ids.person, 'de')).rejects.toThrow();
  });
});
