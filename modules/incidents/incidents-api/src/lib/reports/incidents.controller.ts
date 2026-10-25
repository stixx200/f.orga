import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { z } from 'zod';
import { Audit, type AuthenticatedUser, berlinDayAfter, berlinDayStart, CurrentUser, MailService, Notifications, RequirePermissions, ZodPipe } from '@forga/core-api';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import {
  AssignAuthor,
  type Incident as IncidentDto,
  IncidentInput,
  NewReportInput,
  Release,
  RemindAuthors,
  type RemindResult,
  type Report,
  type ReportRevision,
  ReportInput,
  ReturnToAuthor,
  Submit,
  Unlock,
} from '@forga/incidents-contracts';
import { IncidentEntity, ReportEntity, ReportRevisionEntity } from '../incidents.entities.js';
import { DutyEvents } from '../duty/duty.js';
import { READ, RELEASE, REPORT_POPULATE, ReportsService, UNLOCK, WRITE } from './reports.service.js';

const Period = z.object({ from: z.iso.date(), to: z.iso.date() });

type ParsedIncident = ReturnType<typeof IncidentInput.parse>;
const CreateIncident = IncidentInput.extend({ departmentIds: z.array(z.uuid()).default([]) });
type ParsedCreateIncident = ReturnType<typeof CreateIncident.parse>;

export function toIncidentDto(incident: IncidentEntity): IncidentDto {
  return {
    id: incident.id,
    dispatchNumber: incident.dispatchNumber,
    internalNumber: incident.internalNumber,
    alarmKeyword: incident.alarmKeyword,
    alarmMessage: incident.alarmMessage,
    alarmedAt: incident.alarmedAt.toISOString(),
    location: incident.location,
    createdVia: incident.createdVia,
    reports: incident.reports
      .getItems()
      .toSorted((a, b) => Number(b.primary) - Number(a.primary) || a.number.localeCompare(b.number))
      .map((r) => ({
        id: r.id,
        departmentId: r.departmentId,
        number: r.number,
        primary: r.primary,
        status: r.status,
        locked: r.locked,
        authorPersonId: r.authorPersonId ?? null,
      })),
    version: incident.version,
  };
}

const canWriteFor = (user: AuthenticatedUser, departmentId: string) =>
  user.can(WRITE, departmentId) || user.grant(RELEASE) === 'brigade';

@Controller('incidents')
export class IncidentsController {
  private readonly logger = new Logger(IncidentsController.name);

  constructor(
    private readonly em: EntityManager,
    private readonly reports: ReportsService,
    private readonly mail: MailService,
    private readonly notifications: Notifications,
    private readonly dutyEvents: DutyEvents,
    private readonly audit: Audit,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  // ----- Incidents -----

  /** Incidents with at least one report in a department the user may read (brigade-wide: all). */
  @Get('incidents')
  @RequirePermissions(READ)
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: string,
    @Query('mine') mine?: string,
  ): Promise<IncidentDto[]> {
    const grant = user.grant(READ);
    const where: FilterQuery<IncidentEntity>[] = [];
    if (grant !== 'brigade' && user.grant(RELEASE) !== 'brigade') where.push({ reports: { departmentId: { $in: grant ?? [] } } });
    if (from) where.push({ alarmedAt: { $gte: berlinDayStart(from) } });
    if (to) where.push({ alarmedAt: { $lt: berlinDayAfter(to) } });
    if (departmentId) where.push({ reports: { departmentId } });
    if (status) where.push({ reports: { status: status as Report['status'] } });
    if (mine === 'true') where.push({ reports: { authorPersonId: user.personId ?? '-' } });
    const incidents = await this.em
      .fork()
      .find(IncidentEntity, where.length ? { $and: where } : {}, { populate: ['reports'], orderBy: { alarmedAt: 'desc' }, limit: 500 });
    return incidents.map(toIncidentDto);
  }

  /** Creates an incident and a draft report for each given department. */
  @Post('incidents')
  @RequirePermissions(WRITE)
  async create(
    @Body(new ZodPipe(CreateIncident)) input: ParsedCreateIncident,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IncidentDto> {
    for (const departmentId of input.departmentIds) {
      if (!canWriteFor(user, departmentId)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [WRITE] });
    }
    const em = this.em.fork();
    const incident = await this.reports.createIncident(em, input, 'ui');
    for (const departmentId of input.departmentIds) {
      await this.reports.createReport(em, incident, departmentId, user.personId);
    }
    await em.flush();
    await em.populate(incident, ['reports']);
    return toIncidentDto(incident);
  }

