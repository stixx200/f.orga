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
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { z } from 'zod';
import { assertVersion, Attachments, Audit, type AuthenticatedUser, berlinDayAfter, berlinDayStart, CurrentUser, MailService, Notifications, RequirePermissions, User, ZodPipe } from '@forga/core-api';
import type { Language } from '@forga/core-contracts';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import {
  AssignAuthor,
  CreateIncident,
  type Incident as IncidentDto,
  IncidentCosts,
  IncidentRetention,
  type IncidentMatch,
  IncidentUpdate,
  type PreviousCrew,
  NewReportInput,
  Release,
  ReleaseMany,
  type ReleaseManyResult,
  RemindAuthors,
  type RemindResult,
  type Report,
  type ReportRevision,
  ReportInput,
  ReportUpdate,
  ReturnToAuthor,
  StatisticsUpdate,
  Submit,
  Unlock,
} from '@forga/incidents-contracts';
import { AlarmKeywordEntity, IncidentEntity, ReportEntity, ReportPersonnelEntity, ReportRevisionEntity } from '../incidents.entities.js';
import { UnitReportsService } from '../units/unit-reports.service.js';
import { ownerName } from '../units/units.registry.js';
import { ReportPdf } from './report-pdf.js';
import { ReportWriters } from './report-writers.js';
import { COSTS, DELETE_REPORT, normalized, READ, RELEASE, REPORT_POPULATE, ReportsService, REVIEW, UNLOCK, WRITE } from './reports.service.js';

const Period = z.object({ from: z.iso.date(), to: z.iso.date() });
const MatchQuery = z.object({
  dispatchNumber: z.string().trim().optional(),
  alarmKeyword: z.string().optional(),
  alarmedAt: z.iso.datetime({ offset: true }),
  street: z.string().trim().optional(),
  city: z.string().trim().optional(),
});
const AuthorQuery = z
  .object({ departmentId: z.uuid().optional(), unit: z.string().optional() })
  .refine((q) => Boolean(q.departmentId) !== Boolean(q.unit), { message: 'Department or unit', path: ['departmentId'] });

type ParsedCreateIncident = ReturnType<typeof CreateIncident.parse>;

/** Texts of the e-mails to authors, in the language of the recipient. */
const MAIL = {
  de: {
    hello: (name: string) => `Hallo ${name},`,
    returnedSubject: (date: string, keyword: string) => `Einsatzbericht zurückgegeben: ${date} ${keyword}`,
    returnedText: (by: string, date: string, incident: string) => `${by} hat Ihren Einsatzbericht vom ${date} (${incident}) zur Überarbeitung zurückgegeben:`,
    openSubject: (count: number) => `Offene Einsatzberichte (${count})`,
    openIntro: 'folgende Einsatzberichte sind noch offen:',
    openPoints: (count: number) => (count === 1 ? '1 offener Punkt' : `${count} offene Punkte`),
    ready: 'bereit zum Fertigmelden',
    regards: 'Viele Grüße',
  },
  en: {
    hello: (name: string) => `Hello ${name},`,
    returnedSubject: (date: string, keyword: string) => `Incident report returned: ${date} ${keyword}`,
    returnedText: (by: string, date: string, incident: string) => `${by} returned your incident report of ${date} (${incident}) for revision:`,
    openSubject: (count: number) => `Open incident reports (${count})`,
    openIntro: 'the following incident reports are still open:',
    openPoints: (count: number) => (count === 1 ? '1 open point' : `${count} open points`),
    ready: 'ready to submit',
    regards: 'Kind regards',
  },
} satisfies Record<Language, unknown>;

/** Error code of a failed action, e.g. `incidents.findingsOpen`; unexpected errors give `incidents.releaseFailed`. */
function errorCode(error: unknown): string {
  const response = (error as { getResponse?: () => unknown }).getResponse?.();
  if (response && typeof response === 'object' && 'code' in response) return String((response as { code: unknown }).code);
  return (error as { getStatus?: () => number }).getStatus?.() === 404 ? 'notFound' : 'incidents.releaseFailed';
}

const canWriteFor = (user: AuthenticatedUser, departmentId: string) =>
  user.can(WRITE, departmentId) || user.grant(RELEASE) === 'brigade';

