import { Controller, Get, Inject, Injectable, Param, Query } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { type AuthenticatedUser, berlinDayAfter, berlinDayStart, CurrentUser, RequirePermissions } from '@forga/core-api';
import type { Compensation, PersonAssignment, ReportStatus } from '@forga/incidents-contracts';
import {
  ORGANIZATION,
  type Organization,
  PERSON_DIRECTORY,
  type PersonDirectory,
} from '@forga/masterdata-contracts';
import { computeCompensation } from '../domain/compensation.js';
import { ReportEntity } from '../incidents.entities.js';
import { ReportContextLoader } from '../reports/report-context.js';
import { assignmentTimes, READ, RELEASE } from '../reports/reports.service.js';

/** One person in one report, with everything evaluations need. */
export interface AssignmentLine {
  reportId: string;
  incidentId: string;
  dispatchNumber: string;
  alarmKeyword: string;
  reportNumber: string;
  reportDepartmentId: string;
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
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  async load(
    user: AuthenticatedUser,
    period: { from: string; to: string },
    options: { releasedOnly?: boolean; departmentId?: string } = {},
  ): Promise<AssignmentLine[]> {
    const grant = user.grant(RELEASE) === 'brigade' ? 'brigade' : user.grant(READ);
    if (!grant) return [];
    const where: FilterQuery<ReportEntity>[] = [
      { alarmedAt: { $gte: berlinDayStart(period.from), $lt: berlinDayAfter(period.to) } },
    ];
    if (grant !== 'brigade') where.push({ departmentId: { $in: grant } });
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
      report.personnel.getItems().map((p) => {
        const times = assignmentTimes(p, report);
        const person = p.personId ? personById.get(p.personId) : undefined;
        return {
          reportId: report.id,
          incidentId: report.incident.id,
          dispatchNumber: report.incident.dispatchNumber,
          alarmKeyword: report.incident.alarmKeyword,
          reportNumber: report.number,
          reportDepartmentId: report.departmentId,
          reportDepartment: departmentNames.get(report.departmentId) ?? '',
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
      .map((l) => ({
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
      }));
  }
}
