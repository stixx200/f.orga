import { Controller, Get, Inject, Injectable, NotFoundException, Param, Query } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { type AuthenticatedUser, berlinDayAfter, berlinDayStart, CurrentUser, RequirePermissions } from '@forga/core-api';
import type { Language } from '@forga/core-contracts';
import type { Compensation, MyIncidents, PersonAssignment, ReportStatus } from '@forga/incidents-contracts';
import {
  ORGANIZATION,
  type Organization,
  PERSON_DIRECTORY,
  type PersonDirectory,
} from '@forga/masterdata-contracts';
import { computeCompensation } from '../domain/compensation.js';
import { ReportEntity } from '../incidents.entities.js';
import { ReportContextLoader } from '../reports/report-context.js';
import { assignmentTimes, READ, ReportsService, SELF } from '../reports/reports.service.js';
import { ownerName } from '../units/units.registry.js';

/** One person in one report, with everything evaluations need. */
export interface AssignmentLine {
  reportId: string;
  incidentId: string;
  dispatchNumber: string;
  alarmKeyword: string;
  reportNumber: string;
  /** `null` for the report of a brigade-wide unit (`reportUnit`). */
  reportDepartmentId: string | null;
  reportUnit: string | null;
  /** Name of the department of the report, or the short name of the unit (e.g. "EvD"). */
  reportDepartment: string;
  status: ReportStatus;
  personId: string | null;
  name: string;
  /** Primary department of the person (compensation is grouped by it). */
  personDepartment: string;
  from: string;
  to: string;
  standby: boolean;
  breathingMinutes: number;
  duringWorkingHours: boolean;
  compensation: Compensation;
}

const RELEASED: ReportStatus[] = ['released-compensation', 'released-billing'];

/** Loads the assignments of a period, limited to the departments the user may read. */
@Injectable()
export class AssignmentLines {
  constructor(
    private readonly em: EntityManager,
    private readonly contexts: ReportContextLoader,
    private readonly reports: ReportsService,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  /**
   * With `personId`, only the assignments of that person in all departments (for "My area"; the caller makes sure
   * it is the user's own person), otherwise those of the reports the user may read. Unit reports are named in the
   * `language` (default: the user's).
   */
  async load(
    user: AuthenticatedUser,
    period: { from: string; to: string },
    options: { releasedOnly?: boolean; departmentId?: string; personId?: string; language?: Language } = {},
  ): Promise<AssignmentLine[]> {
    const readable = options.personId ? {} : this.reports.readableFilter(user);
    if (!readable) return [];
    const where: FilterQuery<ReportEntity>[] = [
      { alarmedAt: { $gte: berlinDayStart(period.from), $lt: berlinDayAfter(period.to) } },
      readable,
    ];
    if (options.personId) where.push({ personnel: { personId: options.personId } });
    if (options.departmentId) where.push({ departmentId: options.departmentId });
    if (options.releasedOnly) where.push({ status: { $in: RELEASED } });

    const reports = await this.em
      .fork()
      .find(ReportEntity, { $and: where }, { populate: ['incident', 'personnel'], orderBy: { alarmedAt: 'asc' } });
    const personIds = reports.flatMap((r) => r.personnel.getItems().flatMap((p) => (p.personId ? [p.personId] : [])));
    const [settings, keywords, departments, persons] = await Promise.all([
      this.contexts.settingsOnly(),
      this.contexts.load([], period.from).then((c) => c.keywords),
      this.organization.departments(),
      this.directory.snapshots([...new Set(personIds)], period.to),
    ]);
    const departmentNames = new Map(departments.map((d) => [d.id, d.name]));
    const personById = new Map(persons.map((p) => [p.id, p]));

    return reports.flatMap((report) =>
      report.personnel.getItems().filter((p) => !options.personId || p.personId === options.personId).map((p) => {
        const times = assignmentTimes(p, report);
        const person = p.personId ? personById.get(p.personId) : undefined;
        return {
          reportId: report.id,
          incidentId: report.incident.id,
          dispatchNumber: report.incident.dispatchNumber,
          alarmKeyword: report.incident.alarmKeyword,
          reportNumber: report.number,
          reportDepartmentId: report.departmentId ?? null,
          reportUnit: report.unit ?? null,
          reportDepartment: ownerName(report, departmentNames, this.reports.units, options.language ?? user.language),
          status: report.status,
          personId: p.personId ?? null,
          name: person ? `${person.lastName}, ${person.firstName}` : p.guestName,
          personDepartment: departmentNames.get(person?.primaryDepartmentId ?? '') ?? '',
          ...times,
          standby: Boolean(p.standbyStationId),
          breathingMinutes: p.breathingMinutes ?? 0,
          duringWorkingHours: p.duringWorkingHours,
          compensation: computeCompensation(
            { ...times, guest: !p.personId, standby: Boolean(p.standbyStationId), duringWorkingHours: p.duringWorkingHours, allowances: p.allowances, override: p.compensationOverride ?? null },
            settings,
            keywords.get(report.incident.alarmKeyword)?.compensationKind ?? 'incident',
          ),
        };
      }),
    );
  }
}

const lineHours = (l: AssignmentLine) => (new Date(l.to).getTime() - new Date(l.from).getTime()) / 3_600_000;

const toPersonAssignment = (l: AssignmentLine): PersonAssignment => ({
  reportId: l.reportId,
  incidentId: l.incidentId,
  dispatchNumber: l.dispatchNumber,
  alarmKeyword: l.alarmKeyword,
  department: l.reportDepartment,
  status: l.status,
  from: l.from,
  to: l.to,
  standby: l.standby,
  hours: l.compensation.hours,
  amount: l.compensation.amount,
});

/** "My area": the own assignments of a year, always of the person linked to the user. */
@Controller('incidents/me')
export class MyIncidentsController {
  constructor(private readonly lines: AssignmentLines) {}

  @Get()
  @RequirePermissions(SELF)
  async get(@Query('year') year: string | undefined, @CurrentUser() user: AuthenticatedUser): Promise<MyIncidents> {
    if (!user.personId) throw new NotFoundException({ code: 'incidents.noPerson' });
    const y = Number(year) || new Date().getFullYear();
    const lines = await this.lines.load(user, { from: `${y}-01-01`, to: `${y}-12-31` }, { personId: user.personId });
    return {
      year: y,
      incidents: new Set(lines.map((l) => l.incidentId)).size,
      hours: Math.round(lines.reduce((sum, l) => sum + lineHours(l), 0) * 10) / 10,
      assignments: lines.toReversed().map(toPersonAssignment),
    };
  }
}

/** Assignments of one person in a year, e.g. for the tab "Einsätze" in the person file. */
@Controller('incidents/persons')
export class PersonAssignmentsController {
  constructor(private readonly lines: AssignmentLines) {}

  @Get(':personId/assignments')
  @RequirePermissions(READ)
  async assignments(
    @Param('personId') personId: string,
    @Query('year') year: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PersonAssignment[]> {
    const y = Number(year) || new Date().getFullYear();
    const lines = await this.lines.load(user, { from: `${y}-01-01`, to: `${y}-12-31` });
    return lines
      .filter((l) => l.personId === personId)
      .toReversed()
      .map(toPersonAssignment);
  }
}
