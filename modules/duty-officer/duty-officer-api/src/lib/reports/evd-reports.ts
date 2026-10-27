import { Body, Controller, ForbiddenException, Get, HttpCode, Inject, Injectable, NotFoundException, type OnModuleInit, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Audit, type AuthenticatedUser, berlinDate, CurrentUser, type DeadlineInput, type DeadlineProvider, DomainEvents, ModuleStateService, RequirePermissions, ZodPipe } from '@forga/core-api';
import {
  DUTY_OFFICER_MANAGE,
  DUTY_OFFICER_READ,
  DUTY_OFFICER_UNIT,
  DUTY_OFFICER_WRITE,
  ExemptionInput,
  type IncidentDutyOfficer,
} from '@forga/duty-officer-contracts';
import {
  INCIDENT_UNITS,
  type IncidentCreatedEvent,
  INCIDENTS_EVENTS,
  INCIDENTS_UNIT_REPORTS,
  type IncidentUnitReports,
  type IncidentUnits,
} from '@forga/incidents-contracts';
import { ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import { ExpectedReportEntity, IncidentExemptionEntity } from '../duty-officer.entities.js';
import { DutyOfficerConfig, DutyRosterService } from '../roster/roster.js';

const MODULE = 'duty-officer';
/** Function (catalog key) of the duty officer in his EvD report. */
export const DUTY_OFFICER_FUNCTION = 'duty-officer';

/**
 * The EvD report of every incident: registers the unit "Einsatzleiter vom Dienst" with the incidents module, adds
 * the report to new incidents (not imported ones) with the duty officer of the roster as author, and handles
 * "Kein EvD bei diesem Einsatz" (exemption) and its revert.
 */
@Injectable()
export class EvdReports implements OnModuleInit, DeadlineProvider {
  readonly module = MODULE;

  constructor(
    private readonly em: EntityManager,
    private readonly events: DomainEvents,
    private readonly modules: ModuleStateService,
    private readonly config: DutyOfficerConfig,
    private readonly roster: DutyRosterService,
    private readonly audit: Audit,
    @Inject(INCIDENT_UNITS) private readonly units: IncidentUnits,
    @Inject(INCIDENTS_UNIT_REPORTS) private readonly reports: IncidentUnitReports,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  onModuleInit(): void {
    this.units.register({
      key: DUTY_OFFICER_UNIT,
      label: { de: 'Einsatzleiter vom Dienst', en: 'Duty officer' },
      shortLabel: { de: 'EvD', en: 'Duty officer' },
      numberPrefix: 'EvD',
      readPermission: DUTY_OFFICER_READ,
      writePermission: DUTY_OFFICER_WRITE,
      reviewPermission: DUTY_OFFICER_MANAGE,
      // The duty officer usually comes in a command vehicle or his own car.
      vehicleRequired: false,
    });
    this.events.subscribe<IncidentCreatedEvent>(INCIDENTS_EVENTS.incidentCreated, (e) => this.onIncidentCreated(e));
  }

  /** Active module with the setting "EvD-Bericht für jeden Einsatz anlegen". */
  async reportRequired(): Promise<boolean> {
    if ((await this.modules.inactiveIds()).has(MODULE)) return false;
    return (await this.config.get()).reportRequired;
  }

  /** New incidents in the UI or through the API get their EvD report; imported (historic) incidents do not. */
  async onIncidentCreated(e: IncidentCreatedEvent): Promise<void> {
    if (e.createdVia === 'import' || !(await this.reportRequired())) return;
    const em = this.em.fork();
    // Exempted ("Kein EvD bei diesem Einsatz"): only "EvD-Bericht anlegen" brings the report back.
    if (await em.count(IncidentExemptionEntity, { incidentId: e.incidentId })) return;
    await em.upsert(ExpectedReportEntity, { incidentId: e.incidentId, createdAt: new Date() });
    await this.create(e.incidentId, new Date(e.alarmedAt));
  }

  /** Creates the EvD report: the duty officer on duty at the alarm writes it and is its first person. */
  private async create(incidentId: string, alarmedAt: Date): Promise<void> {
    const [officer] = await this.roster.onDutyAt(alarmedAt);
    const functions = await this.organization.catalog('function');
    const role = functions.some((f) => f.key === DUTY_OFFICER_FUNCTION) ? DUTY_OFFICER_FUNCTION : null;
    await this.reports.createUnitReport(incidentId, DUTY_OFFICER_UNIT, {
      authorPersonId: officer ?? null,
      personnel: officer ? [{ personId: officer, function: role }] : [],
    });
  }

  async status(incidentId: string): Promise<IncidentDutyOfficer> {
    const [incident] = await this.reports.incidents([incidentId]);
    if (!incident) throw new NotFoundException();
    const em = this.em.fork();
    const [required, report, exemption, expected, onDuty] = await Promise.all([
      this.reportRequired(),
      this.reports.unitReports([incidentId], DUTY_OFFICER_UNIT).then((m) => m.get(incidentId) ?? null),
      em.findOne(IncidentExemptionEntity, { incidentId }),
      em.findOne(ExpectedReportEntity, { incidentId }),
      this.roster.onDutyAt(new Date(incident.alarmedAt)),
    ]);
    const isExpected = required && Boolean(expected) && !exemption;
    return {
      incidentId,
      reportRequired: required,
      expected: isExpected,
      report: report && { id: report.reportId, number: report.number, status: report.status, locked: report.locked, authorPersonId: report.authorPersonId },
      exemption: exemption && { reason: exemption.reason, by: exemption.by, at: exemption.at.toISOString() },
      onDuty,
      missing: isExpected && !report,
    };
  }

  /** "Kein EvD bei diesem Einsatz": deletes the draft (refused once submitted or released) and records the reason. */
  async exempt(incidentId: string, reason: string, user: AuthenticatedUser): Promise<IncidentDutyOfficer> {
    const [incident] = await this.reports.incidents([incidentId]);
    if (!incident) throw new NotFoundException();
    await this.reports.deleteUnitReport(incidentId, DUTY_OFFICER_UNIT);
    const em = this.em.fork();
    const existing = await em.findOne(IncidentExemptionEntity, { incidentId });
    if (existing) em.assign(existing, { reason, by: user.displayName, at: new Date() });
    else em.create(IncidentExemptionEntity, { incidentId, reason, by: user.displayName, at: new Date() });
    await em.flush();
    await this.audit.log('duty-officer.exempted', { incidentId, dispatchNumber: incident.dispatchNumber, reason });
    return this.status(incidentId);
  }

  /** "EvD-Bericht anlegen": lifts the exemption and creates the report (also for incidents from before the module). */
  async restore(incidentId: string): Promise<IncidentDutyOfficer> {
    const [incident] = await this.reports.incidents([incidentId]);
    if (!incident) throw new NotFoundException();
    const em = this.em.fork();
    const exemption = await em.findOne(IncidentExemptionEntity, { incidentId });
    if (exemption) em.remove(exemption);
    await em.upsert(ExpectedReportEntity, { incidentId, createdAt: new Date() });
    await em.flush();
    await this.create(incidentId, new Date(incident.alarmedAt));
    await this.audit.log('duty-officer.report-restored', { incidentId, dispatchNumber: incident.dispatchNumber });
    return this.status(incidentId);
  }

  /** A missing EvD report of an incident that expects one (e.g. its creation failed), for the managers. */
  async deadlines(): Promise<DeadlineInput[]> {
    if (!(await this.reportRequired())) return [];
    const em = this.em.fork();
    const expected = await em.find(ExpectedReportEntity, {});
    if (!expected.length) return [];
    const ids = expected.map((e) => e.incidentId);
    const [reports, exemptions] = await Promise.all([
      this.reports.unitReports(ids, DUTY_OFFICER_UNIT),
      em.find(IncidentExemptionEntity, { incidentId: { $in: ids } }),
    ]);
    const exempted = new Set(exemptions.map((e) => e.incidentId));
    const missing = ids.filter((id) => !reports.has(id) && !exempted.has(id));
    const incidents = await this.reports.incidents(missing);
    return incidents.map((incident) => ({
      id: `report-missing:${incident.incidentId}`,
      kind: 'evd-report-missing',
      title: { de: 'EvD-Bericht fehlt', en: 'Duty officer report missing' },
      subject: { type: 'incidents.incident', id: incident.incidentId, label: `${incident.dispatchNumber} ${incident.alarmKeyword}` },
      dueOn: berlinDate(new Date(incident.alarmedAt)),
      leadDays: 0,
      departmentIds: [],
      permission: DUTY_OFFICER_MANAGE,
      to: `/incidents/incidents/${incident.incidentId}`,
    }));
  }

  /** Records of the module for the data export. */
  async exportAll(): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    return {
      expectedReports: (await em.find(ExpectedReportEntity, {})).map((e) => ({ incidentId: e.incidentId, createdAt: e.createdAt.toISOString() })),
      exemptions: (await em.find(IncidentExemptionEntity, {})).map((e) => ({ incidentId: e.incidentId, reason: e.reason, by: e.by, at: e.at.toISOString() })),
    };
  }
}

/** The duty officer card of an incident. */
@Controller('duty-officer/incidents')
export class EvdIncidentsController {
  constructor(private readonly evd: EvdReports) {}

  @Get(':incidentId')
  async get(@Param('incidentId', ParseUUIDPipe) incidentId: string, @CurrentUser() user: AuthenticatedUser): Promise<IncidentDutyOfficer> {
    if (![DUTY_OFFICER_READ, DUTY_OFFICER_WRITE, DUTY_OFFICER_MANAGE].some((p) => user.can(p))) {
      throw new ForbiddenException({ code: 'auth.forbidden', permissions: [DUTY_OFFICER_READ] });
    }
    return this.evd.status(incidentId);
  }

  @Post(':incidentId/exemption')
  @HttpCode(200)
  @RequirePermissions(DUTY_OFFICER_MANAGE)
  exempt(@Param('incidentId', ParseUUIDPipe) incidentId: string, @Body(new ZodPipe(ExemptionInput)) input: ExemptionInput, @CurrentUser() user: AuthenticatedUser): Promise<IncidentDutyOfficer> {
    return this.evd.exempt(incidentId, input.reason, user);
  }

  @Post(':incidentId/report')
  @HttpCode(200)
  @RequirePermissions(DUTY_OFFICER_MANAGE)
  restore(@Param('incidentId', ParseUUIDPipe) incidentId: string): Promise<IncidentDutyOfficer> {
    return this.evd.restore(incidentId);
  }
}
