import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post, Put, Query, Res, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Audit, type AuthenticatedUser, CurrentUser, isTestStage, RequirePermissions, ZodPipe } from '@forga/core-api';
import type { RememberedMapping } from '@forga/core-contracts';
import { MP_FEUER_READ, MP_FEUER_TRANSFER, type MpFeuerExportInfo, type MpFeuerRemembered, type MpFeuerRun, type RunReport, RunSelection, type RunSummary } from '@forga/mp-feuer-contracts';
import { MpFeuerExports } from '../exports/export-adapter.js';
import { MpFeuerMappings } from './mp-feuer-mappings.js';
import { MpFeuerRuns } from './runs.service.js';

const MAX_FILES = 40;
const MAX_SIZE = 200 * 1024 * 1024;

/** The transfer files hold the real data of the brigade: never into the test system (`FORGA_STAGE=test`). */
function assertNotTestStage(): void {
  if (isTestStage()) throw new ForbiddenException({ code: 'mp-feuer.lockedInTestStage' });
}

interface UploadedFileData {
  originalname: string;
  buffer: Buffer;
}

/** Runs of the data transfer from MP-Feuer. */
@Controller('mp-feuer/runs')
export class RunsController {
  constructor(private readonly runs: MpFeuerRuns) {}

  /** Uploads the transfer files (`multipart/form-data`, field `files`) and reads them into a prepared run. */
  @Post()
  @RequirePermissions(MP_FEUER_TRANSFER)
  @UseInterceptors(FilesInterceptor('files', MAX_FILES, { limits: { fileSize: MAX_SIZE } }))
  upload(@UploadedFiles() files: UploadedFileData[] | undefined, @CurrentUser() user: AuthenticatedUser): Promise<MpFeuerRun> {
    assertNotTestStage();
    return this.runs.upload(user, files);
  }

  @Get()
  @RequirePermissions(MP_FEUER_READ)
  list(): Promise<RunSummary[]> {
    return this.runs.list();
  }

  /** State and progress; poll every 2 seconds while the run works. */
  @Get(':id')
  @RequirePermissions(MP_FEUER_READ)
  get(@Param('id') id: string): Promise<MpFeuerRun> {
    return this.runs.get(id);
  }

  /** Archives (department, unit, skip), datasets (on/off, options) and mappings. */
  @Put(':id')
  @RequirePermissions(MP_FEUER_TRANSFER)
  update(@Param('id') id: string, @Body(new ZodPipe(RunSelection)) selection: ReturnType<typeof RunSelection.parse>): Promise<MpFeuerRun> {
    return this.runs.update(id, selection);
  }

  @Post(':id/dry-run')
  @HttpCode(202)
  @RequirePermissions(MP_FEUER_TRANSFER)
  dryRun(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<MpFeuerRun> {
    assertNotTestStage();
    return this.runs.start(user, id, true);
  }

  /** Needs a dry run with the same selection and mappings (`409 mp-feuer.dryRunOutdated`). */
  @Post(':id/apply')
  @HttpCode(202)
  @RequirePermissions(MP_FEUER_TRANSFER)
  apply(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<MpFeuerRun> {
    assertNotTestStage();
    return this.runs.start(user, id, false);
  }

  /** Stops the working run after its current part. */
  @Post(':id/cancel')
  @HttpCode(202)
  @RequirePermissions(MP_FEUER_TRANSFER)
  cancel(@Param('id') id: string): Promise<MpFeuerRun> {
    return this.runs.cancel(id);
  }

  /** Result report; `?format=csv`: all rows with messages. */
  @Get(':id/report')
  @RequirePermissions(MP_FEUER_READ)
  async report(@Param('id') id: string, @Query('format') format: string | undefined, @Res({ passthrough: true }) res: Response): Promise<RunReport | string> {
    if (format !== 'csv') return this.runs.report(id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="mp-feuer-${id}.csv"`);
    return this.runs.reportCsv(id);
  }

  /** Discards a run that has not been applied, with the rows read. */
  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(MP_FEUER_TRANSFER)
  remove(@Param('id') id: string): Promise<void> {
    return this.runs.remove(id);
  }
}

/** The mapping list of the module, the remembered selection and the exports. */
@Controller('mp-feuer')
export class MpFeuerController {
  constructor(
    private readonly runs: MpFeuerRuns,
    private readonly mappings: MpFeuerMappings,
    private readonly exports: MpFeuerExports,
    private readonly audit: Audit,
  ) {}

  @Get('mappings')
  @RequirePermissions(MP_FEUER_READ)
  list(@Query('kind') kind?: string, @Query('q') q?: string, @Query('problems') problems?: string): Promise<RememberedMapping[]> {
    return this.mappings.list({ kind: kind || undefined, q, problems: problems === 'true' });
  }

  /** Forgets a mapping: the next run reports the value as unmatched again. */
  @Delete('mappings/:id')
  @HttpCode(204)
  @RequirePermissions(MP_FEUER_TRANSFER)
  async deleteMapping(@Param('id') id: string): Promise<void> {
    const removed = await this.mappings.remove(id);
    if (!removed) throw new NotFoundException({ code: 'mp-feuer.mappingNotFound' });
    await this.audit.log('mp-feuer.mapping-deleted', { kind: removed.kind, value: removed.value, key: removed.key });
  }

  @Get('remembered')
  @RequirePermissions(MP_FEUER_READ)
  remembered(): Promise<MpFeuerRemembered> {
    return this.runs.remembered();
  }

  /** Forgets departments, units, skipped archives and options; the mappings stay. */
  @Delete('remembered')
  @HttpCode(204)
  @RequirePermissions(MP_FEUER_TRANSFER)
  async resetRemembered(): Promise<void> {
    await this.runs.resetRemembered();
    await this.audit.log('mp-feuer.remembered-reset');
  }

  /** Exports to MP-Feuer the user may create (none until the templates of MP-Feuer exist). */
  @Get('exports')
  @RequirePermissions(MP_FEUER_READ)
  exportList(@CurrentUser() user: AuthenticatedUser): MpFeuerExportInfo[] {
    return this.exports.available(user);
  }
}
