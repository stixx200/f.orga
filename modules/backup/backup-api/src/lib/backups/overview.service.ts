import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { type DeadlineInput, serverKey } from '@forga/core-api';
import { BACKUP_MANAGE, type BackupOverview, type BackupWarning } from '@forga/backup-contracts';
import { BackupRun } from '../backup.entities.js';
import { RestoreService } from '../restore/restore.service.js';
import { backupEnvironment } from '../runtime/environment.js';
import { majorVersion, PgTools } from '../runtime/pg-tools.js';
import { BackupSettingsService } from '../settings/backup-settings.service.js';
import { BackupsService, toEntry } from './backups.service.js';
import { nextScheduled } from './rules.js';
import { BackupScheduler } from './scheduler.js';

const TOOLS_CACHE_MS = 5 * 60_000;

/** State of the backups for the overview page and the tasks of the administrators. */
@Injectable()
export class BackupOverviewService {
  private tools: { at: number; pgDump: string | null; server: string | null } | null = null;

  constructor(
    private readonly em: EntityManager,
    private readonly settings: BackupSettingsService,
    private readonly backups: BackupsService,
    private readonly restores: RestoreService,
    private readonly scheduler: BackupScheduler,
    private readonly pg: PgTools,
  ) {}

  private async toolVersions(): Promise<{ pgDump: string | null; server: string | null }> {
    if (!this.tools || Date.now() - this.tools.at > TOOLS_CACHE_MS) {
      this.tools = { at: Date.now(), pgDump: await this.pg.clientVersion(), server: await this.pg.serverVersion() };
    }
    return { pgDump: this.tools.pgDump, server: this.tools.server };
  }

  async overview(): Promise<BackupOverview> {
    const loaded = await this.settings.load();
    const view = await this.settings.view(loaded);
    const root = backupEnvironment.root();
    const entries = await this.backups.list();
    const em = this.em.fork();
    const lastSuccess = entries.find((e) => e.status === 'ok' && e.trigger !== 'foreign' && e.trigger !== 'upload') ?? null;
    const latest = await em.findOne(BackupRun, { trigger: { $in: ['scheduled', 'manual'] }, status: { $ne: 'running' } }, { orderBy: { startedAt: 'desc' } });
    const target = root ? await this.backups.checkTarget() : null;
    const tools = await this.toolVersions();
    const now = new Date();

    const warnings: BackupWarning[] = [];
    if (!root) warnings.push('backup.notConfigured');
    if (!serverKey()) warnings.push('backup.noSecretKey');
    if (view.encryption && !view.passphraseSet) warnings.push('backup.noPassphrase');
    if (view.passphraseUnreadable) warnings.push('backup.passphraseUnreadable');
    if (!view.encryption) warnings.push('backup.unencrypted');
    if (root && this.stale(lastSuccess?.startedAt ?? null, loaded.settings.notify.staleHours, now)) warnings.push('backup.stale');
    if (latest?.status === 'failed') warnings.push('backup.lastFailed');
    if (target && !target.writable) warnings.push('backup.targetNotWritable');
    if (!tools.pgDump) warnings.push('backup.toolsMissing');
    else if (tools.server && majorVersion(tools.pgDump)! < majorVersion(tools.server)!) warnings.push('backup.clientMismatch');

    const restores = await this.restores.latest();
    const events: BackupOverview['events'] = [];
    for (const entry of entries.slice(0, 10)) {
      if (entry.trigger === 'foreign') continue;
      if (entry.status === 'failed') events.push({ at: entry.startedAt, kind: 'failed', entry, userName: entry.userName, detail: entry.errorCode });
      else if (entry.status !== 'running') events.push({ at: entry.startedAt, kind: 'created', entry, userName: entry.userName, detail: null });
      const verification = entry.verification;
      if (verification) {
        const kind = !verification.ok ? 'verifyFailed' : verification.restoreTested ? 'restoreTested' : 'verified';
        events.push({ at: verification.checkedAt, kind, entry, userName: null, detail: verification.error });
      }
    }
    for (const restore of restores) {
      events.push({
        at: (restore.finishedAt ?? restore.startedAt).toISOString(),
        kind: restore.phase === 'done' ? 'restored' : 'restoreFailed',
        entry: await this.restores.entryOf(restore.runId ?? null),
        userName: restore.userName ?? null,
        detail: restore.phase === 'done' ? (restore.backupCreatedAt?.toISOString() ?? null) : (restore.errorCode ?? null),
      });
    }

    const own = entries.filter((e) => e.status === 'ok' && e.fileName);
    return {
      configured: Boolean(root),
      root,
      settings: view,
      target,
      lastSuccess,
      nextScheduled: root && loaded.saved ? (nextScheduled(now, loaded.settings.schedule, await this.scheduler.lastScheduled())?.toISOString() ?? null) : null,
      backups: own.length,
      oldest: own.at(-1)?.startedAt ?? null,
      warnings,
      tools,
      restoreMethod: await this.restores.method(),
      running: this.backups.isRunning,
      events: events.toSorted((a, b) => b.at.localeCompare(a.at)).slice(0, 6),
      oldDatabases: await this.restores.previousDatabases(),
    };
  }

  private stale(lastSuccess: string | null, staleHours: number, now: Date): boolean {
    return !lastSuccess || now.getTime() - new Date(lastSuccess).getTime() > staleHours * 3_600_000;
  }

  /** Tasks for `backup.manage`: the latest backup failed, or no successful backup for too long. */
  async deadlines(asOf: string): Promise<DeadlineInput[]> {
    if (!backupEnvironment.root()) return [];
    const loaded = await this.settings.load();
    if (!loaded.saved) return [];
    const em = this.em.fork();
    const result: DeadlineInput[] = [];
    const latest = await em.findOne(BackupRun, { trigger: { $in: ['scheduled', 'manual'] }, status: { $ne: 'running' } }, { orderBy: { startedAt: 'desc' } });
    if (loaded.settings.notify.onFailure && latest?.status === 'failed') {
      result.push({
        id: `failed:${latest.id}`,
        kind: 'failed',
        title: { de: 'Datensicherung fehlgeschlagen', en: 'Backup failed' },
        subject: { type: 'backup', id: latest.id, label: latest.errorCode ?? 'backup.failed' },
        dueOn: asOf,
        leadDays: 0,
        departmentIds: [],
        permission: BACKUP_MANAGE,
        to: '/backup',
      });
    }
    const success = await em.findOne(BackupRun, { status: { $in: ['ok', 'missing'] }, trigger: { $in: ['scheduled', 'manual', 'safety'] } }, { orderBy: { startedAt: 'desc' } });
    if (loaded.settings.schedule.mode !== 'off' && this.stale(success?.startedAt.toISOString() ?? null, loaded.settings.notify.staleHours, new Date())) {
      result.push({
        id: 'stale',
        kind: 'stale',
        title: { de: 'Keine aktuelle Datensicherung', en: 'No recent backup' },
        subject: { type: 'backup', id: 'stale', label: success ? success.startedAt.toISOString() : '–' },
        dueOn: asOf,
        leadDays: 0,
        departmentIds: [],
        permission: BACKUP_MANAGE,
        to: '/backup',
      });
    }
    return result;
  }

  /** The entry of a backup by ID, for the restore wizard. */
  async entry(id: string) {
    return toEntry(await this.backups.find(id));
  }
}