  @Get('incidents/:id')
  @RequirePermissions(READ)
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<IncidentDto> {
    const incident = await this.em.fork().findOne(IncidentEntity, id, { populate: ['reports'] });
    if (!incident || !this.visible(user, incident)) throw new NotFoundException();
    return toIncidentDto(incident);
  }

  /** Changes the incident data (number, keyword, location); not while one of its reports is locked. */
  @Put('incidents/:id')
  @RequirePermissions(WRITE)
  async update(
    @Param('id') id: string,
    @Body(new ZodPipe(IncidentInput)) input: ParsedIncident,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IncidentDto> {
    const em = this.em.fork();
    const incident = await em.findOne(IncidentEntity, id, { populate: ['reports'] });
    if (!incident || !this.visible(user, incident)) throw new NotFoundException();
    const reports = incident.reports.getItems();
    // The incident data belongs to the primary report: only its writers (and releasers) change them.
    const owner = reports.find((r) => r.primary) ?? reports[0];
    if (!owner || !canWriteFor(user, owner.departmentId)) throw new ForbiddenException({ code: 'incidents.notPrimaryWriter' });
    if (user.grant(RELEASE) !== 'brigade' && reports.some((r) => r.locked)) {
      throw new ForbiddenException({ code: 'incidents.reportLocked' });
    }
    await this.reports.requireKeyword(em, input.alarmKeyword);
    if (input.dispatchNumber && input.dispatchNumber !== incident.dispatchNumber) {
      if (await em.count(IncidentEntity, { dispatchNumber: input.dispatchNumber })) {
        throw new ConflictException({ code: 'incidents.dispatchNumberTaken' });
      }
      incident.dispatchNumber = input.dispatchNumber;
      incident.internalNumber = false;
    }
    em.assign(incident, {
      alarmKeyword: input.alarmKeyword,
      alarmMessage: input.alarmMessage,
      alarmedAt: new Date(input.alarmedAt),
      location: input.location,
    });
    await em.flush();
    return toIncidentDto(incident);
  }

  @Post('incidents/:id/reports')
  @RequirePermissions(WRITE)
  async addReport(
    @Param('id') id: string,
    @Body(new ZodPipe(NewReportInput)) input: ReturnType<typeof NewReportInput.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Report> {
    if (!canWriteFor(user, input.departmentId)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [WRITE] });
    const em = this.em.fork();
    const incident = await em.findOne(IncidentEntity, id, { populate: ['reports'] });
    if (!incident || !this.visible(user, incident)) throw new NotFoundException();
    if (incident.reports.getItems().some((r) => r.departmentId === input.departmentId)) {
      throw new ConflictException({ code: 'incidents.reportExists' });
    }
    const report = await this.reports.createReport(em, incident, input.departmentId, user.personId);
    const { departmentId: _d, ...content } = input;
    if (content.times) await this.save(em, report, ReportInput.parse({ ...content, authorPersonId: content.authorPersonId ?? report.authorPersonId }), user);
    await em.flush();
    const loaded = await this.reports.load(em, report.id, user);
    return this.reports.toDto(em, loaded);
  }

  // ----- Reports -----

  @Get('reports/:id')
  @RequirePermissions(READ)
  async getReport(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Report> {
    const em = this.em.fork();
    return this.reports.toDto(em, await this.reports.load(em, id, user));
  }

  /** Saves the whole report content. Releasers lock the report by editing it. */
  @Put('reports/:id')
  @RequirePermissions(WRITE)
  async updateReport(
    @Param('id') id: string,
    @Body(new ZodPipe(ReportInput)) input: ReturnType<typeof ReportInput.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Report> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    this.reports.assertWrite(user, report);
    await this.save(em, report, input, user);
    await em.flush();
    return this.reports.toDto(em, report);
  }

  /** Saved states of the report for undo, newest first. */
  @Get('reports/:id/revisions')
  @RequirePermissions(READ)
  async revisions(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<ReportRevision[]> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    const revisions = await em.find(ReportRevisionEntity, { report }, { orderBy: { savedAt: 'desc' } });
    return revisions.map((r) => ({
      id: r.id,
      savedAt: r.savedAt.toISOString(),
      userName: r.userName,
      personnelCount: Array.isArray(r.content['personnel']) ? (r.content['personnel'] as unknown[]).length : 0,
    }));
  }

  /** Restores a saved state; this is a normal save and can itself be undone. */
  @Post('reports/:id/revisions/:revisionId/restore')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  async restore(
    @Param('id') id: string,
    @Param('revisionId') revisionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Report> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    this.reports.assertWrite(user, report);
    const revision = await em.findOne(ReportRevisionEntity, { id: revisionId, report });
    if (!revision) throw new NotFoundException();
    await this.save(em, report, ReportInput.parse({ ...revision.content, version: undefined }), user);
    await em.flush();
    return this.reports.toDto(em, report);
  }

  /** Assigns the author of a report without changing its content (and without locking it). */
  @Post('reports/:id/author')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  async assignAuthor(
    @Param('id') id: string,
    @Body(new ZodPipe(AssignAuthor)) input: AssignAuthor,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Report> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    if (!canWriteFor(user, report.departmentId)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [WRITE] });
    if (report.locked && user.grant(RELEASE) !== 'brigade') throw new ForbiddenException({ code: 'incidents.reportLocked' });
    if (input.authorPersonId && !(await this.directory.summaries([input.authorPersonId])).length) {
      throw new BadRequestException({ code: 'incidents.unknownPerson' });
    }
    report.authorPersonId = input.authorPersonId;
    await em.flush();
    return this.reports.toDto(em, report);
  }

  /**
   * Sends each chosen author one e-mail with their open reports (drafts) and the open findings.
   * Authors without an e-mail address are reported back.
   */
  @Post('open-reports/remind')
  @HttpCode(200)
  @RequirePermissions(RELEASE)
  async remind(@Body(new ZodPipe(RemindAuthors)) input: ReturnType<typeof RemindAuthors.parse>, @CurrentUser() user: AuthenticatedUser): Promise<RemindResult> {
    const em = this.em.fork();
    const reports = await em.find(ReportEntity, { status: 'draft', authorPersonId: { $in: input.personIds } }, { populate: REPORT_POPULATE, orderBy: { alarmedAt: 'asc' } });
    const visible = reports.filter((r) => user.can(READ, r.departmentId) || user.grant(RELEASE) === 'brigade');
    const authors = await this.directory.summaries(input.personIds);
    const departments = new Map((await this.organization.departments()).map((d) => [d.id, d.name]));
    const sent: string[] = [];
    const missingEmail: string[] = [];
    for (const author of authors) {
      const own = visible.filter((r) => r.authorPersonId === author.id);
      if (!own.length) continue;
      const name = `${author.firstName} ${author.lastName}`;
      if (!author.email) {
        missingEmail.push(name);
        continue;
      }
      const lines = await Promise.all(
        own.map(async (r) => {
          const findings = (await this.reports.findings(em, r, await this.reports.contextFor(r))).filter((f) => f.level === 'error' || !f.acknowledged);
          const date = r.incident.alarmedAt.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
          return `- ${date} ${r.incident.alarmKeyword} ${r.incident.dispatchNumber} (${departments.get(r.departmentId) ?? ''}): ${findings.length ? `${findings.length} offene Punkte` : 'bereit zum Fertigmelden'}`;
        }),
      );
      await this.mail.send({
        to: author.email,
        subject: `Offene Einsatzberichte (${own.length})`,
        text: [`Hallo ${author.firstName},`, '', 'folgende Einsatzberichte sind noch offen:', '', ...lines, '', input.message, '', `Viele Grüße`, user.displayName].filter((l, i, all) => l !== '' || all[i - 1] !== '').join('\n'),
      });
      sent.push(name);
    }
    await this.audit.log('incidents.authors-reminded', { sent, missingEmail });
    return { sent, missingEmail };
  }

  @Post('reports/:id/primary')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  async makePrimary(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Report> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    this.reports.assertWrite(user, report);
    await this.reports.setPrimary(em, report);
    await em.flush();
    return this.reports.toDto(em, report);
  }

  @Post('reports/:id/submit')
  @HttpCode(200)
  @RequirePermissions(WRITE)
  async submit(
    @Param('id') id: string,
    @Body(new ZodPipe(Submit)) input: ReturnType<typeof Submit.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Report> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    this.reports.assertWrite(user, report);
    await this.reports.submit(em, report, user, input.acknowledgements);
    await em.flush();
    return this.reports.toDto(em, report);
  }

  @Post('reports/:id/return')
  @HttpCode(200)
  @RequirePermissions(RELEASE)
  async returnToAuthor(
    @Param('id') id: string,
    @Body(new ZodPipe(ReturnToAuthor)) input: ReturnToAuthor,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Report> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    this.reports.returnToAuthor(report, input.comment);
    await em.flush();
    await this.tellAuthor(report, input.comment, user);
    return this.reports.toDto(em, report);
  }

  /** E-mail to the author of a returned report; the return itself never fails because of it. */
  private async tellAuthor(report: ReportEntity, comment: string, user: AuthenticatedUser): Promise<void> {
    if (!report.authorPersonId) return;
    try {
      const [author] = await this.directory.summaries([report.authorPersonId]);
      if (!author?.email) return;
      const date = report.incident.alarmedAt.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
      const link = await this.notifications.link(`/incidents/reports/${report.id}`);
      await this.mail.send({
        to: author.email,
        subject: `Einsatzbericht zurückgegeben: ${date} ${report.incident.alarmKeyword}`,
        text: [`Hallo ${author.firstName},`, '', `${user.displayName} hat Ihren Einsatzbericht vom ${date} (${report.incident.alarmKeyword} ${report.incident.dispatchNumber}) zur Überarbeitung zurückgegeben:`, '', comment, ...(link ? ['', link] : [])].join('\n'),
      });
      await this.audit.log('incidents.author-notified', { reportId: report.id });
    } catch (error) {
      this.logger.warn(`Notifying the author of report ${report.id} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** Publishes the release of all released reports of a period again (for modules installed later). */
  @Post('reports/republish')
  @HttpCode(200)
  @RequirePermissions(RELEASE)
  async republish(@Body(new ZodPipe(Period)) input: z.infer<typeof Period>, @CurrentUser() user: AuthenticatedUser): Promise<{ reports: number; duties: number }> {
    if (user.grant(RELEASE) !== 'brigade') throw new ForbiddenException({ code: 'auth.forbidden', permissions: [RELEASE] });
    return { reports: await this.reports.republish(this.em.fork(), input.from, input.to), duties: await this.dutyEvents.republish(input.from, input.to) };
  }

  @Post('reports/:id/release')
  @HttpCode(200)
  @RequirePermissions(RELEASE)
  async release(
    @Param('id') id: string,
    @Body(new ZodPipe(Release)) input: Release,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Report> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    await this.reports.release(em, report, user, input.level);
    return this.reports.toDto(em, report);
  }

  @Post('reports/:id/unlock')
  @HttpCode(200)
  @RequirePermissions(UNLOCK)
  async unlock(
    @Param('id') id: string,
    @Body(new ZodPipe(Unlock)) input: ReturnType<typeof Unlock.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Report> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    await this.reports.unlock(em, report, input.reason, input.toStatus);
    return this.reports.toDto(em, report);
  }

  /** Only drafts can be deleted; a primary report only as the last report of the incident. */
  @Delete('reports/:id')
  @HttpCode(204)
  @RequirePermissions(WRITE)
  async deleteReport(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    this.reports.assertWrite(user, report);
    if (report.status !== 'draft') throw new ConflictException({ code: 'incidents.invalidTransition', from: report.status });
    if (report.primary && (await em.count(ReportEntity, { incident: report.incident, id: { $ne: report.id } }))) {
      throw new ConflictException({ code: 'incidents.primaryHasSiblings' });
    }
    await em.remove(report).flush();
  }

  // ----- Helpers -----

  private visible(user: AuthenticatedUser, incident: IncidentEntity): boolean {
    if (user.grant(READ) === 'brigade' || user.grant(RELEASE) === 'brigade') return true;
    return incident.reports.getItems().some((r) => user.can(READ, r.departmentId));
  }

  private save(em: EntityManager, report: ReportEntity, input: ReturnType<typeof ReportInput.parse>, user: AuthenticatedUser) {
    return this.reports.save(em, report, input, user);
  }
}
