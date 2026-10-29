import { Body, Controller, ForbiddenException, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  LANGUAGES,
  type Language,
  RETENTION_PERMISSION,
  type RetentionCase,
  type RetentionCategory,
  RetentionDecision,
  RetentionDeferral,
  RetentionExecution,
  type RetentionExecutionResult,
  RetentionOffer,
  type RetentionResult,
  RetentionRun,
} from '@forga/core-contracts';
import { Audit } from '../audit/audit.js';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../security/decorators.js';
import { ZodPipe } from '../zod.pipe.js';
import { RetentionExport } from './retention-export.js';
import { RetentionService } from './retention.service.js';

const SETTINGS = 'core.settings.manage';

@Controller('core/retention')
export class RetentionController {
  constructor(
    private readonly retention: RetentionService,
    private readonly exporter: RetentionExport,
    private readonly audit: Audit,
  ) {}

  private requireAny(user: AuthenticatedUser, ...permissions: string[]): void {
    if (!permissions.some((p) => user.can(p))) throw new ForbiddenException({ code: 'auth.forbidden', permissions });
  }

  /** Categories with their subtypes, for the settings page and the list „Aussonderung“. */
  @Get('categories')
  categories(@CurrentUser() user: AuthenticatedUser): Promise<RetentionCategory[]> {
    this.requireAny(user, SETTINGS, RETENTION_PERMISSION);
    return this.retention.categories();
  }

  /**
   * Applies the rules now; with `dryRun` only counts what would be due. Only the managers of the settings may try rules that
   * are not saved; those who work on the list may start a real run.
   */
  @Post('run')
  @HttpCode(200)
  run(@Body(new ZodPipe(RetentionRun)) input: ReturnType<typeof RetentionRun.parse>, @CurrentUser() user: AuthenticatedUser): Promise<RetentionResult> {
    if (input.dryRun && input.settings) this.requireAny(user, SETTINGS);
    else this.requireAny(user, SETTINGS, RETENTION_PERMISSION);
    return this.retention.run(input.dryRun, input.dryRun ? input.settings : undefined);
  }

  @Get('cases')
  @RequirePermissions(RETENTION_PERMISSION)
  cases(): Promise<RetentionCase[]> {
    return this.retention.list();
  }

  @Post('cases/offer')
  @HttpCode(200)
  @RequirePermissions(RETENTION_PERMISSION)
  offer(@Body(new ZodPipe(RetentionOffer)) input: ReturnType<typeof RetentionOffer.parse>): Promise<{ offerId: string }> {
    return this.retention.offer(input);
  }

  /** ZIP for the archive with the records of one offer. */
  @Get('offers/:offerId/export')
  @RequirePermissions(RETENTION_PERMISSION)
  async export(@Param('offerId') offerId: string, @Query('lang') lang: string | undefined, @CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const language: Language = LANGUAGES.includes(lang as Language) ? (lang as Language) : user.language;
    const { fileName, zip, count } = await this.exporter.offer(offerId, language);
    await this.audit.log('retention.exported', { offerId, count });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(zip);
  }

  @Post('cases/decide')
  @HttpCode(204)
  @RequirePermissions(RETENTION_PERMISSION)
  decide(@Body(new ZodPipe(RetentionDecision)) input: ReturnType<typeof RetentionDecision.parse>): Promise<void> {
    return this.retention.decide(input);
  }

  @Post('cases/defer')
  @HttpCode(204)
  @RequirePermissions(RETENTION_PERMISSION)
  defer(@Body(new ZodPipe(RetentionDeferral)) input: ReturnType<typeof RetentionDeferral.parse>): Promise<void> {
    return this.retention.defer(input);
  }

  @Post('cases/execute')
  @HttpCode(200)
  @RequirePermissions(RETENTION_PERMISSION)
  execute(@Body(new ZodPipe(RetentionExecution)) input: ReturnType<typeof RetentionExecution.parse>): Promise<RetentionExecutionResult> {
    return this.retention.execute(input.caseIds);
  }
}
