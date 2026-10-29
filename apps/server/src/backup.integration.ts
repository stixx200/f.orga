import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MailService } from '@forga/core-api';
import { BackupScheduler, newHeader, RestoreService, writeBackupFile } from '@forga/backup-api';
import { type TestApp, setUp, startTestApp, UI } from './testing/test-app';
import { TEST_DATABASE_URL } from './testing/test-database';

/**
 * The backup module against the test database (`TEST_DATABASE_URL`). `pg_dump`, `pg_restore` and `psql` of PostgreSQL 17
 * come from `FORGA_PG_BIN` (a folder; relative to the repository) or from the `PATH`, as in the CI. Without local
 * tools: `FORGA_PG_BIN=tools/pg-docker` runs them in the database container of docker/compose.dev.yml.
 */
function pgBin(): string | undefined {
  const bin = process.env.FORGA_PG_BIN;
  // The integration tests run in apps/server.
  return bin ? resolvePath('../..', bin) : undefined;
}

const PASSPHRASE = 'unsere-geheime-passphrase';
const BRIGADE = 'Feuerwehr Musterstadt';
const database = new URL(TEST_DATABASE_URL).pathname.slice(1);

let test: TestApp;
let admin: string;
let root: string;
let maintenanceFile: string;

const get = (path: string, cookie = admin) => test.http.get(`/api${path}`).set('Cookie', cookie);
const post = (path: string, body: unknown, cookie = admin) => test.http.post(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const put = (path: string, body: unknown, cookie = admin) => test.http.put(`/api${path}`).set('Cookie', cookie).set(UI).send(body as object);
const del = (path: string, cookie = admin) => test.http.delete(`/api${path}`).set('Cookie', cookie).set(UI);

type Entry = { id: string; fileName: string | null; trigger: string; status: string; size: number | null; errorCode: string | null; passphraseId: string | null; verification: { ok: boolean; error: string | null; objects: number | null; restoreTested: boolean; restoredCounts: Record<string, number | null> | null } | null };

const settings = (extra: object = {}) => ({ targetPath: 'forga', schedule: { mode: 'daily', time: '02:30' }, keepCount: 14, keepDays: 30, verifyAfterBackup: true, encryption: true, include: { plugins: true, settingsCopy: true }, notify: { onFailure: true, staleHours: 36 }, ...extra });

/** Waits until a backup is no longer running. */
async function finished(id: string): Promise<Entry> {
  for (let i = 0; i < 300; i++) {
    const entry = (await get(`/backup/backups/${id}`).expect(200)).body as Entry;
    if (entry.status !== 'running') return entry;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('backup did not finish');
}

async function backupNow(body: object = {}): Promise<Entry> {
  const started = (await post('/backup/backups', body).expect(202)).body as Entry;
  expect(started.status).toBe('running');
  return finished(started.id);
}

/** SQL in the maintenance database of the test server (connection from `TEST_DATABASE_URL`). */
function psql(sql: string): string {
  const url = new URL(TEST_DATABASE_URL);
  const env = { ...process.env, PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: 'postgres', PGHOST: url.hostname, PGPORT: url.port || '5432' };
  return execFileSync(pgBin() ? join(pgBin()!, 'psql') : 'psql', ['-X', '-A', '-t', '-c', sql], { encoding: 'utf8', env }).trim();
}

beforeAll(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'forga-backup-it-')));
  maintenanceFile = join(root, 'maintenance');
  const bin = pgBin();
  if (bin) process.env.FORGA_PG_BIN = bin;
  process.env.FORGA_SECRET_KEY = Buffer.alloc(32, 7).toString('base64');
  process.env.FORGA_MAINTENANCE_FILE = maintenanceFile;
  process.env.FORGA_BACKUP_SCHEDULER = 'off';
  process.env.FORGA_RESTORE_EXIT = 'off';
  process.env.FORGA_INSTANCE = 'test';
  delete process.env.FORGA_BACKUP_ROOT;
  // Databases left by an aborted earlier run.
  for (const name of psql(`select datname from pg_database where datname ~ '^${database}_(before|restore|restoretest)_'`).split('\n').filter(Boolean)) {
    psql(`drop database "${name}" with (force)`);
  }
  test = await startTestApp();
  admin = await setUp(test);
});

