import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { type AuthenticatedUser, berlinDate, CurrentUser, RequirePermissions, SettingsService, ZodPipe } from '@forga/core-api';
import type { BrigadeSettings } from '@forga/core-contracts';
import { CloseInput, DeferInput, type Run, type RunDetail, RunInput } from '@forga/compensation-contracts';
import { ItemsService, RUNS } from '../items/items.service.js';
import { RunsService } from './runs.service.js';

type Parsed<T extends z.ZodType> = z.infer<T>;
const RUNS_READ = 'compensation.runs.read';
const APPROVE = 'compensation.approve';

/** Reading runs and their files: who prepares the runs, or who may view them (e.g. the commander before the approval). */
const assertCanRead = (user: AuthenticatedUser) => {
  if (!user.can(RUNS) && !user.can(RUNS_READ)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [RUNS_READ] });
};

@Controller('compensation/runs')
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly items: ItemsService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<Run[]> {
    assertCanRead(user);
    return this.runs.list();
  }

  @Post()
  @RequirePermissions(RUNS)
  create(@Body(new ZodPipe(RunInput)) input: Parsed<typeof RunInput>): Promise<RunDetail> {
    return this.runs.create(input);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<RunDetail> {
    assertCanRead(user);
    return this.runs.detail(id);
  }

  @Post(':id/refresh')
  @HttpCode(200)
  @RequirePermissions(RUNS)
  refresh(@Param('id') id: string): Promise<RunDetail> {
    return this.runs.refresh(id);
  }

  /** Moves items of the draft to the next run ("In nächsten Lauf verschieben"). */
  @Post(':id/defer')
  @HttpCode(200)
  @RequirePermissions(RUNS)
  defer(@Param('id') id: string, @Body(new ZodPipe(DeferInput)) input: Parsed<typeof DeferInput>): Promise<RunDetail> {
    return this.runs.defer(id, input.itemIds);
  }

  @Post(':id/undefer')
  @HttpCode(200)
  @RequirePermissions(RUNS)
  undefer(@Param('id') id: string, @Body(new ZodPipe(DeferInput)) input: Parsed<typeof DeferInput>): Promise<RunDetail> {
    return this.runs.undefer(id, input.itemIds);
  }

  /** Closes the run; persons without valid IBAN need `{ acceptMissingIban: true }`. */
  @Post(':id/close')
  @HttpCode(200)
  @RequirePermissions(RUNS)
  close(@Param('id') id: string, @Body(new ZodPipe(CloseInput)) input: Parsed<typeof CloseInput>, @CurrentUser() user: AuthenticatedUser): Promise<RunDetail> {
    return this.runs.close(user, id, input.acceptMissingIban);
  }

  /** Factual approval ("sachlich richtig") of a closed run. */
  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions(APPROVE)
  approve(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<RunDetail> {
    return this.runs.approve(user, id);
  }

  @Post(':id/hand-over')
  @HttpCode(200)
  @RequirePermissions(RUNS)
  handOver(@Param('id') id: string): Promise<RunDetail> {
    return this.runs.advance(id, 'handed-over');
  }

  @Post(':id/paid')
  @HttpCode(200)
  @RequirePermissions(RUNS)
  paid(@Param('id') id: string): Promise<RunDetail> {
    return this.runs.advance(id, 'paid');
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions(RUNS)
  remove(@Param('id') id: string): Promise<void> {
    return this.runs.remove(id);
  }

  @Get(':id/export.xlsx')
  async workbook(@Param('id') id: string, @Query('lang') lang: string | undefined, @CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    assertCanRead(user);
    const brigade = ((await this.settings.get<BrigadeSettings>('brigade')) as BrigadeSettings | null)?.name ?? '';
    const { number, buffer } = await this.runs.workbook(id, lang === 'en' ? 'en' : 'de', brigade);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Entschaedigung_${number}.xlsx"`);
    res.send(buffer);
  }

  /** Statements, one page per person; `?departmentId=` only the persons of that primary department. */
  @Get(':id/statements.pdf')
  async statements(@Param('id') id: string, @Query('departmentId') departmentId: string | undefined, @CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    assertCanRead(user);
    const { number, pdf } = await this.runs.statementsPdf(id, departmentId || null);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Abrechnungen_${number}.pdf"`);
    res.send(pdf);
  }

  /** SEPA credit transfer file for online banking (`?executionDate=`, default today); only for closed runs. */
  @Get(':id/transfer.xml')
  @RequirePermissions(RUNS)
  async transferXml(@Param('id') id: string, @Query('executionDate') executionDate: string | undefined, @Res() res: Response): Promise<void> {
    const date = executionDate && /^\d{4}-\d{2}-\d{2}$/.test(executionDate) ? executionDate : berlinDate();
    const { number, xml } = await this.runs.transferXml(id, await this.items.config(), date);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="SEPA_${number}.xml"`);
    res.send(xml);
  }

  /** Transfer file (CSV); only for closed runs, like the SEPA file. */
  @Get(':id/transfer.csv')
  @RequirePermissions(RUNS)
  async transfer(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { number, csv } = await this.runs.transferCsv(id, (await this.items.config()).transferPurpose);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Ueberweisungen_${number}.csv"`);
    res.send(csv);
  }
}
