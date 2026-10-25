import { Inject, Injectable } from '@nestjs/common';
import { berlinDayStart, berlinDayAfter } from '@forga/core-api';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import type { AuthenticatedUser } from '@forga/core-api';
import type { CompensationCheck, CompensationProblem } from '@forga/incidents-contracts';
import { ORGANIZATION, type Organization } from '@forga/masterdata-contracts';
import { computeCompensation } from '../domain/compensation.js';
import { ReportEntity } from '../incidents.entities.js';
import { assignmentTimes, READ, RELEASE, REPORT_POPULATE, ReportsService } from '../reports/reports.service.js';

/** Report rules that concern personnel and therefore the compensation. */
const PERSONNEL_RULES = new Set([
  'no-personnel',
  'vehicle-missing',
  'personnel-overlap-incident',
  'personnel-overlap-other',
  'times-invalid',
  'working-hours-and-loss-of-earnings',
]);

/**
 * Checks all reports of a period before the compensation payout: personnel problems
 * (no personnel, no amount, no or invalid time, no vehicle, overlaps) and reports not released yet,
 * which would be missing from the payout.
 */
@Injectable()
export class CompensationChecker {
  constructor(
    private readonly em: EntityManager,
    private readonly reports: ReportsService,
    @Inject(ORGANIZATION) private readonly organization: Organization,
  ) {}

  async check(user: AuthenticatedUser, from: string, to: string): Promise<CompensationCheck> {
    const em = this.em.fork();
    const grant = user.grant(RELEASE) === 'brigade' ? 'brigade' : user.grant(READ);
    const where: FilterQuery<ReportEntity>[] = [
      { alarmedAt: { $gte: berlinDayStart(from), $lt: berlinDayAfter(to) } },
    ];
    if (grant !== 'brigade') where.push({ departmentId: { $in: grant ?? [] } });
    const reports = await em.find(ReportEntity, { $and: where }, { populate: REPORT_POPULATE, orderBy: { alarmedAt: 'asc' } });
    const departments = new Map((await this.organization.departments()).map((d) => [d.id, d.name]));
    const problems: CompensationProblem[] = [];

    for (const report of reports) {
      const base = {
        reportId: report.id,
        dispatchNumber: report.incident.dispatchNumber,
        alarmedAt: report.alarmedAt.toISOString(),
        department: departments.get(report.departmentId) ?? '',
        reportNumber: report.number,
        status: report.status,
      };
      if (!report.status.startsWith('released')) problems.push({ ...base, code: 'not-released', person: null });

      const context = await this.reports.contextFor(report);
      for (const finding of await this.reports.findings(em, report, context)) {
        if (!PERSONNEL_RULES.has(finding.rule)) continue;
        problems.push({ ...base, code: finding.rule, person: finding.params['person'] ? String(finding.params['person']) : null });
      }

      // Members who get nothing although they should (no rate for the date, zero duration, ...).
      const kind = context.keywords.get(report.incident.alarmKeyword)?.compensationKind ?? 'incident';
      for (const p of report.personnel.getItems()) {
        if (!p.personId || p.duringWorkingHours) continue;
        const times = assignmentTimes(p, report);
        const compensation = computeCompensation(
          { ...times, guest: false, standby: Boolean(p.standbyStationId), duringWorkingHours: false, allowances: p.allowances, override: p.compensationOverride ?? null },
          context.settings,
          kind,
        );
        if (compensation.amount === 0 && !compensation.overridden) {
          const person = context.persons.get(p.personId);
          problems.push({ ...base, code: 'zero-amount', person: person ? `${person.lastName}, ${person.firstName}` : p.personId });
        }
      }
    }
    return {
      from,
      to,
      reportsChecked: reports.length,
      reportsReleased: reports.filter((r) => r.status.startsWith('released')).length,
      problems,
    };
  }
}
