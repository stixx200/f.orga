import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, type OnApplicationBootstrap } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Audit, isTestStage, Session, SettingsService } from '@forga/core-api';
import type { BrigadeSettings } from '@forga/core-contracts';
import { FORGA_VERSION } from '@forga/core-contracts';
import { type BackupManifest, REAL_DATA_DAYS, REAL_DATA_REASON_MIN, type RestoreCheck, type RestoreProgress, type RestoreStep } from '@forga/backup-contracts';
import { BackupRestore, BackupRun } from '../backup.entities.js';
import { type Actor, BackupsService, httpError, toEntry } from '../backups/backups.service.js';
import { stampedDatabase, stampOf } from '../backups/database.js';
import { BackupError } from '../format/backup-format.js';
import { backupEnvironment } from '../runtime/environment.js';
import { PgTools, quoteIdent, quoteLiteral } from '../runtime/pg-tools.js';
import { BackupSettingsService } from '../settings/backup-settings.service.js';
import { hashToken, Maintenance, type RestoreState } from './maintenance.js';

const STEPS: RestoreStep[] = ['maintenance', 'safetyBackup', 'restore', 'swap', 'plugins', 'restart'];
/** The previous database stays this long after a restore. */
const KEEP_PREVIOUS_DAYS = 7;

/** Brigade names are compared without surrounding spaces and case. */
const sameName = (a: string, b: string) => a.trim().toLocaleLowerCase('de') === b.trim().toLocaleLowerCase('de');

/**
 * Restoring a backup: check (passphrase entered again, version, modules), confirmation with the brigade name, then in
 * the background maintenance mode, safety backup of the current state, restore into a new database, swap of the
 * databases and restart of the process (Docker starts it again; migrations run at the start). Without `CREATEDB` the
 * backup is restored into the running database in one transaction instead.
 */
