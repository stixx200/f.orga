import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { type AuthenticatedUser, CurrentUser, Public, RequirePermissions, ZodPipe } from '@forga/core-api';
import {
  BACKUP_MANAGE,
  type BackupEntry,
  BackupNowInput,
  type BackupOverview,
  BackupSettingsInput,
  type BackupSettingsView,
  type RestoreCheck,
  RestoreCheckInput,
  RestoreInput,
  type RestoreProgress,
  type RestoreStarted,
  type TargetCheck,
  VerifyInput,
} from '@forga/backup-contracts';
import { type Actor, BackupsService, httpError, toEntry } from './backups/backups.service.js';
import { BackupOverviewService } from './backups/overview.service.js';
import { RestoreService } from './restore/restore.service.js';
import { BackupSettingsService } from './settings/backup-settings.service.js';

const NowInput = BackupNowInput.extend({ passphrase: z.string().max(500).optional() });
const TargetInput = z.object({ targetPath: z.string().max(200).optional() });

const actor = (user: AuthenticatedUser): Actor => ({ id: user.id, displayName: user.displayName });

/** Backups of the whole installation (`/backup` in the shell). Everything needs `backup.manage`. */
@Controller('backup')
@RequirePermissions(BACKUP_MANAGE)
export class BackupController {
  constructor(
    private readonly overviewService: BackupOverviewService,
    private readonly settings: BackupSettingsService,
    private readonly backups: BackupsService,
    private readonly restores: RestoreService,
  ) {}

  @Get('status')
  status(): Promise<BackupOverview> {
    return this.overviewService.overview();
  }

  @Get('settings')
  getSettings(): Promise<BackupSettingsView> {
    return this.settings.view();
  }

  /** The passphrase is write-only; a new one needs the repetition and the confirmation that it is kept safely. */
  @Put('settings')
  putSettings(@Body(new ZodPipe(BackupSettingsInput)) input: z.output<typeof BackupSettingsInput>): Promise<BackupSettingsView> {
    return this.settings.save(input);
  }

  /** „Ziel prüfen“: writes and deletes a test file in the (given or saved) target folder. */
  @Post('settings/test-target')
  @HttpCode(200)
  testTarget(@Body(new ZodPipe(TargetInput)) input: z.output<typeof TargetInput>): Promise<TargetCheck> {
    return this.backups.checkTarget(input.targetPath);
  }

  @Get('backups')
  list(): Promise<BackupEntry[]> {
    return this.backups.list();
  }

  @Get('backups/:id')
  async get(@Param('id') id: string): Promise<BackupEntry> {
    return toEntry(await this.backups.find(id));
  }

  /** „Jetzt sichern“: starts a backup and answers at once with its record (status `running`). */
  @Post('backups')
  @HttpCode(202)
  async create(@Body(new ZodPipe(NowInput)) input: z.output<typeof NowInput>, @CurrentUser() user: AuthenticatedUser): Promise<BackupEntry> {
    const { run } = await this.backups.start('manual', actor(user), { verify: input.verify, passphrase: input.passphrase ?? null });
    return toEntry(run);
  }

  /** Uploads a backup (body: the file, `application/octet-stream`) into the target folder. */
  @Post('backups/upload')
  upload(@Req() req: Request, @Query('name') name: string, @CurrentUser() user: AuthenticatedUser): Promise<BackupEntry> {
    const length = Number(req.headers['content-length']);
    return this.backups.upload(req, String(name ?? ''), Number.isFinite(length) ? length : null, actor(user));
  }

  /** „Prüfen“, optionally with „Wiederherstellung testen“; a foreign backup needs its passphrase. */
  @Post('backups/:id/verify')
  @HttpCode(200)
  async verify(@Param('id') id: string, @Body(new ZodPipe(VerifyInput)) input: z.output<typeof VerifyInput>, @CurrentUser() user: AuthenticatedUser): Promise<BackupEntry> {
    const run = await this.backups.find(id);
    const path = await this.backups.fileOf(run);
    let passphrase = input.passphrase || null;
    if (!passphrase && run.encrypted !== false) {
      const loaded = await this.settings.load();
      passphrase = this.settings.passphraseOf(loaded);
    }
    const verification = await this.backups.verify(path, passphrase, { restoreTest: input.restoreTest });
    return this.backups.recordVerification(run.id, verification, actor(user));
  }

  /** The file as it lies in the target folder (encrypted); recorded in the audit log. */
  @Get('backups/:id/file')
  async download(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const { stream, fileName, size } = await this.backups.download(id, actor(user));
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', String(size));
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    stream.pipe(res);
  }

  @Delete('backups/:id')
  @HttpCode(204)
  delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.backups.delete(id, actor(user));
  }

  /** Restore wizard, step „Prüfen“: with the passphrase entered again. */
  @Post('restore/check')
  @HttpCode(200)
  check(@Body(new ZodPipe(RestoreCheckInput)) input: z.output<typeof RestoreCheckInput>): Promise<RestoreCheck> {
    return this.restores.check(input.backupId, input.passphrase);
  }

  /** Starts the restore; f.orga goes into maintenance and restarts at the end. */
  @Post('restore')
  @HttpCode(202)
  restore(@Body(new ZodPipe(RestoreInput)) input: z.output<typeof RestoreInput>, @CurrentUser() user: AuthenticatedUser): Promise<RestoreStarted> {
    return this.restores.start(input, actor(user));
  }

  /**
   * Progress of a restore for the page that started it (the token it received); works during the maintenance and
   * after the restart, when the session of the backup no longer exists.
   */
  @Get('restore/status')
  @Public()
  restoreStatus(@Query('token') token: string): RestoreProgress {
    return this.restores.progress(String(token ?? ''));
  }

  /** „Alte Datenbank löschen“: the database kept after a restore. */
  @Delete('previous-databases/:name')
  @HttpCode(204)
  dropPrevious(@Param('name') name: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.restores.dropPrevious(name, actor(user)).catch((error: unknown) => httpError(error));
  }
}
