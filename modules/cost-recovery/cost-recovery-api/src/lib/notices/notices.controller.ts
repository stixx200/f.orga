import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post, Put, Query, Res } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { addStyledSheet, type AuthenticatedUser, berlinDate, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import { type AddressBookEntry, AddressBookInput, type Candidate, CancellationInput, type CostRecoverySettings, type HandoverColumn, type Notice, type NoticeIncident, NoticeInput, ObjectionInput, PaymentInput, totalOf } from '@forga/cost-recovery-contracts';
import { AddressBookEntity, NoticeEntity } from '../cost-recovery.entities.js';
import { NoticesService, toNoticeDto } from './notices.service.js';

type Parsed<T extends z.ZodType> = z.infer<T>;
const READ = 'cost-recovery.read';
const WRITE = 'cost-recovery.write';
const ISSUE = 'cost-recovery.issue';
const Create = z.object({ incidentId: z.uuid() });

const toEntry = (e: AddressBookEntity): AddressBookEntry => ({ id: e.id, name: e.name, street: e.street, postalCode: e.postalCode, city: e.city, role: e.role, notes: e.notes, version: e.version });

/** CSV cell for German spreadsheet programs: decimal comma, quoted when needed. */
const OffenseChoice = z.object({ offenseKey: z.string().min(1).nullable() });

const csvCell = (v: string | number) => (typeof v === 'number' ? v.toFixed(2).replace('.', ',') : /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

const HANDOVER_COLUMNS: Record<HandoverColumn, { label: string; width: number; value: (n: NoticeEntity, config: CostRecoverySettings) => string | number }> = {
  number: { label: 'Aktenzeichen', width: 16, value: (n) => n.number },
  cashReference: { label: 'Kassenzeichen', width: 16, value: (n) => n.cashReference },
  debtors: { label: 'Kostenschuldner', width: 30, value: (n) => n.debtors.map((d) => d.name).join('; ') },
  address: { label: 'Anschrift', width: 40, value: (n) => n.debtors.map((d) => [d.street, `${d.postalCode} ${d.city}`.trim()].filter(Boolean).join(', ')).join('; ') },
  amount: { label: 'Betrag (€)', width: 12, value: (n) => totalOf(n.positions) },
  dueOn: { label: 'Fällig am', width: 12, value: (n) => n.dueOn ?? '' },
  issuedOn: { label: 'Erlassen am', width: 12, value: (n) => (n.issuedAt ? berlinDate(n.issuedAt) : '') },
  budgetAccount: { label: 'Haushaltsstelle', width: 16, value: (_n, config) => config.budgetAccount },
  incident: { label: 'Einsatz', width: 22, value: (n) => `${n.dispatchNumber} ${n.alarmKeyword}` },
};

@Controller('cost-recovery')
export class NoticesController {
  constructor(
    private readonly notices: NoticesService,
    private readonly em: EntityManager,
  ) {}

  /** Chargeable incidents of a period with their notice, if any. */
  @Get('candidates')
  @RequirePermissions(READ)
  candidates(@Query('from') from?: string, @Query('to') to?: string): Promise<Candidate[]> {
    const year = berlinDate().slice(0, 4);
    return this.notices.candidates(from ?? `${Number(year) - 1}-01-01`, to ?? `${year}-12-31`);
  }

  @Get('notices')
  @RequirePermissions(READ)
  list(@Query('status') status?: string, @Query('year') year?: string): Promise<Notice[]> {
    return this.notices.list({ status, year: year ? Number(year) : undefined });
  }

  @Post('notices')
  @RequirePermissions(WRITE)
  create(@Body(new ZodPipe(Create)) input: Parsed<typeof Create>): Promise<Notice> {
    return this.notices.create(input.incidentId);
  }

  @Get('notices/:id')
  @RequirePermissions(READ)
  async get(@Param('id') id: string): Promise<Notice> {
    return toNoticeDto(await this.notices.load(this.em.fork(), id));
  }

  /** The incident of the notice, for reading it while the notice is written. */
  @Get('notices/:id/incident')
  @RequirePermissions(READ)
  incident(@Param('id') id: string): Promise<NoticeIncident> {
    return this.notices.incidentOf(id);
  }

  @Put('notices/:id')
  @RequirePermissions(WRITE)
  update(@Param('id') id: string, @Body(new ZodPipe(NoticeInput)) input: Parsed<typeof NoticeInput>): Promise<Notice> {
    return this.notices.update(id, input);
  }

  @Post('notices/:id/recalculate')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  recalculate(@Param('id') id: string): Promise<Notice> {
    return this.notices.recalculate(id);
  }

  @Post('notices/:id/submit')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  submit(@Param('id') id: string): Promise<Notice> {
    return this.notices.submit(id);
  }

  @Post('notices/:id/return')
  @HttpCode(200)
  @RequirePermissions(ISSUE)
  returnToDraft(@Param('id') id: string): Promise<Notice> {
    return this.notices.returnToDraft(id);
  }

  @Post('notices/:id/issue')
  @HttpCode(200)
  @RequirePermissions(ISSUE)
  issue(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Notice> {
    return this.notices.issue(user, id);
  }

  @Post('notices/:id/hand-over')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  handOver(@Param('id') id: string): Promise<Notice> {
    return this.notices.handOver(id);
  }

  /** Amendment notice for an issued notice (draft copy, replaces the original when issued). */
  @Post('notices/:id/amend')
  @RequirePermissions(WRITE)
  amend(@Param('id') id: string): Promise<Notice> {
    return this.notices.amend(id);
  }

  @Post('notices/:id/paid')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  paid(@Param('id') id: string, @Body(new ZodPipe(PaymentInput)) input: Parsed<typeof PaymentInput>): Promise<Notice> {
    return this.notices.markPaid(id, input.paidOn);
  }

  @Post('notices/:id/objection')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  objection(@Param('id') id: string, @Body(new ZodPipe(ObjectionInput)) input: Parsed<typeof ObjectionInput>): Promise<Notice> {
    return this.notices.objection(id, input);
  }

  @Post('notices/:id/cancel')
  @HttpCode(200)
  @RequirePermissions(ISSUE)
  cancel(@Param('id') id: string, @Body(new ZodPipe(CancellationInput)) input: Parsed<typeof CancellationInput>): Promise<Notice> {
    return this.notices.cancel(id, input.reason);
  }

  /** The issued PDF (stored as issued) or a preview of a draft. */
  @Get('notices/:id/pdf')
  @RequirePermissions(READ)
  async pdf(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const { number, data } = await this.notices.pdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Kostenbescheid_${number}.pdf"`);
    res.send(data);
  }

  /**
   * Handover to the treasury (Sollstellung) in the format of the settings: columns and Excel or CSV
   * (issued notices, or the given ones).
   */
  @Get('export')
  @RequirePermissions(READ)
  async export(@Query('ids') ids: string | undefined, @Res() res: Response): Promise<void> {
    const config = await this.notices.config();
    const where = ids ? { id: { $in: ids.split(',') } } : { status: 'issued' as const };
    const notices = await this.em.fork().find(NoticeEntity, where, { orderBy: { number: 'asc' } });
    const columns = config.handover.columns.map((c) => HANDOVER_COLUMNS[c]);
    const rows = notices.map((n) => columns.map((c) => c.value(n, config)));
    if (config.handover.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="Kostenersatz_Sollstellung.csv"');
      res.send(`\uFEFF${[columns.map((c) => c.label), ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`);
      return;
    }
    const wb = new ExcelJS.Workbook();
    wb.creator = 'f.orga';
    addStyledSheet(wb, 'Sollstellung', 'Kostenbescheide – Übergabe an die Kämmerei', `${config.authority} · ${berlinDate()}`, columns.map((c) => c.label), rows, columns.map((c) => c.width));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Kostenersatz_Sollstellung.xlsx"');
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  }

  // ----- Legal ground from the incident report -----

  /** Readable for everyone who reads the incident; the card on the incident shows it. */
  @Get('incidents/:incidentId/offense')
  async offense(@Param('incidentId') incidentId: string): Promise<{ offenseKey: string | null }> {
    return { offenseKey: (await this.notices.chosenOffenses([incidentId])).get(incidentId) ?? null };
  }

  @Put('incidents/:incidentId/offense')
  async setOffense(@Param('incidentId') incidentId: string, @Body(new ZodPipe(OffenseChoice)) input: Parsed<typeof OffenseChoice>, @CurrentUser() user: AuthenticatedUser): Promise<{ offenseKey: string | null }> {
    // Like the costs of the incident: the commander, or whoever edits cost notices.
    if (!['incidents.costs', 'cost-recovery.write'].some((p) => user.can(p))) throw new ForbiddenException({ code: 'auth.forbidden', permissions: ['incidents.costs'] });
    return { offenseKey: await this.notices.setOffense(user, incidentId, input.offenseKey) };
  }

  // ----- Address book -----

  @Get('debtors')
  @RequirePermissions(WRITE)
  async debtors(): Promise<AddressBookEntry[]> {
    return (await this.em.fork().find(AddressBookEntity, {}, { orderBy: { name: 'asc' } })).map(toEntry);
  }

  @Post('debtors')
  @RequirePermissions(WRITE)
  async createDebtor(@Body(new ZodPipe(AddressBookInput)) input: Parsed<typeof AddressBookInput>): Promise<AddressBookEntry> {
    const em = this.em.fork();
    const entry = em.create(AddressBookEntity, input);
    await em.flush();
    return toEntry(entry);
  }

  @Put('debtors/:id')
  @RequirePermissions(WRITE)
  async updateDebtor(@Param('id') id: string, @Body(new ZodPipe(AddressBookInput)) input: Parsed<typeof AddressBookInput>): Promise<AddressBookEntry> {
    const em = this.em.fork();
    const entry = await em.findOne(AddressBookEntity, id);
    if (!entry) throw new NotFoundException();
    Object.assign(entry, input);
    await em.flush();
    return toEntry(entry);
  }

  @Delete('debtors/:id')
  @HttpCode(204)
  @RequirePermissions(WRITE)
  async removeDebtor(@Param('id') id: string): Promise<void> {
    const em = this.em.fork();
    const entry = await em.findOne(AddressBookEntity, id);
    if (!entry) throw new NotFoundException();
    await em.remove(entry).flush();
  }
}