/** The report owning the incident data: the primary report, else the first department report, else any. */
export const incidentOwner = (reports: ReportEntity[]): ReportEntity | undefined =>
  reports.find((r) => r.primary) ?? reports.find((r) => r.departmentId) ?? reports[0];

@Controller('incidents')
export class IncidentsController {
  private readonly logger = new Logger(IncidentsController.name);

  constructor(
    private readonly em: EntityManager,
    private readonly reports: ReportsService,
    private readonly mail: MailService,
    private readonly notifications: Notifications,
    private readonly audit: Audit,
    private readonly attachments: Attachments,
    private readonly pdf: ReportPdf,
    private readonly writers: ReportWriters,
    private readonly unitReports: UnitReportsService,
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
    @Query('withoutStatistics') withoutStatistics?: string,
    @Query('limit') limit?: string,
  ): Promise<IncidentDto[]> {
    const readable = this.reports.readableFilter(user);
    if (!readable) return [];
    const where: FilterQuery<IncidentEntity>[] = [];
    if (Object.keys(readable).length) where.push({ reports: readable });
    if (from) where.push({ alarmedAt: { $gte: berlinDayStart(from) } });
    if (to) where.push({ alarmedAt: { $lt: berlinDayAfter(to) } });
    if (departmentId) where.push({ reports: { departmentId } });
    if (status) where.push({ reports: { status: status as Report['status'] } });
    if (mine === 'true') where.push({ reports: { authorPersonId: user.personId ?? '-' } });
    const em = this.em.fork();
    if (withoutStatistics === 'true') {
      // Only keywords that count in the statistics need them.
      const counted = (await em.find(AlarmKeywordEntity, { mainType: { $ne: null } })).map((k) => k.key);
      where.push({ statistics: null, alarmKeyword: { $in: counted } });
    }
    const cap = Math.min(500, Math.max(1, Number(limit) || 500));
    const incidents = await em.find(IncidentEntity, where.length ? { $and: where } : {}, { populate: ['reports'], orderBy: { alarmedAt: 'desc' }, limit: cap });
    return this.reports.incidentDtos(em, incidents, user);
  }

