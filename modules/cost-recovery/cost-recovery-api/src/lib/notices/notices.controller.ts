import { Body, Controller, Delete, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post, Put, Query, Res } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { Response } from 'express';
import { z } from 'zod';
import { type AuthenticatedUser, berlinDate, CurrentUser, RequirePermissions, ZodPipe } from '@forga/core-api';
import {
  type AddressBookEntry,
  AddressBookInput,
  type Candidate,
  CancellationInput,
  DiscardInput,
  type IncidentNotice,
  type Notice,
  NoticeFilter,
  type NoticeIncident,
  NoticeInput,
  ObjectionInput,
  PaymentInput,
  PaymentReversalInput,
  RefundInput,
} from '@forga/cost-recovery-contracts';
import { AddressBookEntity } from '../cost-recovery.entities.js';
import { type HandoverFile, TreasuryHandover } from './handover.js';
import { NoticesService, toNoticeDto } from './notices.service.js';

type Parsed<T extends z.ZodType> = z.infer<T>;
const READ = 'cost-recovery.read';
const WRITE = 'cost-recovery.write';
const ISSUE = 'cost-recovery.issue';
const REFUND = 'cost-recovery.refund';
const Create = z.object({ incidentId: z.uuid() });
const OffenseChoice = z.object({ offenseKey: z.string().min(1).nullable() });

const toEntry = (e: AddressBookEntity): AddressBookEntry => ({ id: e.id, name: e.name, street: e.street, postalCode: e.postalCode, city: e.city, role: e.role, notes: e.notes, version: e.version });

const sendFile = (res: Response, file: HandoverFile) => {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('X-Handed-Over', String(file.handedOver));
  res.setHeader('X-Changes', String(file.changes));
  res.send(file.body);
};

@Controller('cost-recovery')
export class NoticesController {
  constructor(
    private readonly notices: NoticesService,
    private readonly handover: TreasuryHandover,
    private readonly em: EntityManager,
  ) {}

  /** Chargeable incidents of a period with their notice, if any. */
  @Get('candidates')
  @RequirePermissions(READ)
  candidates(@Query('from') from?: string, @Query('to') to?: string): Promise<Candidate[]> {
    const year = berlinDate().slice(0, 4);
    return this.notices.candidates(from ?? `${Number(year) - 1}-01-01`, to ?? `${year}-12-31`);
  }

  /** Notices of the filter: `status`, `year`, `q` (file number, debtor, dispatch number, cash reference), `overdue=true`, `refund=true`. */
  @Get('notices')
  @RequirePermissions(READ)
  list(@Query(new ZodPipe(NoticeFilter)) filter: Parsed<typeof NoticeFilter>): Promise<Notice[]> {
    return this.notices.list(filter);
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
  update(@Param('id') id: string, @Body(new ZodPipe(NoticeInput)) input: Parsed<typeof NoticeInput>, @CurrentUser() user: AuthenticatedUser): Promise<Notice> {
    return this.notices.update(user, id, input);
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
  submit(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Notice> {
    return this.notices.submit(user, id);
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

  /** A payment received, also partial (`{ date, amount, note }`). */
  @Post('notices/:id/payments')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  pay(@Param('id') id: string, @Body(new ZodPipe(PaymentInput)) input: Parsed<typeof PaymentInput>, @CurrentUser() user: AuthenticatedUser): Promise<Notice> {
    return this.notices.addPayment(user, id, input);
  }

  /** Refund of an overpayment (`{ date, amount, note }`), recorded as negative payment. */
  @Post('notices/:id/refunds')
  @HttpCode(200)
  @RequirePermissions(REFUND)
  refund(@Param('id') id: string, @Body(new ZodPipe(RefundInput)) input: Parsed<typeof RefundInput>, @CurrentUser() user: AuthenticatedUser): Promise<Notice> {
    return this.notices.refund(user, id, input);
  }

  @Post('notices/:id/payments/:paymentId/reverse')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  reverse(@Param('id') id: string, @Param('paymentId') paymentId: string, @Body(new ZodPipe(PaymentReversalInput)) input: Parsed<typeof PaymentReversalInput>, @CurrentUser() user: AuthenticatedUser): Promise<Notice> {
    return this.notices.reversePayment(user, id, paymentId, input.reason);
  }

  /** Records a payment reminder for an overdue notice; the letter is `GET …/reminders/:index/pdf`. */
  @Post('notices/:id/reminders')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  remind(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Notice> {
    return this.notices.remind(user, id);
  }

  @Get('notices/:id/reminders/:index/pdf')
  @RequirePermissions(READ)
  async reminderPdf(@Param('id') id: string, @Param('index') index: string, @Res() res: Response): Promise<void> {
    const { number, data } = await this.notices.reminderPdf(id, Number(index));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Zahlungserinnerung_${number}.pdf"`);
    res.send(data);
  }

  @Post('notices/:id/objection')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  objection(@Param('id') id: string, @Body(new ZodPipe(ObjectionInput)) input: Parsed<typeof ObjectionInput>): Promise<Notice> {
    return this.notices.objection(id, input);
  }

  /** Discards a draft or a notice in review (never issued). */
  @Post('notices/:id/discard')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  discard(@Param('id') id: string, @Body(new ZodPipe(DiscardInput)) input: Parsed<typeof DiscardInput>): Promise<Notice> {
    return this.notices.discard(id, input.reason);
  }

  /** Deletes a draft; submitted or issued notices are discarded or lifted instead. */
  @Delete('notices/:id')
  @HttpCode(204)
  @RequirePermissions(WRITE)
  async remove(@Param('id') id: string): Promise<void> {
    await this.notices.remove(id);
  }

  /** Lifts an issued notice (Aufhebung). */
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
   * Handover file for the treasury (Sollstellung) in the format of the settings, for the filter of the list (or `ids`).
   * Without status: the notices in effect not handed over yet and the cancellations not yet reported. Marks nothing.
   */
  @Get('export')
  @RequirePermissions(READ)
  async export(@Query(new ZodPipe(NoticeFilter)) filter: Parsed<typeof NoticeFilter>, @Res() res: Response): Promise<void> {
    sendFile(res, await this.handover.export(filter, false));
  }

  /** The same file, and the notices in it count as handed over (one step), so the next handover does not repeat them. */
  @Post('export/hand-over')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  async exportAndHandOver(@Query(new ZodPipe(NoticeFilter)) filter: Parsed<typeof NoticeFilter>, @Res() res: Response): Promise<void> {
    sendFile(res, await this.handover.export(filter, true));
  }

  // ----- Incident page -----

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

  /** Notices of the incident with status, for the card on the incident. */
  @Get('incidents/:incidentId/notices')
  @RequirePermissions(READ)
  ofIncident(@Param('incidentId') incidentId: string): Promise<IncidentNotice[]> {
    return this.notices.ofIncident(incidentId);
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
