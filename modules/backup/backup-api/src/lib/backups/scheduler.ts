import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { BackupRun } from '../backup.entities.js';
import { Maintenance } from '../restore/maintenance.js';
import { RestoreService } from '../restore/restore.service.js';
import { backupEnvironment } from '../runtime/environment.js';
import { BackupSettingsService } from '../settings/backup-settings.service.js';
import { BackupsService } from './backups.service.js';
import { berlinParts, isDue } from './rules.js';

const CHECK_INTERVAL_MS = 60_000;

/**
 * Scheduled backups: checks every minute whether the daily backup is due (Europe/Berlin), and once a day drops
 * previous databases of restores older than 7 days. Off with `FORGA_BACKUP_SCHEDULER=off`, paused in maintenance.
 */
@Injectable()
export class BackupScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(BackupScheduler.name);
  private timer?: NodeJS.Timeout;
  private cleanedOn: string | null = null;

  constructor(
    private readonly em: EntityManager,
    private readonly settings: BackupSettingsService,
    private readonly backups: BackupsService,
    private readonly restores: RestoreService,
    private readonly maintenance: Maintenance,
  ) {}

  onApplicationBootstrap(): void {
    if (!backupEnvironment.schedulerEnabled()) return;
    this.timer = setInterval(() => {
      this.tick(new Date()).catch((error: unknown) => this.logger.error('Backup schedule check failed', error instanceof Error ? error.stack : String(error)));
    }, CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** Start of the latest scheduled backup, whatever its result. */
  async lastScheduled(): Promise<Date | null> {
    return (await this.em.fork().findOne(BackupRun, { trigger: 'scheduled' }, { orderBy: { startedAt: 'desc' } }))?.startedAt ?? null;
  }

  /** Runs a due backup and waits for it; returns it, or `null` if none was due. */
  async runIfDue(now: Date): Promise<BackupRun | null> {
    if (this.maintenance.current || this.backups.isRunning || !backupEnvironment.root()) return null;
    const loaded = await this.settings.load();
    if (!loaded.saved || !isDue(now, loaded.settings.schedule, await this.lastScheduled())) return null;
    let started: Awaited<ReturnType<BackupsService['start']>>;
    try {
      started = await this.backups.start('scheduled', null, { verify: loaded.settings.verifyAfterBackup });
    } catch (error) {
      return this.backups.recordFailure('scheduled', error);
    }
    return started.done.catch(async () => (await this.em.fork().findOne(BackupRun, { id: started.run.id }))!);
  }

  async tick(now: Date): Promise<void> {
    await this.runIfDue(now);
    const today = berlinParts(now).date;
    if (this.cleanedOn !== today && !this.maintenance.current) {
      this.cleanedOn = today;
      await this.restores.cleanUp(now);
    }
  }
}