  /**
   * Creates an incident and a draft report for each given department and unit (e.g. only the EvD report). Writers
   * name at least one department or unit they write for: an incident without a report of theirs would vanish from
   * their list. Releasers may create it without reports.
   */
  @Post('incidents')
  async create(
    @Body(new ZodPipe(CreateIncident)) input: ParsedCreateIncident,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IncidentDto> {
    const releaser = user.grant(RELEASE) === 'brigade';
    // Writers of department reports, releasers, or writers of a unit's reports (e.g. the duty officer with only his report).
    const active = await this.reports.units.active();
    if (!user.can(WRITE) && !releaser && !active.some((u) => user.can(u.writePermission))) {
      throw new ForbiddenException({ code: 'auth.forbidden', permissions: [WRITE] });
    }
    for (const key of input.units) {
      const unit = active.find((u) => u.key === key);
      if (!unit) throw new BadRequestException({ code: 'incidents.unknownUnit', unit: key });
      if (!releaser && !user.can(unit.writePermission)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [unit.writePermission] });
    }
    if (!input.departmentIds.length && !input.units.length && !releaser) throw new BadRequestException({ code: 'incidents.departmentRequired' });
    for (const departmentId of input.departmentIds) {
      if (!canWriteFor(user, departmentId)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [WRITE] });
    }
    const em = this.em.fork();
    const incident = await this.reports.createIncident(em, input, 'ui');
    const own = await this.ownDepartment(user, input.departmentIds);
    for (const departmentId of input.departmentIds) {
      // The creator writes the report of his own department; the others get their authors assigned.
      await this.reports.createReport(em, incident, departmentId, departmentId === own ? user.personId : null);
    }
    await em.flush();
    // Other modules add their reports (e.g. the duty officer, always for a requested unit); the answer contains them.
    await this.reports.publishCreated(incident, { units: input.units, personId: user.personId ?? null });
    // A requested unit report the owning module did not create (e.g. its handler failed) is written by the creator.
    for (const unit of input.units) await this.unitReports.createUnitReport(incident.id, unit, { authorPersonId: user.personId ?? null, personnel: [] });
    return this.incidentDto(incident.id, user);
  }

  /**
   * Existing incidents that may be the one about to be created: the same dispatch number (ignoring case and
   * spaces), or within two hours of the alarm the same keyword or the same location (street, or the city where a
   * street is missing). Minimal data, also of incidents the user cannot read yet, so writers of another department
   * join the incident with their report (`POST incidents/:id/reports`) instead of creating a duplicate; reports the
   * user can read are named, so he opens his report instead.
   */
  @Get('incidents/matches')
  @RequirePermissions(WRITE)
  async matches(@Query(new ZodPipe(MatchQuery)) query: z.infer<typeof MatchQuery>, @CurrentUser() user: AuthenticatedUser): Promise<IncidentMatch[]> {
    const number = normalized(query.dispatchNumber);
    const releaser = user.grant(RELEASE) === 'brigade';
    return (await this.reports.matchingIncidents(this.em.fork(), query)).map((i) => ({
        id: i.id,
        dispatchNumber: i.dispatchNumber,
        alarmKeyword: i.alarmKeyword,
        alarmedAt: i.alarmedAt.toISOString(),
        city: i.location.city,
        street: [i.location.street, i.location.houseNumber].filter(Boolean).join(' '),
        departmentIds: i.reports.getItems().flatMap((r) => (r.departmentId ? [r.departmentId] : [])),
        // Only department reports: the reports of brigade-wide units are not joined or opened from here.
        ownReports: i.reports
          .getItems()
          .flatMap((r) => (r.departmentId && (releaser || user.can(READ, r.departmentId)) ? [{ reportId: r.id, departmentId: r.departmentId }] : [])),
        sameDispatchNumber: Boolean(number) && normalized(i.dispatchNumber) === number,
      }));
  }

  /**
   * Persons who may be the author of a report of the department (or the brigade-wide unit): linked to an active
   * account that may write its reports (or release reports). Others would never see the report in their tasks.
   */
  @Get('authors')
  @RequirePermissions(READ)
  async authors(@Query(new ZodPipe(AuthorQuery)) query: z.infer<typeof AuthorQuery>, @CurrentUser() user: AuthenticatedUser): Promise<string[]> {
    const owner = { departmentId: query.departmentId ?? null, unit: query.unit ?? null };
    if (!this.reports.canWrite(user, owner)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [WRITE] });
    const writers = await this.writers.index();
    const ids = [...(owner.departmentId ? writers.of(owner.departmentId) : writers.ofUnit(owner.unit as string))];
    // Persons whose processing is restricted (Art. 18) are not offered.
    const restricted = await this.directory.restrictedIds(ids);
    return ids.filter((id) => !restricted.has(id));
  }

  @Get('incidents/:id')
  @RequirePermissions(READ)
  async get(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<IncidentDto> {
    const em = this.em.fork();
    const incident = await em.findOne(IncidentEntity, id, { populate: ['reports'] });
    if (!incident || !this.visible(user, incident)) throw new NotFoundException();
    const [dto] = await this.reports.incidentDtos(em, [incident], user);
    return dto;
  }

  /**
   * Changes the incident data (number, keyword, alarm, location) with the version the client loaded. Writers change
   * them only while all reports are unlocked drafts; releasers until one is released (unlock first). Reports
   * starting with the old alarm time move along with it.
   */
  @Put('incidents/:id')
  @RequirePermissions(WRITE)
  async update(
    @Param('id') id: string,
    @Body(new ZodPipe(IncidentUpdate)) input: ReturnType<typeof IncidentUpdate.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IncidentDto> {
    const em = this.em.fork();
    const incident = await em.findOne(IncidentEntity, id, { populate: ['reports', 'reports.personnel', 'reports.vehicles'] });
    if (!incident || !this.visible(user, incident)) throw new NotFoundException();
    assertVersion(incident, input.version);
    const reports = incident.reports.getItems();
    // The incident data of MP-Feuer come again with the next import.
    for (const report of reports) await this.reports.assertNotLedExternally(report);
    if (reports.some((r) => r.status.startsWith('released'))) throw new ConflictException({ code: 'incidents.incidentReleased' });
    // The incident data belongs to the primary report: only its writers (and releasers) change them.
    const owner = incidentOwner(reports);
    if (!owner || !this.reports.canWrite(user, owner)) throw new ForbiddenException({ code: 'incidents.notPrimaryWriter' });
    if (user.grant(RELEASE) !== 'brigade') {
      if (reports.some((r) => r.locked)) throw new ForbiddenException({ code: 'incidents.reportLocked' });
      // Submitted reports are checked against these data: the reviewers change them, or return the reports first.
      if (reports.some((r) => r.status !== 'draft')) throw new ForbiddenException({ code: 'incidents.incidentSubmitted' });
    }
    await this.reports.requireKeyword(em, input.alarmKeyword);
    if (input.dispatchNumber && input.dispatchNumber !== incident.dispatchNumber) {
      if ((await this.reports.findByDispatchNumber(em, input.dispatchNumber)).some((i) => i.id !== incident.id)) {
        throw new ConflictException({ code: 'incidents.dispatchNumberTaken' });
      }
      incident.dispatchNumber = input.dispatchNumber;
      incident.internalNumber = false;
    }
    const alarmedAt = new Date(input.alarmedAt);
    this.reports.moveAlarm(incident, incident.alarmedAt, alarmedAt);
    em.assign(incident, {
      alarmKeyword: input.alarmKeyword,
      alarmMessage: input.alarmMessage,
      alarmedAt,
      location: input.location,
    });
    await em.flush();
    return this.incidentDto(incident.id, user);
  }

  /**
   * Statistics of the incident (once per incident, not per report), set or removed (`null`) with the version the
   * client loaded. Releasers change them until the year of the annual statistics is closed, also after the release
   * (no new release, no events); writers of a report of the incident while one of their reports is an unlocked draft.
   */
  @Put('incidents/:id/statistics')
  @RequirePermissions(READ)
  async statistics(
    @Param('id') id: string,
    @Body(new ZodPipe(StatisticsUpdate)) input: ReturnType<typeof StatisticsUpdate.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IncidentDto> {
    const em = this.em.fork();
    const incident = await em.findOne(IncidentEntity, id, { populate: ['reports'] });
    if (!incident || !this.visible(user, incident)) throw new NotFoundException();
    await this.reports.setStatistics(em, incident, input.statistics, input.version, user);
    await em.flush();
    await this.audit.log('incidents.statistics-changed', { incidentId: incident.id, dispatchNumber: incident.dispatchNumber, removed: !input.statistics });
    const [dto] = await this.reports.incidentDtos(em, [incident], user);
    return dto;
  }

  /**
   * „30 Jahre aufbewahren (Sonderfall)“: keeps the incident like one with special features (retention plan), e.g. a major
   * fire without injured persons. Releasers, `incidents.costs` and the writers of the primary report, also after the release.
   */
  @Put('incidents/:id/retention')
  @RequirePermissions(READ)
  async retention(
    @Param('id') id: string,
    @Body(new ZodPipe(IncidentRetention)) input: IncidentRetention,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IncidentDto> {
    const em = this.em.fork();
    const incident = await em.findOne(IncidentEntity, id, { populate: ['reports'] });
    if (!incident || !this.visible(user, incident)) throw new NotFoundException();
    if (!this.reports.mayMarkRetention(user, incident.reports.getItems())) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [RELEASE, COSTS] });
    if (incident.anonymizedAt) throw new ConflictException({ code: 'incidents.anonymized' });
    assertVersion(incident, input.version);
    if (incident.retentionSpecial !== input.retentionSpecial) {
      incident.retentionSpecial = input.retentionSpecial;
      await em.flush();
      await this.audit.log('incidents.retention-changed', { incidentId: incident.id, dispatchNumber: incident.dispatchNumber, retentionSpecial: input.retentionSpecial });
    }
    const [dto] = await this.reports.incidentDtos(em, [incident], user);
    return dto;
  }

  /** Costs and notes apply to the whole incident, not to one report; also after the reports are released. */
  @Put('incidents/:id/costs')
  @RequirePermissions(COSTS)
  async costs(
    @Param('id') id: string,
    @Body(new ZodPipe(IncidentCosts)) input: ReturnType<typeof IncidentCosts.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<IncidentDto> {
    const em = this.em.fork();
    // `incidents.costs` applies to the whole brigade, like releasing.
    const incident = await em.findOne(IncidentEntity, id, { populate: ['reports'] });
    if (!incident) throw new NotFoundException();
    assertVersion(incident, input.version);
    em.assign(incident, { chargeable: input.chargeable, chargeableReason: input.chargeable ? input.chargeableReason : '', notes: input.notes });
    await em.flush();
    const [dto] = await this.reports.incidentDtos(em, [incident], user);
    return dto;
  }

  /**
   * Adds the report of a department. Writers of that department may join any incident they know the ID of
   * (e.g. from `incidents/matches`), so a joint incident created by another department is not duplicated.
   */
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
    if (!incident) throw new NotFoundException();
    if (incident.reports.getItems().some((r) => r.departmentId === input.departmentId)) {
      throw new ConflictException({ code: 'incidents.reportExists' });
    }
    const report = await this.reports.createReport(em, incident, input.departmentId, user.personId);
    const { departmentId: _d, ...content } = input;
    if (content.times) await this.save(em, report, ReportInput.parse({ ...content, authorPersonId: content.authorPersonId ?? report.authorPersonId }), user);
    await em.flush();
    const loaded = await this.reports.load(em, report.id, user);
    return this.reports.toDtoFor(user, em, loaded);
  }

  // ----- Reports -----

  @Get('reports/:id')
  @RequirePermissions(READ)
  async getReport(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Report> {
    const em = this.em.fork();
    return this.reports.toDtoFor(user, em, await this.reports.load(em, id, user));
  }

  /** Saves the whole report content with the version the client loaded. Releasers lock the report by editing it. */
  @Put('reports/:id')
  @RequirePermissions(READ)
  async updateReport(
    @Param('id') id: string,
    @Body(new ZodPipe(ReportUpdate)) input: ReturnType<typeof ReportUpdate.parse>,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Report> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    this.reports.assertWrite(user, report);
    await this.save(em, report, input, user);
    await em.flush();
    return this.reports.toDtoFor(user, em, report);
  }

  /** The report as PDF (letterhead of the brigade) with times, personnel, vehicles, narrative, statistics and parties. */
  @Get('reports/:id/pdf')
  @RequirePermissions(READ)
  async reportPdf(@Param('id') id: string, @Query('lang') lang: string | undefined, @CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    const language: Language = lang === 'en' || lang === 'de' ? lang : user.language;
    const { fileName, pdf } = await this.pdf.render(em, report, language);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
    res.send(pdf);
  }

  /**
   * Crew of the vehicle in the latest earlier report of the same department (persons and functions, no guests),
   * so the author takes it over with one click instead of adding everybody again.
   */
  @Get('reports/:id/previous-crew')
  @RequirePermissions(READ)
  async previousCrew(@Param('id') id: string, @Query('vehicleId') vehicleId: string | undefined, @CurrentUser() user: AuthenticatedUser): Promise<PreviousCrew> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    const none: PreviousCrew = { reportId: null, dispatchNumber: null, alarmedAt: null, personnel: [] };
    if (!vehicleId) return none;
    const [latest] = await em.find(
      ReportPersonnelEntity,
      {
        vehicleId,
        personId: { $ne: null },
        report: { ...(report.departmentId ? { departmentId: report.departmentId } : { unit: report.unit }), id: { $ne: report.id }, alarmedAt: { $lt: report.alarmedAt } },
      },
      { populate: ['report.incident'], orderBy: { report: { alarmedAt: 'desc' } }, limit: 1 },
    );
    if (!latest) return none;
    const all = await em.find(ReportPersonnelEntity, { report: latest.report, vehicleId, personId: { $ne: null } });
    // Persons whose processing is restricted (Art. 18) are not suggested again.
    const restricted = await this.directory.restrictedIds(all.map((p) => p.personId as string));
    const crew = all.filter((p) => !restricted.has(p.personId as string));
    return {
      reportId: latest.report.id,
      dispatchNumber: latest.report.incident.dispatchNumber,
      alarmedAt: latest.report.alarmedAt.toISOString(),
      personnel: crew.map((p) => ({ personId: p.personId as string, function: p.function ?? null })),
    };
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
  @RequirePermissions(READ)
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
    // A restored version replaces the personnel as a whole; its entries belong to the author.
    const content = ReportInput.parse({ ...revision.content, version: undefined });
    await this.save(em, report, { ...content, personnel: content.personnel.map((p) => ({ ...p, bookedAt: null })) }, user);
    await em.flush();
    return this.reports.toDtoFor(user, em, report);
  }

  /** Assigns the author of a report without changing its content (and without locking it). */
  @Post('reports/:id/author')
  @HttpCode(200)
  @RequirePermissions(READ)
  async assignAuthor(
    @Param('id') id: string,
    @Body(new ZodPipe(AssignAuthor)) input: AssignAuthor,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Report> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    if (!this.reports.canWrite(user, report)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [WRITE] });
    if (report.status.startsWith('released')) throw new ForbiddenException({ code: 'incidents.reportReleased' });
    if (report.locked && user.grant(RELEASE) !== 'brigade') throw new ForbiddenException({ code: 'incidents.reportLocked' });
    await this.reports.assertNotLedExternally(report);
    if (input.authorPersonId && !(await this.directory.summaries([input.authorPersonId])).length) {
      throw new BadRequestException({ code: 'incidents.unknownPerson' });
    }
    report.authorPersonId = input.authorPersonId;
    await em.flush();
    return this.reports.toDtoFor(user, em, report);
  }

  /**
   * Sends each chosen author one e-mail with their open reports (drafts) and the open findings.
   * Authors without an e-mail address are reported back.
   */
  @Post('open-reports/remind')
  @HttpCode(200)
  @RequirePermissions(READ)
  async remind(@Body(new ZodPipe(RemindAuthors)) input: ReturnType<typeof RemindAuthors.parse>, @CurrentUser() user: AuthenticatedUser): Promise<RemindResult> {
    // Releasers remind for all departments, pre-reviewers (`incidents.reports.review`) for theirs, those of a unit for its reports.
    const unitReviewer = this.reports.units.all().some((u) => user.can(u.reviewPermission));
    if (user.grant(RELEASE) !== 'brigade' && !user.grant(REVIEW) && !unitReviewer) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [RELEASE] });
    const em = this.em.fork();
    const reports = await em.find(ReportEntity, { status: 'draft', authorPersonId: { $in: input.personIds } }, { populate: REPORT_POPULATE, orderBy: { alarmedAt: 'asc' } });
    const visible = reports.filter((r) => this.reports.canReview(user, r));
    // No e-mails to persons whose processing is restricted (Art. 18).
    const restricted = await this.directory.restrictedIds(input.personIds);
    const authors = (await this.directory.summaries(input.personIds)).filter((a) => !restricted.has(a.id));
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
      const language = await this.languageOf(author.id);
      const texts = MAIL[language];
      const lines = await Promise.all(
        own.map(async (r) => {
          const findings = (await this.reports.findings(em, r, await this.reports.contextFor(r))).filter((f) => f.level === 'error' || !f.acknowledged);
          const date = this.date(r.incident.alarmedAt, language);
          return `- ${date} ${r.incident.alarmKeyword} ${r.incident.dispatchNumber} (${ownerName(r, departments, this.reports.units, language)}): ${findings.length ? texts.openPoints(findings.length) : texts.ready}`;
        }),
      );
      await this.mail.send({
        to: author.email,
        subject: texts.openSubject(own.length),
        text: [texts.hello(author.firstName), '', texts.openIntro, '', ...lines, '', input.message, '', texts.regards, user.displayName].filter((l, i, all) => l !== '' || all[i - 1] !== '').join('\n'),
      });
      sent.push(name);
    }
    await this.audit.log('incidents.authors-reminded', { sent, missingEmail });
    return { sent, missingEmail };
  }

  @Post('reports/:id/primary')
  @HttpCode(200)
  @RequirePermissions(READ)
  async makePrimary(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Report> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    this.reports.assertWrite(user, report);
    await this.reports.assertNotLedExternally(report);
    await this.reports.setPrimary(em, report);
    await em.flush();
    return this.reports.toDtoFor(user, em, report);
  }

  @Post('reports/:id/submit')
  @HttpCode(200)
  @RequirePermissions(READ)
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
    return this.reports.toDtoFor(user, em, report);
  }

  /** Returns a submitted report to its author; releasers for all departments, pre-reviewers for theirs. */
  @Post('reports/:id/return')
  @HttpCode(200)
  @RequirePermissions(READ)
  async returnToAuthor(
    @Param('id') id: string,
    @Body(new ZodPipe(ReturnToAuthor)) input: ReturnToAuthor,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Report> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    if (!this.reports.canReview(user, report)) throw new ForbiddenException({ code: 'auth.forbidden', permissions: [RELEASE] });
    await this.reports.returnToAuthor(report, input.comment, user);
    await em.flush();
    await this.tellAuthor(report, input.comment, user);
    return this.reports.toDtoFor(user, em, report);
  }

  /** E-mail to the author of a returned report; the return itself never fails because of it. */
  private async tellAuthor(report: ReportEntity, comment: string, user: AuthenticatedUser): Promise<void> {
    if (!report.authorPersonId) return;
    try {
      if (await this.directory.isRestricted(report.authorPersonId)) return;
      const [author] = await this.directory.summaries([report.authorPersonId]);
      if (!author?.email) return;
      const language = await this.languageOf(author.id);
      const texts = MAIL[language];
      const date = this.date(report.incident.alarmedAt, language);
      const link = await this.notifications.link(`/incidents/reports/${report.id}`);
      await this.mail.send({
        to: author.email,
        subject: texts.returnedSubject(date, report.incident.alarmKeyword),
        text: [texts.hello(author.firstName), '', texts.returnedText(user.displayName, date, `${report.incident.alarmKeyword} ${report.incident.dispatchNumber}`), '', comment, ...(link ? ['', link] : [])].join('\n'),
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
  async republish(@Body(new ZodPipe(Period)) input: z.infer<typeof Period>, @CurrentUser() user: AuthenticatedUser): Promise<{ reports: number }> {
    if (user.grant(RELEASE) !== 'brigade') throw new ForbiddenException({ code: 'auth.forbidden', permissions: [RELEASE] });
    return { reports: await this.reports.republish(this.em.fork(), input.from, input.to) };
  }

  /**
   * Releases several reports one after another, e.g. all error-free reports for review or all reports of an
   * incident. A report that cannot be released is reported back with its error code; the others are released.
   */
  @Post('reports/release')
  @HttpCode(200)
  @RequirePermissions(RELEASE)
  async releaseMany(@Body(new ZodPipe(ReleaseMany)) input: ReleaseMany, @CurrentUser() user: AuthenticatedUser): Promise<ReleaseManyResult> {
    const result: ReleaseManyResult = { released: [], failed: [] };
    for (const reportId of new Set(input.reportIds)) {
      const em = this.em.fork();
      try {
        const report = await this.reports.load(em, reportId, user);
        await this.reports.release(em, report, user, input.level);
        result.released.push(reportId);
      } catch (error) {
        result.failed.push({ reportId, code: errorCode(error) });
      }
    }
    await this.audit.log('incidents.reports-released', { level: input.level, released: result.released.length, failed: result.failed });
    return result;
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
    return this.reports.toDtoFor(user, em, report);
  }

  /** Parallel operation with MP-Feuer: a releaser continues an imported report in f.orga; later imports leave it alone. */
  @Post('reports/:id/take-over')
  @HttpCode(200)
  @RequirePermissions(RELEASE)
  async takeOver(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<Report> {
    if (user.grant(RELEASE) !== 'brigade') throw new ForbiddenException({ code: 'auth.forbidden', permissions: [RELEASE] });
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    await this.reports.takeOver(em, report);
    return this.reports.toDtoFor(user, em, report);
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
    return this.reports.toDtoFor(user, em, report);
  }

  /**
   * Only an unlocked draft of a department can be deleted, and only with `incidents.reports.delete` (the administrator
   * role). A primary report only as the last department report of the incident. Deleting that last report deletes the
   * incident as well, with the drafts of brigade-wide units, so no incident is left that nobody finds in the list.
   * Reports of units are removed by their module (e.g. "no duty officer at this incident").
   */
  /**
   * Deletes the incident and every report, including reports of brigade-wide units (e.g. the only EvD report).
   * Every report must be an unlocked draft; a submitted, released or locked report blocks the whole deletion.
   */
  @Delete('incidents/:id')
  @HttpCode(204)
  @RequirePermissions(DELETE_REPORT)
  async deleteIncident(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const em = this.em.fork();
    const incident = await em.findOne(IncidentEntity, id, { populate: ['reports'] });
    if (!incident || !this.visible(user, incident)) throw new NotFoundException();
    const reports = incident.reports.getItems();
    for (const report of reports) {
      await this.reports.assertNotLedExternally(report);
      if (report.status.startsWith('released') || report.locked || report.status !== 'draft') {
        throw new ConflictException({ code: 'incidents.incidentNotDeletable', status: report.locked && report.status === 'draft' ? 'locked' : report.status });
      }
    }
    const deleted = reports.map((report) => ({ id: report.id, number: report.number, incident }));
    if (reports.length) await this.attachments.removeFor('incidents.report', reports.map((report) => report.id));
    for (const report of reports) em.remove(report);
    em.remove(incident);
    await em.flush();
    for (const report of deleted) {
      await this.audit.log('incidents.report-deleted', { reportId: report.id, reportNumber: report.number, dispatchNumber: incident.dispatchNumber });
      await this.reports.publishUnlocked(report, 'deleted');
    }
    await this.audit.log('incidents.incident-deleted', { incidentId: incident.id, dispatchNumber: incident.dispatchNumber });
    await this.reports.publishDeleted(incident);
  }

  @Delete('reports/:id')
  @HttpCode(204)
  @RequirePermissions(DELETE_REPORT)
  async deleteReport(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<void> {
    const em = this.em.fork();
    const report = await this.reports.load(em, id, user);
    if (report.unit) throw new ConflictException({ code: 'incidents.unitReportManaged' });
    await this.reports.assertNotLedExternally(report);
    if (report.status.startsWith('released')) throw new ForbiddenException({ code: 'incidents.reportReleased' });
    if (report.locked) throw new ForbiddenException({ code: 'incidents.reportLocked', lockedBy: report.lockedBy ?? '' });
    if (report.status !== 'draft') throw new ForbiddenException({ code: 'incidents.notDraft', status: report.status });
    const siblings = await em.find(ReportEntity, { incident: report.incident, id: { $ne: report.id } });
    const departmentSiblings = siblings.filter((s) => s.departmentId);
    if (report.primary && departmentSiblings.length) throw new ConflictException({ code: 'incidents.primaryHasSiblings' });
    const lastReport = departmentSiblings.length === 0;
    // Without department reports the reports of the units go as well, while they are unlocked drafts.
    if (lastReport && siblings.some((s) => s.status !== 'draft' || s.locked)) throw new ConflictException({ code: 'incidents.primaryHasSiblings' });
    const incident = report.incident;
    const deleted = [report, ...(lastReport ? siblings : [])].map((r) => ({ id: r.id, number: r.number, incident }));
    em.remove(report);
    if (lastReport) {
      for (const sibling of siblings) em.remove(sibling);
      em.remove(incident);
    }
    await em.flush();
    for (const d of deleted) await this.audit.log('incidents.report-deleted', { reportId: d.id, reportNumber: d.number, dispatchNumber: incident.dispatchNumber });
    if (lastReport) await this.audit.log('incidents.incident-deleted', { incidentId: incident.id, dispatchNumber: incident.dispatchNumber });
    // The drafts may have been released before (and unlocked since): receivers withdraw what is left of them.
    for (const d of deleted) await this.reports.publishUnlocked(d, 'deleted');
  }

  // ----- Helpers -----

  /** The incident as the API returns it, freshly loaded (e.g. with the reports other modules added). */
  private async incidentDto(id: string, user: AuthenticatedUser): Promise<IncidentDto> {
    const em = this.em.fork();
    const [dto] = await this.reports.incidentDtos(em, [await em.findOneOrFail(IncidentEntity, id, { populate: ['reports'] })], user);
    return dto;
  }

  /** The department of the creator among the given ones (his membership; else the first one he chose). */
  private async ownDepartment(user: AuthenticatedUser, departmentIds: string[]): Promise<string | null> {
    if (!user.personId || !departmentIds.length) return null;
    const [person] = await this.directory.summaries([user.personId]);
    return departmentIds.find((d) => person?.departmentIds.includes(d)) ?? departmentIds[0];
  }

  private visible(user: AuthenticatedUser, incident: IncidentEntity): boolean {
    if (user.grant(READ) === 'brigade' || user.grant(RELEASE) === 'brigade') return true;
    return incident.reports.getItems().some((r) => this.reports.canRead(user, r));
  }

  /** Language of the user linked to the person; German if there is none. */
  private async languageOf(personId: string): Promise<Language> {
    const user = await this.em.fork().findOne(User, { personId, active: true });
    return user?.language ?? 'de';
  }

  private date(date: Date, language: Language): string {
    return date.toLocaleDateString(language === 'de' ? 'de-DE' : 'en-GB', { timeZone: 'Europe/Berlin' });
  }

  private save(em: EntityManager, report: ReportEntity, input: ReturnType<typeof ReportInput.parse>, user: AuthenticatedUser) {
    return this.reports.save(em, report, input, user);
  }
}
