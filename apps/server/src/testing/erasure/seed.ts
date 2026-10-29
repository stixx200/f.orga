import { type EntityName, EntityManager } from '@mikro-orm/core';
import { AccessReportService } from '@forga/privacy-api';
import { INSTALLED_MODULES } from '../../app/installed-modules';
import { createFixture, type AccessReportFixture } from '../access-report/fixture';
import { SEEDS } from '../access-report/seeds';
import type { TestApp } from '../test-app';

// The entities of the modules are not exported; MikroORM resolves them by name.
const entity = (name: string) => name as unknown as EntityName<object>;

/**
 * What identifies the made-up member „Tobias Probe“ of the access report seeds: first name, e-mail address, mobile
 * number, date of birth (both formats), IBAN and street. None of them may remain anywhere after the anonymisation.
 */
export const IDENTIFYING = ['Tobias', 'tobias.probe@example.org', '0170 0000000', '1988-06-14', '14.06.1988', 'DE02120300000000202051', 'Lindenweg'];

/**
 * The member with data in every module (the seeds of the access report), an access report, a request on erasure that
 * names the member, and copies of the display name of the member's account in records of other modules: who started a
 * backup and a restore, who set up and revoked an info terminal, who started a data transfer, and a mapping to the
 * member remembered by MP-Feuer.
 */
export async function seedEverything(test: TestApp, admin: string): Promise<{ fx: AccessReportFixture; requestId: string }> {
  const fx = await createFixture(test, admin);
  for (const [, seed] of SEEDS) await seed(fx);
  await fx.post('/privacy/access-reports', { personId: fx.ids.person, language: 'de', includeJson: true }).expect(202);
  await test.app.get(AccessReportService).idle();
  const request = await fx.post('/privacy/requests', {
    personId: fx.ids.person,
    kind: 'erasure',
    receivedOn: new Date().toISOString().slice(0, 10),
    channel: 'letter',
    identityChecked: true,
    identityNote: 'Unterschrift von Tobias Probe verglichen',
    content: 'Bitte löschen Sie alle Daten von Tobias Probe, Lindenweg 4.',
  }).expect(201);
  const em = test.app.get(EntityManager).fork();
  const at = new Date('2026-10-01T08:00:00Z');
  const modules = new Set(INSTALLED_MODULES.map((m) => m.manifest.id));
  if (modules.has('backup')) {
    await em.insert(entity('BackupRun'), { id: '0190b000-0000-7000-8000-000000000001', fileName: 'forga-2026-10-01.backup', trigger: 'manual', userId: fx.ids.memberUser, userName: 'Tobias Probe', startedAt: at, finishedAt: at, status: 'ok' });
    await em.insert(entity('BackupRestore'), { id: '0190b000-0000-7000-8000-000000000002', fileName: 'forga-2026-10-01.backup', userId: fx.ids.memberUser, userName: 'Tobias Probe', startedAt: at, method: 'full', phase: 'done', steps: [] });
  }
  if (modules.has('info-terminal')) {
    await em.insert(entity('TerminalEntity'), {
      id: '0190b000-0000-7000-8000-000000000003', stationId: '0190b000-0000-7000-8000-000000000009', name: 'Gerätehaus', departmentIds: [fx.ids.department],
      keyHash: 'erasure-test', keyPrefix: 'erase', userId: fx.ids.otherUser, createdAt: at, createdBy: 'Tobias Probe', revokedAt: at, revokedBy: 'Tobias Probe', version: 1,
    });
  }
  if (modules.has('mp-feuer')) {
    await em.nativeUpdate(entity('MpFeuerRunEntity'), { id: '0190a000-0000-7000-8000-000000000001' }, { createdBy: 'Tobias Probe' });
    await em.insert(entity('MpFeuerMappingEntity'), { id: '0190b000-0000-7000-8000-000000000004', kind: 'person', value: 'Probe, Tobias', normalized: 'probe tobias', key: fx.ids.person, profile: 'incidents.personnel', createdBy: 'Max Dritter', createdAt: at, lastUsedAt: at });
  }
  return { fx, requestId: request.body.id as string };
}

/**
 * The member left long ago (directly in the database: leaving through the API would ask to return the jacket first,
 * and the seeds record data after this day).
 */
export async function leaveLongAgo(test: TestApp, personId: string, leftOn = '2000-06-30'): Promise<void> {
  await test.app.get(EntityManager).fork().nativeUpdate(entity('Person'), { id: personId }, { status: 'left', leftOn, exitReason: 'own-request' });
}

/** Every text and JSON value in the tables of the core and the modules that contains one of `needles`. */
export async function findAnywhere(test: TestApp, needles: readonly string[]): Promise<string[]> {
  const connection = test.app.get(EntityManager).getConnection();
  const schemas = ['core', ...INSTALLED_MODULES.map((m) => m.manifest.id.replace(/-/g, '_'))];
  const tables: { table_schema: string; table_name: string }[] = await connection.execute(
    `select table_schema, table_name from information_schema.tables where table_schema in (?) and table_type = 'BASE TABLE'`,
    [schemas],
  );
  const found: string[] = [];
  for (const { table_schema: schema, table_name: table } of tables) {
    const rows: { row: string }[] = await connection.execute(`select row_to_json(t)::text as row from "${schema}"."${table}" t`);
    for (const { row } of rows) {
      for (const needle of needles) if (row.includes(needle)) found.push(`${schema}.${table} contains „${needle}“: ${row.slice(0, 300)}`);
    }
  }
  return found;
}