@Injectable()
export class RestoreService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RestoreService.name);

  constructor(
    private readonly em: EntityManager,
    private readonly backups: BackupsService,
    private readonly settings: BackupSettingsService,
    private readonly coreSettings: SettingsService,
    private readonly pg: PgTools,
    private readonly audit: Audit,
    private readonly maintenance: Maintenance,
  ) {}

  /** After the restart: finish the restore in the new database, or end an interrupted one. */
  async onApplicationBootstrap(): Promise<void> {
    const state = this.maintenance.current;
    if (!state) return;
    if (state.phase === 'swapFailed') {
      this.logger.error('Swapping the databases failed during a restore: maintenance mode stays on. See the commands on the status page.');
      return;
    }
    const em = this.em.fork();
    // The restored database carries a marker; without it the databases were swapped back by hand.
    const restored = state.phase === 'restarting' && (await this.takeMarker()) === state.restoreId;
    if (state.phase === 'restarting' && !restored) {
      const failed: RestoreState = { ...this.withStep(state, 'restart', 'failed'), phase: 'failed', error: 'backup.restoreRolledBack' };
      em.create(BackupRestore, this.record(failed));
      await em.flush();
      await this.audit.log('backup.restore-failed', { fileName: state.fileName, code: failed.error }, state.userId);
      this.maintenance.finish(failed);
      return;
    }
    if (restored) {
      const finished = this.withStep({ ...state, phase: 'done' }, 'restart', 'done');
      // Sessions of the backup belong to the old state: everybody signs in again.
      await em.nativeDelete(Session, {});
      const record = em.create(BackupRestore, this.record(finished));
      // Real data in the test system: deleted after 7 days (see `deleteExpiredRealData`).
      if (state.realDataReason) record.realDataUntil = new Date(record.finishedAt!.getTime() + REAL_DATA_DAYS * 86_400_000);
      await em.flush();
      await this.audit.log(
        'backup.restored',
        {
          fileName: state.fileName,
          backupCreatedAt: state.backupCreatedAt,
          safetyFileName: state.safetyFileName,
          previousDatabase: state.previousDatabase,
          method: state.method,
          ...(state.realDataReason ? { realDataReason: state.realDataReason, realDataUntil: record.realDataUntil!.toISOString() } : {}),
        },
        state.userId,
      );
      this.maintenance.finish(finished);
      this.logger.log(`Restored the backup ${state.fileName}`);
      return;
    }
    // The process ended in the middle of a restore (before the swap): the database is unchanged.
    const failed: RestoreState = { ...state, phase: 'failed', error: state.error ?? 'backup.restoreInterrupted' };
    em.create(BackupRestore, this.record(failed));
    await em.flush();
    await this.audit.log('backup.restore-failed', { fileName: state.fileName, code: failed.error }, state.userId);
    this.maintenance.finish(failed);
  }

  /** Marks a restored database (comment on the database; it survives the renaming). */
  private markerSql(database: string, restoreId: string): string {
    return `comment on database ${quoteIdent(database)} is ${quoteLiteral(`forga-restore:${restoreId}`)}`;
  }

  /** The restore that produced the running database, and removes the marker. */
  private async takeMarker(): Promise<string | null> {
    const connection = this.em.fork().getConnection();
    const rows = await connection.execute<{ comment: string | null }[]>("select shobj_description(oid, 'pg_database') as comment from pg_database where datname = current_database()");
    const comment = rows[0]?.comment ?? '';
    if (!comment.startsWith('forga-restore:')) return null;
    await connection.execute(`comment on database ${quoteIdent(this.pg.database)} is null`);
    return comment.slice('forga-restore:'.length);
  }

  private record(state: RestoreState) {
    return {
      runId: state.runId,
      fileName: state.fileName,
      backupCreatedAt: state.backupCreatedAt ? new Date(state.backupCreatedAt) : null,
      safetyFileName: state.safetyFileName,
      userId: state.userId,
      userName: state.userName,
      startedAt: new Date(state.startedAt),
      finishedAt: new Date(),
      method: state.method,
      phase: state.phase,
      steps: state.steps,
      errorCode: state.error,
      errorDetail: state.errorDetail,
      previousDatabase: state.previousDatabase,
      realDataReason: state.realDataReason ?? null,
      realDataUntil: null,
    };
  }

  private withStep(state: RestoreState, step: RestoreStep, value: RestoreProgress['steps'][number]['state'], detail?: string | null): RestoreState {
    return { ...state, steps: state.steps.map((s) => (s.step === step ? { ...s, state: value, detail: detail === undefined ? s.detail : detail } : s)) };
  }

  /** `swap` with `CREATEDB`, otherwise `clean`. */
  async method(): Promise<'swap' | 'clean'> {
    return (await this.pg.canCreateDatabase()) ? 'swap' : 'clean';
  }

  private async brigadeName(): Promise<string | null> {
    return (await this.coreSettings.get<BrigadeSettings>('brigade'))?.name ?? null;
  }

  /** Step „Prüfen“: decrypts and checks the backup with the passphrase entered. */
  async check(backupId: string, passphrase: string): Promise<RestoreCheck> {
    const run = await this.backups.find(backupId);
    const path = await this.backups.fileOf(run);
    const manifest = await this.backups.readManifest(path, passphrase || null).catch((error: unknown) => httpError(error));
    const verification = await this.backups.verify(path, passphrase || null, { restoreTest: false });
    const entry = await this.backups.recordVerification(run.id, verification, null);
    return {
      entry,
      manifest,
      verification,
      current: await this.backups.currentCounts(),
      runningVersion: FORGA_VERSION,
      brigadeName: await this.brigadeName(),
      restoreMethod: await this.method(),
      realData: await this.isRealData(manifest),
    };
  }

  /**
   * On the test system: is the backup one of the real system? Backups of older versions name no stage; one of another
   * installation counts as real data then.
   */
  async isRealData(manifest: Pick<BackupManifest, 'stage' | 'instanceId'>): Promise<boolean> {
    if (!isTestStage()) return false;
    if (manifest.stage) return manifest.stage === 'production';
    return manifest.instanceId !== (await this.settings.instanceId());
  }

  /** Starts the restore after all checks; returns the token for the status page. */
  async start(input: { backupId: string; passphrase: string; confirmName: string; realDataReason?: string }, actor: Actor): Promise<{ token: string }> {
    if (this.maintenance.current) throw new ConflictException({ code: 'backup.restoreRunning' });
    if (this.backups.isRunning) throw new ConflictException({ code: 'backup.running' });
    const run = await this.backups.find(input.backupId);
    const path = await this.backups.fileOf(run);
    const brigade = await this.brigadeName();
    if (!brigade || !sameName(brigade, input.confirmName)) throw new BadRequestException({ code: 'backup.confirmNameMismatch' });
    const passphrase = input.passphrase || null;
    const manifest = await this.backups.readManifest(path, passphrase).catch((error: unknown) => httpError(error));
    const compatibility = this.backups.compatibility(manifest);
    if (compatibility.newer) throw new BadRequestException({ code: 'backup.newerVersion', version: manifest.appVersion });
    if (compatibility.missingModules.length) throw new BadRequestException({ code: 'backup.missingModules', modules: compatibility.missingModules });
    // Real data in the test system only with a reason (decision 4 of the data protection concept).
    const realData = await this.isRealData(manifest);
    const realDataReason = realData ? (input.realDataReason ?? '').trim() : '';
    if (realData && realDataReason.length < REAL_DATA_REASON_MIN) throw new BadRequestException({ code: 'backup.realDataReasonRequired', min: REAL_DATA_REASON_MIN });
    const loaded = await this.settings.load();
    // The safety backup uses the stored passphrase; without one (no server key) the one entered.
    const safetyPassphrase = loaded.settings.encryption ? this.settings.passphraseOf(loaded) ?? passphrase : null;
    if (loaded.settings.encryption && !safetyPassphrase) throw new BadRequestException({ code: 'backup.noPassphrase' });
    await this.backups.target(loaded).catch((error: unknown) => httpError(error));

    const token = randomBytes(32).toString('base64url');
    const state: RestoreState = {
      restoreId: run.id,
      tokenHash: hashToken(token),
      runId: run.id,
      fileName: run.fileName!,
      safetyFileName: null,
      userId: actor.id,
      userName: actor.displayName,
      method: await this.method(),
      previousDatabase: null,
      realDataReason: realData ? realDataReason : null,
      phase: 'running',
      steps: STEPS.map((step) => ({ step, state: 'waiting', detail: null })),
      backupCreatedAt: manifest.createdAt,
      startedAt: new Date().toISOString(),
      error: null,
      errorDetail: null,
      consoleCommands: null,
    };
    this.maintenance.save(state);
    await this.audit.log(
      'backup.restore-started',
      { backupId: run.id, fileName: run.fileName, backupCreatedAt: manifest.createdAt, method: state.method, ...(realData ? { realDataReason } : {}) },
      actor.id,
    );
    // After the answer: the page polls the status with the token.
    setImmediate(() => {
      this.run(state, path, passphrase, safetyPassphrase, actor).catch((error: unknown) => this.logger.error('Restore failed', error instanceof Error ? error.stack : String(error)));
    });
    return { token };
  }

  progress(token: string): RestoreProgress {
    const progress = token ? this.maintenance.progress(token) : null;
    if (!progress) throw new NotFoundException({ code: 'backup.restoreNotFound' });
    return progress;
  }

  private async run(initial: RestoreState, path: string, passphrase: string | null, safetyPassphrase: string | null, actor: Actor): Promise<void> {
    let state = initial;
    const step = (name: RestoreStep, value: 'running' | 'done' | 'failed', detail?: string | null) => {
      state = this.withStep(state, name, value, detail);
      this.maintenance.save(state);
    };
    const fail = async (name: RestoreStep, error: unknown, keepMaintenance = false) => {
      const code = error instanceof BackupError ? error.code : 'backup.restoreFailed';
      const detail = error instanceof BackupError ? error.detail : error instanceof Error ? error.message : String(error);
      state = { ...this.withStep(state, name, 'failed'), phase: keepMaintenance ? 'swapFailed' : 'failed', error: code, errorDetail: detail?.slice(-2000) ?? null };
      this.logger.error(`Restore failed in step ${name}: ${code} ${detail ?? ''}`);
      const em = this.em.fork();
      if (!keepMaintenance) {
        em.create(BackupRestore, this.record(state));
        await em.flush().catch(() => undefined);
        await this.audit.log('backup.restore-failed', { fileName: state.fileName, step: name, code }, actor.id).catch(() => undefined);
        this.maintenance.finish(state);
      } else {
        this.maintenance.save(state);
      }
    };

    // 1. Maintenance mode: other requests get 503, running ones may end, schedules pause.
    step('maintenance', 'running');
    await this.maintenance.drain();
    step('maintenance', 'done');

    // 2. Safety backup of the current state, verified.
    step('safetyBackup', 'running');
    try {
      const { done } = await this.backups.start('safety', actor, { verify: true, passphrase: safetyPassphrase });
      const safety = await done;
      if (!safety.verification?.ok) throw new BackupError('backup.safetyBackupFailed', safety.verification?.error ?? null);
      state = { ...state, safetyFileName: safety.fileName ?? null };
      step('safetyBackup', 'done', safety.fileName ?? null);
    } catch (error) {
      return fail('safetyBackup', error instanceof BackupError ? new BackupError('backup.safetyBackupFailed', error.code) : error);
    }

    const database = this.pg.database;
    let plugins: Buffer | null = null;
    if (state.method === 'swap') {
      // 3. Into a new database; the running one stays untouched until the swap.
      const target = stampedDatabase(database, 'restore');
      step('restore', 'running', target);
      try {
        await this.pg.sql([`create database ${quoteIdent(target)} template template0`]);
        plugins = (await this.backups.restoreInto(path, passphrase, target, false)).plugins;
        await this.pg.sql([this.markerSql(target, state.restoreId)]);
        step('restore', 'done');
      } catch (error) {
        await this.pg.sql([`drop database if exists ${quoteIdent(target)} with (force)`]).catch(() => undefined);
        return fail('restore', error);
      }

      // 4. Swap: no new connections to the running database, end the open ones, rename both.
      step('swap', 'running');
      const previous = stampedDatabase(database, 'before');
      const swap = [
        `alter database ${quoteIdent(database)} allow_connections false`,
        `select count(pg_terminate_backend(pid)) from pg_stat_activity where datname = ${quoteLiteral(database)} and pid <> pg_backend_pid()`,
        `alter database ${quoteIdent(database)} rename to ${quoteIdent(previous)}`,
        `alter database ${quoteIdent(target)} rename to ${quoteIdent(database)}`,
        `alter database ${quoteIdent(previous)} allow_connections true`,
      ];
      try {
        await this.retry(() => this.pg.sql(swap));
        state = { ...state, previousDatabase: previous };
        step('swap', 'done', previous);
      } catch (error) {
        // Take the renaming back; if that fails too, the maintenance mode stays and the page shows the commands.
        const back = [
          `do $$ begin if exists (select 1 from pg_database where datname = ${quoteLiteral(previous)}) and not exists (select 1 from pg_database where datname = ${quoteLiteral(database)}) then execute ${quoteLiteral(`alter database ${quoteIdent(previous)} rename to ${quoteIdent(database)}`)}; end if; end $$`,
          `alter database ${quoteIdent(database)} allow_connections true`,
        ];
        try {
          await this.pg.sql(back);
          await this.pg.sql([`drop database if exists ${quoteIdent(target)} with (force)`]).catch(() => undefined);
          return await fail('swap', error);
        } catch {
          state = { ...state, consoleCommands: [...back, `drop database if exists ${quoteIdent(target)};`].map((s) => `psql -d postgres -c ${JSON.stringify(s)}`).join('\n') };
          return await fail('swap', error, true);
        }
      }
    } else {
      // 3. Without CREATEDB: into the running database in one transaction; on failure nothing changes.
      step('restore', 'running');
      try {
        plugins = (await this.backups.restoreInto(path, passphrase, database, true)).plugins;
        await this.pg.sql([this.markerSql(database, state.restoreId)]);
        step('restore', 'done');
        step('swap', 'done', null);
      } catch (error) {
        return fail('restore', error);
      }
    }

    // 5. Plugins of the backup; a failure here does not undo the restored database.
    step('plugins', 'running');
    try {
      const restored = plugins ? await this.backups.restorePlugins(plugins) : false;
      step('plugins', 'done', restored ? 'restored' : 'none');
    } catch (error) {
      this.logger.error('Restoring the plugins failed', error instanceof Error ? error.stack : String(error));
      step('plugins', 'failed', error instanceof Error ? error.message : String(error));
    }

    // 6. Restart: the process ends, Docker starts it again (`restart: unless-stopped`); the start finishes the restore.
    state = { ...this.withStep(state, 'restart', 'running'), phase: 'restarting' };
    this.maintenance.save(state);
    if (backupEnvironment.exitAfterRestore()) {
      this.logger.warn('Restore done: f.orga ends now and runs the migrations at the next start. Without a restart rule (development) start the server again.');
      setTimeout(() => process.exit(0), 1000).unref();
    }
  }

  /** Swapping may meet a reconnecting client between the steps; tries again a few times. */
  private async retry<T>(action: () => Promise<T>, attempts = 3): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await action();
      } catch (error) {
        if (attempt >= attempts) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }

  /** Databases kept after restores, newest first. */
  async previousDatabases(): Promise<string[]> {
    const database = this.pg.database;
    const rows = await this.em.fork().getConnection().execute<{ datname: string }[]>('select datname from pg_database where datname like ? order by datname desc', [`${database.replace(/[\\%_]/g, '\\$&')}\\_before\\_%`]);
    return rows.map((r: { datname: string }) => r.datname).filter((name: string) => stampOf(name, database, 'before'));
  }

  /** Drops a kept previous database („Alte Datenbank löschen“). */
  async dropPrevious(name: string, actor: Actor | null): Promise<void> {
    if (!(await this.previousDatabases()).includes(name)) throw new NotFoundException({ code: 'backup.notFound' });
    await this.pg.sql([`drop database if exists ${quoteIdent(name)} with (force)`]).catch((error: unknown) => httpError(error, 500));
    await this.audit.log('backup.previous-database-dropped', { database: name }, actor?.id ?? null);
  }

  /** Drops previous databases older than 7 days and leftovers of interrupted restores and restore tests. */
  async cleanUp(now = new Date()): Promise<void> {
    const database = this.pg.database;
    for (const name of await this.previousDatabases()) {
      const at = stampOf(name, database, 'before');
      if (at && now.getTime() - at.getTime() > KEEP_PREVIOUS_DAYS * 86_400_000) await this.dropPrevious(name, null);
    }
    if (this.maintenance.current) return;
    const rows = await this.em.fork().getConnection().execute<{ datname: string }[]>('select datname from pg_database');
    for (const { datname } of rows) {
      const at = stampOf(datname, database, 'restore') ?? stampOf(datname, database, 'restoretest');
      if (at && now.getTime() - at.getTime() > 24 * 3_600_000) await this.pg.sql([`drop database if exists ${quoteIdent(datname)} with (force)`]).catch(() => undefined);
    }
  }

  /** Test system with restored real data: reason and day of deletion, for the overview. */
  async realDataStatus(): Promise<{ reason: string; deleteAt: string; userName: string | null } | null> {
    if (!isTestStage()) return null;
    const latest = await this.em.fork().findOne(BackupRestore, { realDataUntil: { $ne: null }, phase: 'done' }, { orderBy: { realDataUntil: 'desc' } });
    return latest ? { reason: latest.realDataReason ?? '', deleteAt: latest.realDataUntil!.toISOString(), userName: latest.userName ?? null } : null;
  }

  /**
   * Test system: 7 days after real data was restored, all data is deleted. The uploaded backup of the real system is
   * removed, every schema of f.orga is dropped and the process ends; at the restart the migrations create an empty
   * database and f.orga asks for the setup again. Returns whether it deleted.
   */
  async deleteExpiredRealData(now = new Date()): Promise<boolean> {
    if (!isTestStage() || this.maintenance.current) return false;
    const em = this.em.fork();
    const expired = await em.find(BackupRestore, { realDataUntil: { $ne: null, $lte: now }, phase: 'done' });
    if (!expired.length) return false;
    // The file of the restored backup (its record in the restored database still says "running").
    const target = await this.backups.target().catch(() => null);
    for (const restore of expired) {
      if (target && restore.fileName && !/[\\/]/.test(restore.fileName)) await rm(join(target, restore.fileName), { force: true });
    }
    this.logger.warn(`Test system: deleting all data ${REAL_DATA_DAYS} days after real data was restored (${expired.map((r) => r.fileName).join(', ')})`);
    const schemas = [...new Set([...this.em.getMetadata().getAll().values()].flatMap((meta) => (meta.schema && meta.schema !== '*' ? [meta.schema] : [])))];
    await em.getConnection().execute(`drop schema if exists ${schemas.map(quoteIdent).join(', ')} cascade; drop table if exists forga_migrations`);
    if (backupEnvironment.exitAfterRestore()) setTimeout(() => process.exit(0), 1000).unref();
    return true;
  }

  /** The latest restores, for the overview. */
  async latest(limit = 5): Promise<BackupRestore[]> {
    return this.em.fork().find(BackupRestore, {}, { orderBy: { startedAt: 'desc' }, limit });
  }

  /** The backup record of a restore, if it still exists. */
  async entryOf(runId: string | null) {
    const run = runId ? await this.em.fork().findOne(BackupRun, { id: runId }) : null;
    return run ? toEntry(run) : null;
  }
}
