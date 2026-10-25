import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import { type AuthenticatedUser, berlinDate, CurrentUser, RequirePermissions, SettingsService, ZodPipe } from '@forga/core-api';
import type { BrigadeSettings } from '@forga/core-contracts';
import { type Run, type RunDetail, RunInput } from '@forga/compensation-contracts';
import { ItemsService, RUNS } from '../items/items.service.js';
import { RunsService } from './runs.service.js';

type Parsed<T extends z.ZodType> = z.infer<T>;

@Controller('compensation/runs')
@RequirePermissions(RUNS)
export class RunsController {
  constructor(
    private readonly runs: RunsService,
    private readonly items: ItemsService,
    private readonly settings: SettingsService,
  ) {}

  @Get()
  list(): Promise<Run[]> {
    return this.runs.list();
  }

  @Post()
  create(@Body(new ZodPipe(RunInput)) input: Parsed<typeof RunInput>): Promise<RunDetail> {
    return this.runs.create(input);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<RunDetail> {
    return this.runs.detail(id);
  }

  @Post(':id/refresh')
  @HttpCode(200)
  refresh(@Param('id') id: string): Promise<RunDetail> {
    return this.runs.refresh(id);
  }

  @Post(':id/close')
  @HttpCode(200)
  close(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<RunDetail> {
    return this.runs.close(user, id);
  }

  @Post(':id/hand-over')
  @HttpCode(200)
  handOver(@Param('id') id: string): Promise<RunDetail> {
    return this.runs.advance(id, 'handed-over');
  }

  @Post(':id/paid')
  @HttpCode(200)
  paid(@Param('id') id: string): Promise<RunDetail> {
    return this.runs.advance(id, 'paid');
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id') id: string): Promise<void> {
    return this.runs.remove(id);
  }

  @Get(':id/export.xlsx')
  async workbook(@Param('id') id: string, @Query('lang') lang: string | undefined, @Res() res: Response): Promise<void> {
    const brigade = ((await this.settings.get<BrigadeSettings>('brigade')) as BrigadeSettings | null)?.name ?? '';
    const { number, buffer } = await this.runs.workbook(id, lang === 'en' ? 'en' : 'de', brigade);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Entschaedigung_${number}.xlsx"`);
    res.send(buffer);
  }

  /** Statements, one page per person; `?departmentId=` only the persons of that primary department. */
  @Get(':id/statements.pdf')
  async statements(@Param('id') id: string, @Query('departmentId') departmentId: string | undefined, @Res() res: Response): Promise<void> {
    const { number, pdf } = await this.runs.statementsPdf(id, departmentId || null);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Abrechnungen_${number}.pdf"`);
    res.send(pdf);
  }

  /** SEPA credit transfer file for online banking (`?executionDate=`, default today). */
  @Get(':id/transfer.xml')
  async transferXml(@Param('id') id: string, @Query('executionDate') executionDate: string | undefined, @Res() res: Response): Promise<void> {
    const date = executionDate && /^\d{4}-\d{2}-\d{2}$/.test(executionDate) ? executionDate : berlinDate();
    const { number, xml } = await this.runs.transferXml(id, await this.items.config(), date);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="SEPA_${number}.xml"`);
    res.send(xml);
  }

  @Get(':id/transfer.csv')
  async transfer(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { number, csv } = await this.runs.transferCsv(id, (await this.items.config()).transferPurpose);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Ueberweisungen_${number}.csv"`);
    res.send(csv);
  }
}
