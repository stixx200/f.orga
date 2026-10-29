import { createReadStream, createWriteStream, type ReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, statfs, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { BadRequestException, ConflictException, HttpException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import {
  Audit,
  FORGA_CORE_OPTIONS,
  forgaStage,
  type ForgaCoreOptions,
  Notifications,
  readTarGz,
  safePath,
  Setting,
  writeTarGz,
} from '@forga/core-api';
import { FORGA_VERSION, SECRET_SETTING_FIELDS } from '@forga/core-contracts';
import {
  BACKUP_NOTIFY,
  type BackupCounts,
  type BackupEntry,
  BackupManifest,
  type BackupTrigger,
  type TargetCheck,
  type Verification,
} from '@forga/backup-contracts';
import { BackupRun } from '../backup.entities.js';
import { BackupError, bufferSink, discardSink, type EntrySink, newHeader, openBackupFile, readFileHeader, readPayload } from '../format/backup-format.js';
import { writeBackupFile } from '../format/backup-file.js';
import { backupEnvironment } from '../runtime/environment.js';
import { OutputTail, PgTools, quoteIdent } from '../runtime/pg-tools.js';
import { BackupSettingsService, type LoadedSettings } from '../settings/backup-settings.service.js';
import { COUNT_SQL, parseCounts, stampedDatabase, stdinSink, summarizeList } from './database.js';
import { backupFileName, ensureTarget, isBackupFileName, type RetentionCandidate, selectForPruning } from './rules.js';

/** Who triggered something; `null` for the scheduler. */
export interface Actor {
  id: string;
  displayName: string;
}

/** Safety backups before a restore are kept at least this long. */
const SAFETY_KEEP_DAYS = 30;
const MAX_PLUGINS = 50 * 1024 * 1024;

export function toEntry(run: BackupRun): BackupEntry {
  return {
    id: run.id,
    fileName: run.fileName ?? null,
    trigger: run.trigger,
    userName: run.userName ?? null,
    startedAt: run.startedAt.toISOString(),
    durationMs: run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
    size: run.size ?? null,
    status: run.status,
    errorCode: run.errorCode ?? null,
    encrypted: run.encrypted ?? null,
    passphraseId: run.passphraseId ?? null,
    instance: run.instance ?? null,
    appVersion: run.appVersion ?? null,
    keepUntil: run.keepUntil?.toISOString() ?? null,
    verification: run.verification ?? null,
  };
}

/** Is version `a` newer than `b` (dotted numbers)? */
export function isNewer(a: string, b: string): boolean {
  const left = a.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  const right = b.split(/[.-]/).map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    if ((left[i] ?? 0) !== (right[i] ?? 0)) return (left[i] ?? 0) > (right[i] ?? 0);
  }
  return false;
}

const errorCode = (error: unknown, fallback: string) => (error instanceof BackupError ? error.code : error instanceof HttpException ? ((error.getResponse() as { code?: string }).code ?? fallback) : fallback);
const errorDetail = (error: unknown) => (error instanceof BackupError ? error.detail : error instanceof Error ? error.message : String(error));

/** Maps a module error to an HTTP error with its code. */
export function httpError(error: unknown, status = 400): never {
  if (error instanceof BackupError) throw new HttpException({ code: error.code, ...error.extra }, status);
  throw error;
}

/**
 * Creating, listing, verifying, downloading and deleting backups in the target folder below `FORGA_BACKUP_ROOT`.
 * At most one backup runs at a time (in the process and with an advisory lock in the database).
 */
@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private running: string | null = null;

  constructor(
    private readonly em: EntityManager,
    private readonly settings: BackupSettingsService,
    private readonly pg: PgTools,
    private readonly audit: Audit,
    private readonly notifications: Notifications,
    @Inject(FORGA_CORE_OPTIONS) private readonly options: ForgaCoreOptions,
  ) {}

  get isRunning(): boolean {
    return this.running !== null;
  }

  // ----- Target -----

  /** The target folder (created if needed); `backup.notConfigured` without `FORGA_BACKUP_ROOT`. */
  async target(settings?: LoadedSettings): Promise<string> {
    const root = backupEnvironment.root();
    if (!root) throw new BackupError('backup.notConfigured');
    const loaded = settings ?? (await this.settings.load());
    return ensureTarget(root, loaded.settings.targetPath);
  }

  /** „Ziel prüfen“: writes and deletes a test file and reports the free space. */
  async checkTarget(targetPath?: string): Promise<TargetCheck> {
    const root = backupEnvironment.root();
    const checkedAt = new Date().toISOString();
    if (!root) return { path: '', writable: false, freeBytes: null, error: 'backup.notConfigured', checkedAt };
    const loaded = await this.settings.load();
    const relativePath = targetPath ?? loaded.settings.targetPath;
    let path = join(root, relativePath);
    try {
      path = await ensureTarget(root, relativePath);
      const probe = join(path, `.forga-write-test-${process.pid}`);
      await writeFile(probe, 'f.orga');
      await rm(probe, { force: true });
      return { path, writable: true, freeBytes: await this.freeBytes(path), error: null, checkedAt };
    } catch (error) {
      return { path, writable: false, freeBytes: null, error: errorCode(error, 'backup.targetNotWritable') === 'backup.pathOutsideRoot' ? 'backup.pathOutsideRoot' : 'backup.targetNotWritable', checkedAt };
    }
  }

  async freeBytes(path: string): Promise<number | null> {
    try {
      const info = await statfs(path);
      return Number(info.bavail) * Number(info.bsize);
    } catch {
      return null;
    }
  }

  // ----- List -----

  /**
   * Backups newest first. The target folder is compared with the records: files without a record get one (as
   * „fremd“ when they come from another installation), records whose file is gone show „Datei fehlt“.
   */
  async list(): Promise<BackupEntry[]> {
    const em = this.em.fork();
    let files: string[] | null = null;
    let target: string | null = null;
    let targetPath: string | null = null;
    try {
      const loaded = await this.settings.load();
      target = await this.target(loaded);
      targetPath = loaded.settings.targetPath;
      files = (await readdir(target)).filter(isBackupFileName);
    } catch {
      files = null;
    }
    const runs = await em.find(BackupRun, { status: { $ne: 'deleted' } }, { orderBy: { startedAt: 'desc' } });
    const removed = new Set<BackupRun>();
    if (files && target) {
      const present = new Set(files);
      const known = new Set(runs.filter((r) => r.fileName).map((r) => r.fileName!));
      const instanceId = (await this.settings.load()).secrets.instanceId ?? null;
      for (const name of files.filter((f) => !known.has(f))) {
        const header = await readFileHeader(join(target, name));
        if (!header) continue;
        const own = Boolean(instanceId) && header.instanceId === instanceId && header.trigger !== 'foreign';
        const createdAt = new Date(header.createdAt);
        const trigger = (own ? header.trigger : 'foreign') as BackupTrigger;
        runs.push(
          em.create(BackupRun, {
            fileName: name,
            targetPath,
            trigger,
            startedAt: Number.isNaN(createdAt.getTime()) ? new Date() : createdAt,
            size: (await stat(join(target, name))).size,
            status: 'ok',
            encrypted: Boolean(header.encryption),
            passphraseId: header.passphraseId,
            instance: header.instance,
            appVersion: header.appVersion,
            keepUntil: trigger === 'safety' ? new Date(createdAt.getTime() + SAFETY_KEEP_DAYS * 86_400_000) : null,
          }),
        );
      }
      for (const run of runs) {
        if (!run.fileName || run.status === 'running' || run.status === 'failed') continue;
        if (run.status === 'ok' && !present.has(run.fileName)) {
          if (run.trigger === 'foreign') {
            em.remove(run);
            removed.add(run);
          } else run.status = 'missing';
        } else if (run.status === 'missing' && present.has(run.fileName)) {
          run.status = 'ok';
        }
      }
      await em.flush();
    }
    return runs
      .filter((r) => !removed.has(r))
      .toSorted((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .map(toEntry);
  }

  async find(id: string): Promise<BackupRun> {
    const run = /^[0-9a-f-]{36}$/i.test(id) ? await this.em.fork().findOne(BackupRun, { id }) : null;
    if (!run || run.status === 'deleted') throw new NotFoundException({ code: 'backup.notFound' });
    return run;
  }

  /** Path of the file of a backup; `backup.fileMissing` if it is gone. */
  async fileOf(run: BackupRun): Promise<string> {
    if (!run.fileName || run.status === 'failed' || run.status === 'running') throw new BadRequestException({ code: 'backup.fileMissing' });
    const target = await this.target().catch((error: unknown) => httpError(error));
    const path = join(target, run.fileName);
    if (!(await stat(path).catch(() => null))?.isFile()) throw new BadRequestException({ code: 'backup.fileMissing' });
    return path;
  }

  // ----- Create -----

  /**
   * Starts a backup and returns its record (status `running`); the work goes on in the background. Problems found
   * before (not set up, no passphrase, another backup running) are thrown at once.
   */
  async start(trigger: BackupTrigger, actor: Actor | null, options: { verify: boolean; passphrase?: string | null }): Promise<{ run: BackupRun; done: Promise<BackupRun> }> {
    if (this.running) throw new ConflictException({ code: 'backup.running' });
    const loaded = await this.settings.load();
    const target = await this.target(loaded).catch((error: unknown) => httpError(error));
    const passphrase = loaded.settings.encryption ? options.passphrase || this.settings.passphraseOf(loaded) : null;
    if (loaded.settings.encryption && !passphrase) throw new BadRequestException({ code: 'backup.noPassphrase' });
    if (this.running) throw new ConflictException({ code: 'backup.running' });

    const em = this.em.fork();
    const run = em.create(BackupRun, {
      trigger,
      userId: actor?.id ?? null,
      userName: actor?.displayName ?? null,
      startedAt: new Date(),
      status: 'running',
      targetPath: loaded.settings.targetPath,
      encrypted: Boolean(passphrase),
      instance: backupEnvironment.instance(),
      appVersion: FORGA_VERSION,
      keepUntil: trigger === 'safety' ? new Date(Date.now() + SAFETY_KEEP_DAYS * 86_400_000) : null,
    });
    await em.flush();
    this.running = run.id;
    const done = this.create(run.id, target, loaded, passphrase, options.verify).finally(() => (this.running = null));
    // Errors are recorded on the backup; the caller decides whether to wait.
    done.catch(() => undefined);
    return { run, done };
  }

  private async create(runId: string, target: string, loaded: LoadedSettings, passphrase: string | null, verify: boolean): Promise<BackupRun> {
    const em = this.em.fork();
    const run = await em.findOneOrFail(BackupRun, { id: runId });
    try {
      // Estimate the space from the latest backup; a full disk would leave a broken part file behind.
      const latest = await em.findOne(BackupRun, { status: 'ok', size: { $ne: null } }, { orderBy: { startedAt: 'desc' } });
      const free = await this.freeBytes(target);
      if (latest?.size && free !== null && free < latest.size * 1.2) throw new BackupError('backup.diskFull', `${free} bytes free`);

      await em.transactional(async (tx) => {
        // A second process (e.g. a second container on the same database) must not back up at the same time.
        const [lock] = await tx.getConnection().execute<{ locked: boolean }[]>("select pg_try_advisory_xact_lock(hashtext('forga.backup')) as locked", [], 'all', tx.getTransactionContext());
        if (!lock?.locked) throw new BackupError('backup.running');
        const manifest = await this.manifest(run.trigger, run.startedAt, loaded);
        const instanceId = manifest.instanceId;
        const { header, key } = await newHeader(
          { appVersion: FORGA_VERSION, instance: manifest.instance, instanceId, createdAt: run.startedAt.toISOString(), trigger: run.trigger, passphraseId: passphrase ? loaded.secrets.passphraseId ?? null : null },
          passphrase,
        );
        if (passphrase && loaded.secrets.passphraseId && passphrase !== this.settings.passphraseOf(loaded)) header.passphraseId = null;
        let name = backupFileName(manifest.instance, run.startedAt);
        for (let n = 2; await stat(join(target, name)).catch(() => null); n++) name = name.replace(/(-\d+)?\.forgabackup$/, `-${n}.forgabackup`);
        run.fileName = name;
        run.passphraseId = header.passphraseId;
        run.size = await writeBackupFile(join(target, name), header, key, async (writer) => {
          await writer.entry('manifest.json', Buffer.from(JSON.stringify(manifest), 'utf8'));
          const stderr = new OutputTail();
          const dump = this.pg.spawn('pg_dump', ['--format=custom', '--no-password']);
          dump.stderr.on('data', (chunk: Buffer) => stderr.add(chunk));
          dump.stdin.end();
          const exit = PgTools.finished(dump, 'backup.dumpFailed', stderr);
          exit.catch(() => undefined);
          await writer.entry('database.dump', dump.stdout);
          await exit;
          if (manifest.includes.plugins) await writer.entry('plugins.tgz', await this.packPlugins());
          if (manifest.includes.settings) await writer.entry('settings.json', Buffer.from(JSON.stringify(await this.settingsCopy(), null, 2), 'utf8'));
        });
        run.manifest = manifest;
      });
      run.finishedAt = new Date();
    } catch (error) {
      run.status = 'failed';
      run.fileName = null;
      run.finishedAt = new Date();
      run.errorCode = errorCode(error, 'backup.failed');
      run.errorDetail = errorDetail(error)?.slice(0, 4000) ?? null;
      await em.flush();
      this.logger.error(`Backup failed: ${run.errorCode} ${run.errorDetail ?? ''}`);
      await this.audit.log('backup.failed', { backupId: run.id, trigger: run.trigger, code: run.errorCode }, run.userId ?? null);
      if (loaded.settings.notify.onFailure) await this.notifyFailure(run);
      throw error;
    }
    // „Danach prüfen“: the backup counts as finished once it has been read back.
    if (verify) run.verification = await this.verify(join(target, run.fileName!), passphrase, { restoreTest: false });
    run.status = 'ok';
    await em.flush();
    await this.audit.log('backup.created', { backupId: run.id, fileName: run.fileName, trigger: run.trigger, size: run.size, verified: run.verification?.ok ?? null }, run.userId ?? null);
    await this.prune(loaded, target).catch((error: unknown) => this.logger.error('Applying the retention failed', error instanceof Error ? error.stack : String(error)));
    return run;
  }

  /** Records a scheduled backup that could not even start (e.g. target missing, no passphrase) and reports it. */
  async recordFailure(trigger: BackupTrigger, error: unknown): Promise<BackupRun> {
    const loaded = await this.settings.load();
    const em = this.em.fork();
    const now = new Date();
    const run = em.create(BackupRun, {
      trigger,
      startedAt: now,
      finishedAt: now,
      status: 'failed',
      targetPath: loaded.settings.targetPath,
      instance: backupEnvironment.instance(),
      appVersion: FORGA_VERSION,
      errorCode: errorCode(error, 'backup.failed'),
      errorDetail: errorDetail(error)?.slice(0, 4000) ?? null,
    });
    await em.flush();
    await this.audit.log('backup.failed', { backupId: run.id, trigger, code: run.errorCode }, null);
    if (loaded.settings.notify.onFailure) await this.notifyFailure(run);
    return run;
  }

  /** Task (through the deadline provider) and e-mail to the holders of `backup.notify`. */
  private async notifyFailure(run: BackupRun): Promise<void> {
    const texts = {
      de: { subject: 'f.orga: Datensicherung fehlgeschlagen', text: `die Datensicherung vom ${run.startedAt.toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })} ist fehlgeschlagen (${run.errorCode}). Bitte prüfen Sie die Datensicherung in f.orga.` },
      en: { subject: 'f.orga: backup failed', text: `the backup of ${run.startedAt.toLocaleString('en-GB', { timeZone: 'Europe/Berlin' })} failed (${run.errorCode}). Please check the backup in f.orga.` },
    };
    await this.notifications.notify({
      permission: BACKUP_NOTIFY,
      departmentId: null,
      compose: (language, displayName) => ({ subject: texts[language].subject, text: `${language === 'de' ? 'Hallo' : 'Hello'} ${displayName},\n\n${texts[language].text}` }),
      path: '/backup',
      action: 'backup.failure-notified',
      details: { backupId: run.id, code: run.errorCode },
    });
  }

  /** Counts of central tables in the running database. */
  async currentCounts(): Promise<BackupCounts> {
    const rows = await this.em.fork().getConnection().execute<{ counts: string }[]>(COUNT_SQL);
    return parseCounts(rows[0]?.counts);
  }

  /** Migrations this server knows (code), to refuse backups of newer versions. */
  knownMigrations(): Set<string> {
    const list = (this.em.config.get('migrations') as { migrationsList?: { name: string }[] }).migrationsList ?? [];
    return new Set(list.map((m) => m.name));
  }

  private async manifest(trigger: BackupTrigger, at: Date, loaded: LoadedSettings): Promise<BackupManifest> {
    const connection = this.em.fork().getConnection();
    const migrations = (await connection.execute<{ name: string }[]>('select name from forga_migrations order by id')).map((r: { name: string }) => r.name);
    const plugins = new Set((this.options.plugins?.states ?? []).filter((s) => s.status === 'loaded').map((s) => s.id));
    return {
      format: 1,
      appVersion: FORGA_VERSION,
      instance: backupEnvironment.instance(),
      instanceId: await this.settings.instanceId(),
      stage: forgaStage(),
      createdAt: at.toISOString(),
      trigger,
      modules: this.options.modules.map(({ manifest }) => ({ id: manifest.id, version: manifest.version, plugin: plugins.has(manifest.id) })),
      migrations,
      postgres: { server: await this.pg.serverVersion(), dump: await this.pg.clientVersion() },
      counts: await this.currentCounts(),
      includes: { plugins: loaded.settings.include.plugins && Boolean(this.pluginDir), settings: loaded.settings.include.settingsCopy },
    };
  }

  get pluginDir(): string | null {
    return this.options.plugins?.config.dir ?? null;
  }

  /** The plugin folder as `tar.gz` (packages, unpacked plugins, trusted keys). */
  private async packPlugins(): Promise<Buffer> {
    const dir = this.pluginDir;
    const files = new Map<string, Buffer>();
    if (!dir) return writeTarGz(files);
    let total = 0;
    const walk = async (folder: string) => {
      for (const entry of await readdir(folder, { withFileTypes: true }).catch(() => [])) {
        const path = join(folder, entry.name);
        if (entry.name.startsWith('.staging-')) continue;
        if (entry.isDirectory()) await walk(path);
        else if (entry.isFile()) {
          const content = await readFile(path);
          total += content.length;
          if (total > MAX_PLUGINS) throw new BackupError('backup.pluginsTooLarge');
          files.set(relative(dir, path).split(sep).join('/'), content);
        }
      }
    };
    await walk(dir);
    return writeTarGz(files);
  }

  /** Writes the plugins of a backup back: the folder gets exactly the contents of the backup. */
  async restorePlugins(archive: Buffer): Promise<boolean> {
    const dir = this.pluginDir;
    if (!dir) return false;
    const files = readTarGz(archive);
    for (const entry of await readdir(dir).catch(() => [])) await rm(join(dir, entry), { recursive: true, force: true });
    for (const [path, content] of files) {
      const target = join(dir, safePath(path));
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }
    return true;
  }

  /** All settings without passwords and secrets, as a readable copy. */
  private async settingsCopy(): Promise<Record<string, unknown>> {
    const settings = await this.em.fork().find(Setting, {}, { orderBy: { section: 'asc' } });
    return Object.fromEntries(
      settings.map((s) => {
        const value = { ...s.value };
        for (const field of SECRET_SETTING_FIELDS[s.section] ?? []) delete value[field];
        return [s.section, value];
      }),
    );
  }

  // ----- Verify -----

  /** Compatibility of a backup with this server. */
  compatibility(manifest: BackupManifest): { newer: boolean; missingModules: string[] } {
    const known = this.knownMigrations();
    const installed = new Set(this.options.modules.map((m) => m.manifest.id));
    return {
      newer: isNewer(manifest.appVersion, FORGA_VERSION) || manifest.migrations.some((m) => known.size > 0 && !known.has(m)),
      missingModules: manifest.modules.filter((m) => !installed.has(m.id) && !(m.plugin && manifest.includes.plugins)).map((m) => m.id),
    };
  }

  /**
   * Reads a backup completely: decrypts it, compares the checksums and reads the table of contents of the dump with
   * `pg_restore --list`. With `restoreTest` it restores it into a temporary database, counts central tables there and
   * drops it again; the running application stays untouched.
   */
  async verify(path: string, passphrase: string | null, options: { restoreTest: boolean }): Promise<Verification> {
    const result: Verification = { ok: false, checkedAt: new Date().toISOString(), error: null, objects: null, schemas: null, compatible: null, missingModules: [], restoreTested: false, restoredCounts: null };
    let manifest: BackupManifest | null = null;
    try {
      const opened = await openBackupFile(path, passphrase);
      const manifestSink = bufferSink(1024 * 1024);
      const listing = this.pg.spawn('pg_restore', ['--list']);
      const stderr = new OutputTail();
      let list = '';
      listing.stdout.on('data', (chunk: Buffer) => (list += chunk.toString()));
      listing.stderr.on('data', (chunk: Buffer) => stderr.add(chunk));
      const exit = PgTools.finished(listing, 'backup.dumpUnreadable', stderr);
      exit.catch(() => undefined);
      let dumpSeen = false;
      try {
        await readPayload(opened.payload, (name): EntrySink => {
          if (name === 'manifest.json') return manifestSink;
          if (name === 'database.dump') {
            dumpSeen = true;
            return stdinSink(listing, true);
          }
          return discardSink;
        });
      } finally {
        if (!dumpSeen) listing.stdin.end();
      }
      await exit;
      if (!dumpSeen) throw new BackupError('backup.corrupt', 'no database dump');
      manifest = BackupManifest.parse(JSON.parse(manifestSink.data().toString('utf8')));
      Object.assign(result, summarizeList(list));
      const compatibility = this.compatibility(manifest);
      result.compatible = !compatibility.newer && !compatibility.missingModules.length;
      result.missingModules = compatibility.missingModules;
      if (options.restoreTest) {
        const database = stampedDatabase(this.pg.database, 'restoretest');
        try {
          await this.pg.sql([`create database ${quoteIdent(database)} template template0`], 'postgres', 'backup.restoreTestFailed');
          await this.restoreInto(path, passphrase, database, false);
          result.restoredCounts = parseCounts((await this.pg.sql([COUNT_SQL], database, 'backup.restoreTestFailed')).trim());
          result.restoreTested = true;
          const expected = manifest.counts;
          if (JSON.stringify(result.restoredCounts) !== JSON.stringify(expected)) throw new BackupError('backup.restoreTestMismatch');
        } finally {
          await this.pg.sql([`drop database if exists ${quoteIdent(database)} with (force)`]).catch((error: unknown) => this.logger.error(`Dropping ${database} failed`, String(error)));
        }
      }
      result.ok = true;
    } catch (error) {
      result.error = errorCode(error, 'backup.verifyFailed');
      this.logger.warn(`Verifying ${path} failed: ${errorDetail(error)}`);
    }
    return result;
  }

  /**
   * Restores the database dump of a backup into a database (`clean`: replacing the contents of the running one in a
   * single transaction). Returns the manifest and the plugins of the backup.
   */
  async restoreInto(path: string, passphrase: string | null, database: string, clean: boolean): Promise<{ manifest: BackupManifest; plugins: Buffer | null }> {
    const opened = await openBackupFile(path, passphrase);
    const manifestSink = bufferSink(1024 * 1024);
    const pluginsSink = bufferSink(MAX_PLUGINS * 2);
    let plugins = false;
    const restore = this.pg.spawn('pg_restore', ['--no-owner', '--exit-on-error', ...(clean ? ['--clean', '--if-exists', '--single-transaction'] : []), '--dbname', database], database);
    const stderr = new OutputTail();
    restore.stdout.resume();
    restore.stderr.on('data', (chunk: Buffer) => stderr.add(chunk));
    const exit = PgTools.finished(restore, 'backup.restoreFailed', stderr);
    exit.catch(() => undefined);
    let dumpSeen = false;
    try {
      await readPayload(opened.payload, (name): EntrySink => {
        if (name === 'manifest.json') return manifestSink;
        if (name === 'database.dump') {
          dumpSeen = true;
          return stdinSink(restore);
        }
        if (name === 'plugins.tgz') {
          plugins = true;
          return pluginsSink;
        }
        return discardSink;
      });
    } catch (error) {
      restore.kill();
      await exit.catch(() => undefined);
      throw error;
    } finally {
      if (!dumpSeen) restore.stdin.end();
    }
    await exit;
    if (!dumpSeen) throw new BackupError('backup.corrupt', 'no database dump');
    return { manifest: BackupManifest.parse(JSON.parse(manifestSink.data().toString('utf8'))), plugins: plugins ? pluginsSink.data() : null };
  }

  /** Reads only the manifest of a backup (checks the passphrase on the way). */
  async readManifest(path: string, passphrase: string | null): Promise<BackupManifest> {
    const opened = await openBackupFile(path, passphrase);
    const sink = bufferSink(1024 * 1024);
    const stop = new Error('manifest read');
    try {
      await readPayload(opened.payload, (name) => {
        if (name !== 'manifest.json') throw stop;
        return sink;
      });
    } catch (error) {
      if (error !== stop) throw error;
    } finally {
      await opened.close();
    }
    try {
      return BackupManifest.parse(JSON.parse(sink.data().toString('utf8')));
    } catch {
      throw new BackupError('backup.corrupt', 'manifest');
    }
  }

  // ----- Delete, retention, upload, download -----

  async delete(id: string, actor: Actor): Promise<void> {
    const em = this.em.fork();
    const run = await em.findOne(BackupRun, { id });
    if (!run || run.status === 'deleted') throw new NotFoundException({ code: 'backup.notFound' });
    if (run.trigger === 'foreign') throw new BadRequestException({ code: 'backup.foreignNotDeletable' });
    if (run.status === 'running') throw new ConflictException({ code: 'backup.running' });
    if (run.fileName && run.status === 'ok') {
      const target = await this.target().catch((error: unknown) => httpError(error));
      await rm(join(target, run.fileName), { force: true });
    }
    run.status = 'deleted';
    run.deletedAt = new Date();
    await em.flush();
    await this.audit.log('backup.deleted', { backupId: run.id, fileName: run.fileName }, actor.id);
  }

  /** Deletes old backups by the retention rules; files f.orga does not know stay untouched. */
  async prune(loaded: LoadedSettings, target: string, now = new Date()): Promise<string[]> {
    const em = this.em.fork();
    const runs = await em.find(BackupRun, { status: 'ok', trigger: { $in: ['scheduled', 'manual', 'safety'] }, fileName: { $ne: null }, targetPath: loaded.settings.targetPath });
    const candidates: RetentionCandidate[] = runs.map((r) => ({ id: r.id, startedAt: r.startedAt, keepUntil: r.keepUntil ?? null }));
    const ids = new Set(selectForPruning(candidates, now, loaded.settings.keepCount, loaded.settings.keepDays));
    const pruned = runs.filter((r) => ids.has(r.id));
    for (const run of pruned) {
      await rm(join(target, run.fileName!), { force: true });
      run.status = 'deleted';
      run.deletedAt = now;
    }
    // Records of deleted backups follow the retention category `backup.run-log` (default one year).
    await em.flush();
    if (pruned.length) await this.audit.log('backup.pruned', { files: pruned.map((r) => r.fileName) }, null);
    return pruned.map((r) => r.fileName!);
  }

  /** Stores an uploaded backup (e.g. from the old server) in the target folder. */
  async upload(source: NodeJS.ReadableStream, name: string, length: number | null, actor: Actor): Promise<BackupEntry> {
    if (!isBackupFileName(name)) throw new BadRequestException({ code: 'backup.invalidFileName' });
    const target = await this.target().catch((error: unknown) => httpError(error));
    const path = join(target, name);
    if (await stat(path).catch(() => null)) throw new ConflictException({ code: 'backup.fileExists' });
    const free = await this.freeBytes(target);
    if (length !== null && free !== null && length > free) throw new BadRequestException({ code: 'backup.diskFull' });
    const part = `${path}.part`;
    try {
      await pipeline(source, createWriteStream(part, { flags: 'wx', mode: 0o600 }));
      const header = await readFileHeader(part);
      if (!header) throw new BadRequestException({ code: 'backup.notABackup' });
      await rename(part, path);
    } catch (error) {
      await rm(part, { force: true });
      throw error;
    }
    const header = (await readFileHeader(path))!;
    const em = this.em.fork();
    const run = em.create(BackupRun, {
      fileName: name,
      targetPath: (await this.settings.load()).settings.targetPath,
      trigger: 'upload',
      userId: actor.id,
      userName: actor.displayName,
      startedAt: new Date(header.createdAt),
      finishedAt: new Date(header.createdAt),
      size: (await stat(path)).size,
      status: 'ok',
      encrypted: Boolean(header.encryption),
      passphraseId: header.passphraseId,
      instance: header.instance,
      appVersion: header.appVersion,
    });
    await em.flush();
    await this.audit.log('backup.uploaded', { backupId: run.id, fileName: name, size: run.size }, actor.id);
    return toEntry(run);
  }

  async download(id: string, actor: Actor): Promise<{ stream: ReadStream; fileName: string; size: number }> {
    const run = await this.find(id);
    const path = await this.fileOf(run);
    const size = (await stat(path)).size;
    await this.audit.log('backup.downloaded', { backupId: run.id, fileName: run.fileName }, actor.id);
    return { stream: createReadStream(path), fileName: run.fileName!, size };
  }

  /** Records the result of a verification at the backup; audit `backup.verified`, `backup.restore-tested` or `backup.verify-failed`. */
  async recordVerification(id: string, verification: Verification, actor: Actor | null): Promise<BackupEntry> {
    const em = this.em.fork();
    const run = await em.findOneOrFail(BackupRun, { id });
    run.verification = verification;
    await em.flush();
    const action = !verification.ok ? 'backup.verify-failed' : verification.restoreTested ? 'backup.restore-tested' : 'backup.verified';
    await this.audit.log(action, { backupId: run.id, fileName: run.fileName, error: verification.error }, actor?.id ?? null);
    return toEntry(run);
  }
}
