import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ACCESS_REPORT_PERMISSION,
  type AccessReport,
  AccessReportCreate,
  AccessReportHandOver,
  type AccessReportSectionSummary,
  Language,
  type MyAccessReport,
} from '@forga/core-contracts';
import type { AuthenticatedUser } from '../security/authenticated-user.js';
import { CurrentUser, RequirePermissions } from '../security/decorators.js';
import { ZodPipe } from '../zod.pipe.js';
import { AccessReportService } from './access-report.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validPerson(personId: string | undefined): string {
  if (!personId || !UUID.test(personId)) throw new BadRequestException({ code: 'data.invalidPersonId' });
  return personId;
}

function sendPdf(res: Response, pdf: Buffer, name: string, inline: boolean): void {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${name}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(pdf);
}

/** File name without the name of the person (it may end up in download folders and logs). */
const fileName = (createdAt: Date, language: string) => `${language === 'en' ? 'access-report' : 'auskunft'}-${createdAt.toISOString().slice(0, 10)}.pdf`;

/** Access reports (Art. 15 GDPR) in the person file. */
@Controller('core/privacy/access-reports')
@RequirePermissions(ACCESS_REPORT_PERMISSION)
export class AccessReportsController {
  constructor(private readonly reports: AccessReportService) {}

  /** Sections and their number of entries, shown in the dialog before creating a report. */
  @Get('preview')
  preview(@Query('personId') personId: string | undefined, @Query('language') language: string | undefined): Promise<AccessReportSectionSummary[]> {
    const parsed = Language.safeParse(language ?? 'de');
    return this.reports.preview(validPerson(personId), parsed.success ? parsed.data : 'de');
  }

  @Get()
  list(@Query('personId') personId: string | undefined): Promise<AccessReport[]> {
    return this.reports.list(validPerson(personId));
  }

  @Post()
  @HttpCode(202)
  create(@Body(new ZodPipe(AccessReportCreate)) input: Required<AccessReportCreate>, @CurrentUser() user: AuthenticatedUser): Promise<AccessReport> {
    return this.reports.create(input, user);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<AccessReport> {
    return this.reports.get(id);
  }

  @Get(':id/file')
  async file(@Param('id') id: string, @Query('inline') inline: string | undefined, @CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const { document, pdf } = await this.reports.file(id, { user, self: false });
    sendPdf(res, pdf, fileName(document.createdAt, document.language), inline === '1');
  }

  @Post(':id/hand-over')
  handOver(@Param('id') id: string, @Body(new ZodPipe(AccessReportHandOver)) input: AccessReportHandOver, @CurrentUser() user: AuthenticatedUser): Promise<AccessReport> {
    return this.reports.handOver(id, input, user);
  }
}

/** Reports provided to the logged-in member in "Mein Bereich"; no permission and no second factor needed. */
@Controller('core/me/access-reports')
export class MyAccessReportsController {
  constructor(private readonly reports: AccessReportService) {}

  @Get()
  mine(@CurrentUser() user: AuthenticatedUser): Promise<MyAccessReport[]> {
    return this.reports.mine(user);
  }

  @Get(':id/file')
  async file(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const { document, pdf } = await this.reports.file(id, { user, self: true });
    sendPdf(res, pdf, fileName(document.createdAt, document.language), false);
  }
}