afterAll(async () => {
  await test?.app.close();
  rmSync(root, { recursive: true, force: true });
  delete process.env.FORGA_BACKUP_ROOT;
});

describe('backup', { timeout: 120_000 }, () => {
  it('needs backup.manage and is never available to API tokens', async () => {
    const role = await post('/core/roles', { name: 'Leser', permissions: ['core.audit.read'] }).expect(201);
    await post('/core/users', { username: 'leser', displayName: 'Leser', password: 'leser-passwort-1', roles: [{ roleId: role.body.id, departmentId: null }] }).expect(201);
    const reader = await test.login({ username: 'leser', password: 'leser-passwort-1' });
    await get('/backup/status', reader).expect(403);
    await post('/backup/backups', {}, reader).expect(403);
    const refused = await post('/core/tokens', { name: 'Sicherung', scopes: ['backup.manage'] }).expect(400);
    expect(refused.body.code).toBe('tokens.privilegedScopes');
    // The restore status is public but only answers the holder of the token.
    await test.http.get('/api/backup/restore/status?token=unknown').expect(404);
  });

  it('is only readable without FORGA_BACKUP_ROOT', async () => {
    const status = await get('/backup/status').expect(200);
    expect(status.body.configured).toBe(false);
    expect(status.body.warnings).toContain('backup.notConfigured');
    expect((await post('/backup/backups', {}).expect(400)).body.code).toBe('backup.notConfigured');
    process.env.FORGA_BACKUP_ROOT = root;
  });

  it('stays quiet until it is set up: no warnings, tasks or open setup step', async () => {
    const status = await get('/backup/status').expect(200);
    expect(status.body).toMatchObject({ configured: true, settingsSaved: false, warnings: [] });
    expect((await get('/core/tasks').expect(200)).body.some((t: { module: string }) => t.module === 'backup')).toBe(false);
    const onboarding = (await get('/core/onboarding').expect(200)).body as { key: string }[];
    expect(onboarding.some((item) => item.key === 'module:backup')).toBe(false);
    expect(await test.app.get(BackupScheduler).runIfDue(new Date())).toBeNull();
  });

  it('stores the passphrase encrypted and write-only', async () => {
    expect((await put('/backup/settings', settings({ passphrase: PASSPHRASE, passphraseRepeat: 'anders-als-vorher', passphraseKeptSafe: true })).expect(400)).body.code).toBe('backup.passphraseMismatch');
    expect((await put('/backup/settings', settings({ passphrase: PASSPHRASE, passphraseRepeat: PASSPHRASE })).expect(400)).body.code).toBe('backup.passphraseNotConfirmed');
    expect((await put('/backup/settings', settings({ targetPath: '../etc' })).expect(400)).body.code).toBe('backup.pathOutsideRoot');
    expect((await put('/backup/settings', settings({ encryption: false })).expect(400)).body.code).toBe('backup.unencryptedNotConfirmed');
    await put('/backup/settings', settings({ passphrase: 'zu-kurz' })).expect(400);

    const saved = await put('/backup/settings', settings({ passphrase: PASSPHRASE, passphraseRepeat: PASSPHRASE, passphraseKeptSafe: true })).expect(200);
    expect(saved.body).toMatchObject({ passphraseSet: true, passphraseUnreadable: false, targetPath: 'forga' });
    expect(saved.body.passphraseId).toMatch(/^[0-9A-F]{8}$/);
    expect(JSON.stringify(saved.body)).not.toContain(PASSPHRASE);
    // Only through /api/backup/settings, not through the generic settings endpoint.
    await get('/core/settings/backup.general').expect(404);
    const exported = JSON.stringify((await get('/core/export/core').expect(200)).body);
    expect(exported).not.toContain('passphraseEncrypted');
    const history = await get('/core/history/core.setting/backup.general').expect(200);
    expect(JSON.stringify(history.body)).not.toContain('v1.');
    expect(JSON.stringify(history.body)).toContain('••••••');

    const target = await post('/backup/settings/test-target', {}).expect(200);
    expect(target.body).toMatchObject({ writable: true, error: null, path: join(root, 'forga') });
    expect(target.body.freeBytes).toBeGreaterThan(0);
    expect((await post('/backup/settings/test-target', { targetPath: '/etc' }).expect(200)).body.error).toBe('backup.pathOutsideRoot');
  });

  let first: Entry;

  it('backs up now, encrypted, and verifies the backup', async () => {
    first = await backupNow();
    expect(first).toMatchObject({ status: 'ok', trigger: 'manual', errorCode: null });
    expect(first.fileName).toMatch(/^forga-test-\d{4}-\d{2}-\d{2}_\d{4}\.forgabackup$/);
    expect(first.verification).toMatchObject({ ok: true, error: null, restoreTested: false });
    expect(first.verification!.objects).toBeGreaterThan(50);
    const file = readFileSync(join(root, 'forga', first.fileName!));
    expect(file.subarray(0, 8).toString()).toBe('FORGABAK');
    expect(file.length).toBe(first.size);
    // Neither the dump nor the brigade name are readable in the file.
    expect(file.includes(Buffer.from('PGDMP'))).toBe(false);
    expect(file.includes(Buffer.from(BRIGADE))).toBe(false);
    const status = await get('/backup/status').expect(200);
    expect(status.body.lastSuccess.id).toBe(first.id);
    expect(status.body.backups).toBe(1);
    expect(status.body.tools.pgDump).toMatch(/^17/);
    expect(status.body.warnings).toEqual([]);
    const audit = await get('/core/audit?action=backup.').expect(200);
    expect(audit.body.map((e: { action: string }) => e.action)).toContain('backup.created');
  });

  it('tests the restore into a temporary database', async () => {
    const tested = (await post(`/backup/backups/${first.id}/verify`, { restoreTest: true }).expect(200)).body as Entry;
    expect(tested.verification).toMatchObject({ ok: true, restoreTested: true });
    expect(tested.verification!.restoredCounts).toEqual({ persons: 0, incidents: 0, reports: 0, sessions: 0 });
    expect(psql(`select count(*) from pg_database where datname like '${database}_restoretest_%'`)).toBe('0');
    const wrong = (await post(`/backup/backups/${first.id}/verify`, { passphrase: 'eine-falsche-passphrase' }).expect(200)).body as Entry;
    expect(wrong.verification).toMatchObject({ ok: false, error: 'backup.wrongPassphrase' });
  });

  it('downloads a backup as it lies in the folder', async () => {
    const response = await get(`/backup/backups/${first.id}/file`).buffer(true).parse((res, done) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => done(null, Buffer.concat(chunks)));
    }).expect(200);
    expect((response.body as Buffer).equals(readFileSync(join(root, 'forga', first.fileName!)))).toBe(true);
    expect(response.headers['content-disposition']).toContain(first.fileName!);
    const audit = await get('/core/audit?action=backup.downloaded').expect(200);
    expect(audit.body).toHaveLength(1);
  });

  it('lists foreign and uploaded files and deletes only own ones', async () => {
    const { header, key } = await newHeader({ appVersion: '0.1.0', instance: 'real', instanceId: 'other-installation', createdAt: '2026-10-01T20:14:00.000Z', trigger: 'manual', passphraseId: null }, 'passphrase-des-echtsystems');
    await writeBackupFile(join(root, 'forga', 'forga-real-2026-10-01_2214.forgabackup'), header, key, async (writer) => {
      await writer.entry('manifest.json', Buffer.from('{}'));
    });
    writeFileSync(join(root, 'forga', 'notes.txt'), 'not a backup');
    const list = (await get('/backup/backups').expect(200)).body as Entry[];
    const foreign = list.find((e) => e.fileName === 'forga-real-2026-10-01_2214.forgabackup')!;
    expect(foreign).toMatchObject({ trigger: 'foreign', status: 'ok' });
    expect((await del(`/backup/backups/${foreign.id}`).expect(400)).body.code).toBe('backup.foreignNotDeletable');
    expect(list).toHaveLength(2);

    const content = readFileSync(join(root, 'forga', first.fileName!));
    const uploaded = await test.http.post('/api/backup/backups/upload?name=vom-alten-server.forgabackup').set('Cookie', admin).set(UI).set('Content-Type', 'application/octet-stream').send(content).expect(201);
    expect(uploaded.body).toMatchObject({ trigger: 'upload', status: 'ok', size: content.length });
    await test.http.post('/api/backup/backups/upload?name=../evil.forgabackup').set('Cookie', admin).set(UI).set('Content-Type', 'application/octet-stream').send(content).expect(400);
    const refused = await test.http.post('/api/backup/backups/upload?name=kein-backup.forgabackup').set('Cookie', admin).set(UI).set('Content-Type', 'application/octet-stream').send(Buffer.from('hello')).expect(400);
    expect(refused.body.code).toBe('backup.notABackup');
    expect(existsSync(join(root, 'forga', 'kein-backup.forgabackup'))).toBe(false);

    await del(`/backup/backups/${uploaded.body.id}`).expect(204);
    expect(existsSync(join(root, 'forga', 'vom-alten-server.forgabackup'))).toBe(false);
    expect(((await get('/backup/backups').expect(200)).body as Entry[]).some((e) => e.id === uploaded.body.id)).toBe(false);
    rmSync(join(root, 'forga', 'forga-real-2026-10-01_2214.forgabackup'));
    expect(((await get('/backup/backups').expect(200)).body as Entry[]).some((e) => e.trigger === 'foreign')).toBe(false);
  });

  it('runs the scheduled backup once when due and applies the retention', async () => {
    const scheduler = test.app.get(BackupScheduler);
    const now = new Date();
    const local = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now.getTime() - 60_000));
    await put('/backup/settings', settings({ schedule: { mode: 'daily', time: local }, keepCount: 1, keepDays: 0, verifyAfterBackup: false })).expect(200);
    const run = await scheduler.runIfDue(now);
    expect(run).toMatchObject({ trigger: 'scheduled', status: 'ok' });
    expect(await scheduler.runIfDue(new Date(now.getTime() + 30_000))).toBeNull();
    // keepCount 1, keepDays 0: the first backup is gone.
    expect(existsSync(join(root, 'forga', first.fileName!))).toBe(false);
    const list = (await get('/backup/backups').expect(200)).body as Entry[];
    expect(list.map((e) => e.trigger)).toEqual(['scheduled']);
    const audit = await get('/core/audit?action=backup.pruned').expect(200);
    expect(audit.body[0].details.files).toEqual([first.fileName]);
    await put('/backup/settings', settings()).expect(200);
  });

  it('reports a failed backup by task and e-mail', async () => {
    await put('/core/settings/smtp', { host: 'smtp.example.org', sender: 'forga@example.org' }).expect(200);
    const role = await post('/core/roles', { name: 'Sicherung melden', permissions: ['backup.notify'] }).expect(201);
    await post('/core/users', { username: 'it-betreuer', displayName: 'IT-Betreuer', email: 'it@example.org', password: 'it-passwort-123', roles: [{ roleId: role.body.id, departmentId: null }] }).expect(201);
    // A file where the target folder should be: the target is not writable.
    writeFileSync(join(root, 'blocked'), 'x');
    // Three hours later than the scheduled backup before.
    const later = new Date(Date.now() + 3 * 3_600_000);
    const local = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(later.getTime() - 60_000));
    await put('/backup/settings', settings({ targetPath: 'blocked', schedule: { mode: 'daily', time: local } })).expect(200);
    const sent = test.app.get(MailService).sent.length;
    const failed = await test.app.get(BackupScheduler).runIfDue(later);
    expect(failed).toMatchObject({ trigger: 'scheduled', status: 'failed' });
    const mails = test.app.get(MailService).sent.slice(sent);
    expect(mails.map((m) => m.to)).toEqual(['it@example.org']);
    expect(mails[0].subject).toContain('Datensicherung fehlgeschlagen');
    const tasks = await get('/core/tasks').expect(200);
    expect(tasks.body.map((t: { module: string; kind: string }) => `${t.module}:${t.kind}`)).toContain('backup:failed');
    const status = await get('/backup/status').expect(200);
    expect(status.body.warnings).toEqual(expect.arrayContaining(['backup.lastFailed', 'backup.targetNotWritable']));
    expect((await post('/backup/backups', {}).expect(400)).body.code).toBe('backup.targetNotWritable');
    await put('/backup/settings', settings()).expect(200);
    await backupNow();
    expect((await get('/core/tasks').expect(200)).body.some((t: { module: string }) => t.module === 'backup')).toBe(false);
  });

  it('refuses restores with a wrong name or passphrase and backups of newer versions', async () => {
    const latest = ((await get('/backup/backups').expect(200)).body as Entry[]).find((e) => e.status === 'ok')!;
    const restore = (body: object) => post('/backup/restore', { backupId: latest.id, passphrase: PASSPHRASE, confirmName: BRIGADE, usersInformed: true, ...body });
    expect((await restore({ confirmName: 'Feuerwehr Anderswo' }).expect(400)).body.code).toBe('backup.confirmNameMismatch');
    expect((await restore({ passphrase: 'eine-falsche-passphrase' }).expect(400)).body.code).toBe('backup.wrongPassphrase');
    await restore({ usersInformed: false }).expect(400);

    const { header, key } = await newHeader({ appVersion: '99.0.0', instance: 'test', instanceId: 'x', createdAt: new Date().toISOString(), trigger: 'manual', passphraseId: null }, PASSPHRASE);
    const manifest = { format: 1, appVersion: '99.0.0', instance: 'test', instanceId: 'x', createdAt: new Date().toISOString(), trigger: 'manual', modules: [], migrations: ['core/Migration29991231000000_future'], postgres: { server: '17', dump: '17' }, counts: { persons: 0, incidents: 0, reports: 0, sessions: 0 }, includes: { plugins: false, settings: false } };
    await writeBackupFile(join(root, 'forga', 'forga-future.forgabackup'), header, key, async (writer) => {
      await writer.entry('manifest.json', Buffer.from(JSON.stringify(manifest)));
      await writer.entry('database.dump', Readable.from([Buffer.from('not used')]));
    });
    const future = ((await get('/backup/backups').expect(200)).body as Entry[]).find((e) => e.fileName === 'forga-future.forgabackup')!;
    const refused = await post('/backup/restore', { backupId: future.id, passphrase: PASSPHRASE, confirmName: BRIGADE, usersInformed: true }).expect(400);
    expect(refused.body).toMatchObject({ code: 'backup.newerVersion', version: '99.0.0' });
    rmSync(join(root, 'forga', 'forga-future.forgabackup'));
    expect(existsSync(maintenanceFile)).toBe(false);
  });

  it('keeps the running database when restoring fails', async () => {
    const createdAt = new Date().toISOString();
    const { header, key } = await newHeader({ appVersion: '0.1.0', instance: 'test', instanceId: 'x', createdAt, trigger: 'manual', passphraseId: null }, PASSPHRASE);
    const manifest = { format: 1, appVersion: '0.1.0', instance: 'test', instanceId: 'x', createdAt, trigger: 'manual', modules: [], migrations: [], postgres: { server: '17', dump: '17' }, counts: { persons: 0, incidents: 0, reports: 0, sessions: 0 }, includes: { plugins: false, settings: false } };
    await writeBackupFile(join(root, 'forga', 'forga-broken.forgabackup'), header, key, async (writer) => {
      await writer.entry('manifest.json', Buffer.from(JSON.stringify(manifest)));
      await writer.entry('database.dump', Readable.from([Buffer.from('this is not a pg_dump archive')]));
    });
    const broken = ((await get('/backup/backups').expect(200)).body as Entry[]).find((e) => e.fileName === 'forga-broken.forgabackup')!;
    const started = await post('/backup/restore', { backupId: broken.id, passphrase: PASSPHRASE, confirmName: BRIGADE, usersInformed: true }).expect(202);
    let progress: { phase: string; error: string | null; steps: { step: string; state: string }[] } = { phase: 'running', error: null, steps: [] };
    for (let i = 0; i < 600 && progress.phase === 'running'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      progress = (await test.http.get(`/api/backup/restore/status?token=${started.body.token}`).expect(200)).body;
    }
    expect(progress).toMatchObject({ phase: 'failed', error: 'backup.restoreFailed' });
    expect(progress.steps.find((s) => s.step === 'safetyBackup')?.state).toBe('done');
    expect(existsSync(maintenanceFile)).toBe(false);
    // Still the running database: the session works, nothing was swapped.
    await get('/core/session').expect(200);
    expect(psql(`select count(*) from pg_database where datname like '${database}_restore_%' or datname like '${database}_before_%'`)).toBe('0');
    const audit = await get('/core/audit?action=backup.restore-failed').expect(200);
    expect(audit.body[0].details.code).toBe('backup.restoreFailed');
    rmSync(join(root, 'forga', 'forga-broken.forgabackup'));
  });

  it('restores a backup into a new database, swaps and finishes after the restart', async () => {
    const latest = ((await get('/backup/backups').expect(200)).body as Entry[]).find((e) => e.status === 'ok' && e.trigger === 'manual')!;
    const check = await post('/backup/restore/check', { backupId: latest.id, passphrase: PASSPHRASE }).expect(200);
    expect(check.body).toMatchObject({ verification: { ok: true, compatible: true }, brigadeName: BRIGADE, restoreMethod: 'swap' });
    // Changes after the backup: gone after the restore.
    await post('/core/users', { username: 'spaeter', displayName: 'Später angelegt', password: 'spaeter-passwort-1' }).expect(201);

    const started = await post('/backup/restore', { backupId: latest.id, passphrase: PASSPHRASE, confirmName: ' feuerwehr musterstadt ', usersInformed: true }).expect(202);
    const token = started.body.token as string;
    let progress: { phase: string; steps: { step: string; state: string }[]; error: string | null; errorDetail: string | null } = { phase: 'running', steps: [], error: null, errorDetail: null };
    let sawMaintenance = false;
    for (let i = 0; i < 600 && progress.phase === 'running'; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      progress = (await test.http.get(`/api/backup/restore/status?token=${token}`).expect(200)).body;
      if (!sawMaintenance && progress.steps.find((s) => s.step === 'maintenance')?.state === 'done' && progress.phase === 'running') {
        // Everything else answers 503 during the maintenance, also the kiosk of the info terminals.
        const session = await get('/core/session').expect(503);
        expect(session.body.code).toBe('maintenance');
        expect(session.headers['retry-after']).toBeDefined();
        await test.http.get('/api/info-terminal/kiosk/state').expect(503);
        await test.http.post('/api/core/login').send({ username: 'admin', password: 'x' }).expect(503);
        sawMaintenance = true;
      }
    }
    expect(progress.error, progress.errorDetail ?? '').toBeNull();
    expect(progress.phase).toBe('restarting');
    expect(sawMaintenance).toBe(true);
    expect(progress.steps.map((s) => `${s.step}:${s.state}`)).toEqual(['maintenance:done', 'safetyBackup:done', 'restore:done', 'swap:done', 'plugins:done', 'restart:running']);
    const before = psql(`select datname from pg_database where datname like '${database}_before_%'`);
    expect(before).toMatch(new RegExp(`^${database}_before_\\d{8}_\\d{6}$`));

    // The restart: the process ended, Docker starts it again on the swapped database.
    await test.app.close();
    test = await startTestApp({}, { keepDatabase: true });
    expect(existsSync(maintenanceFile)).toBe(false);
    const done = await test.http.get(`/api/backup/restore/status?token=${token}`).expect(200);
    expect(done.body.phase).toBe('done');
    // All sessions are gone; the account of the backup signs in.
    await get('/core/session').expect(401);
    admin = await test.login();
    const users = (await get('/core/users').expect(200)).body as { username: string }[];
    expect(users.some((u) => u.username === 'spaeter')).toBe(false);
    const audit = (await get('/core/audit?action=backup.restored').expect(200)).body as { details: { previousDatabase: string } }[];
    expect(audit[0].details.previousDatabase).toBe(before);
    const list = (await get('/backup/backups').expect(200)).body as Entry[];
    expect(list.find((e) => e.trigger === 'safety')).toMatchObject({ status: 'ok' });
    const status = await get('/backup/status').expect(200);
    expect(status.body.oldDatabases).toEqual([before]);
    expect(status.body.events[0].kind).toBe('restored');
    await del(`/backup/previous-databases/${before}`).expect(204);
    expect(psql(`select count(*) from pg_database where datname like '${database}_before_%' or datname like '${database}_restore_%'`)).toBe('0');
    expect(readdirSync(join(root, 'forga')).filter((f) => f.endsWith('.part'))).toEqual([]);
  });

  it('restores real data into the test system only with a reason and deletes all data after 7 days', async () => {
    // A backup of the real system …
    process.env.FORGA_STAGE = 'production';
    const real = await backupNow({ verify: false });
    expect(real.status).toBe('ok');
    // … restored in the test system.
    process.env.FORGA_STAGE = 'test';
    try {
      expect((await post('/backup/restore/check', { backupId: real.id, passphrase: PASSPHRASE }).expect(200)).body.realData).toBe(true);
      const restore = (body: object) => post('/backup/restore', { backupId: real.id, passphrase: PASSPHRASE, confirmName: BRIGADE, usersInformed: true, ...body });
      expect((await restore({}).expect(400)).body.code).toBe('backup.realDataReasonRequired');
      expect((await restore({ realDataReason: 'kurz' }).expect(400)).body.code).toBe('backup.realDataReasonRequired');
      const reason = 'Wiederherstellungsprobe nach dem Sicherungskonzept';
      const token = (await restore({ realDataReason: reason }).expect(202)).body.token as string;
      let phase = 'running';
      for (let i = 0; i < 600 && phase === 'running'; i++) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        phase = (await test.http.get(`/api/backup/restore/status?token=${token}`).expect(200)).body.phase;
      }
      expect(phase).toBe('restarting');
      await test.app.close();
      test = await startTestApp({}, { keepDatabase: true });
      admin = await test.login();
      const status = (await get('/backup/status').expect(200)).body;
      expect(status.realData).toMatchObject({ reason });
      const days = (new Date(status.realData.deleteAt).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(6.9);
      expect(days).toBeLessThanOrEqual(7);
      const audit = (await get('/core/audit?action=backup.restored').expect(200)).body as { details: { realDataReason?: string } }[];
      expect(audit[0].details.realDataReason).toBe(reason);
      for (const name of psql(`select datname from pg_database where datname like '${database}_before_%'`).split('\n').filter(Boolean)) await del(`/backup/previous-databases/${name}`).expect(204);

      // After 7 days everything goes, also the uploaded backup of the real system; the next start asks for the setup.
      const restores = test.app.get(RestoreService);
      expect(await restores.deleteExpiredRealData(new Date())).toBe(false);
      expect(existsSync(join(root, 'forga', real.fileName!))).toBe(true);
      expect(await restores.deleteExpiredRealData(new Date(Date.now() + 8 * 86_400_000))).toBe(true);
      expect(existsSync(join(root, 'forga', real.fileName!))).toBe(false);
      await test.app.close();
      test = await startTestApp({}, { keepDatabase: true });
      expect((await test.http.get('/api/core/setup').expect(200)).body).toMatchObject({ required: true, stage: 'test' });
    } finally {
      delete process.env.FORGA_STAGE;
    }
  });
});
