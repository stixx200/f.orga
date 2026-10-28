import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, UniqueConstraintViolationException } from '@mikro-orm/core';
import { Audit } from '@forga/core-api';
import type { IncidentInfo, IncidentUnitReports, UnitReportSummary } from '@forga/incidents-contracts';
import { IncidentEntity, ReportEntity, ReportPersonnelEntity } from '../incidents.entities.js';
import { ReportsService } from '../reports/reports.service.js';

const summary = (report: ReportEntity): UnitReportSummary => ({
  reportId: report.id,
  incidentId: report.incident.id,
  number: report.number,
  status: report.status,
  locked: report.locked,
  authorPersonId: report.authorPersonId ?? null,
});

/** Reports of brigade-wide units for the modules owning them (`INCIDENTS_UNIT_REPORTS`). */
@Injectable()
export class UnitReportsService implements IncidentUnitReports {
  constructor(
    private readonly em: EntityManager,
    private readonly reports: ReportsService,
    private readonly audit: Audit,
  ) {}

  async createUnitReport(
    incidentId: string,
    unit: string,
    options: { authorPersonId: string | null; personnel: { personId: string; function: string | null }[] },
  ): Promise<UnitReportSummary> {
    const em = this.em.fork();
    const incident = await em.findOne(IncidentEntity, incidentId, { populate: ['reports'] });
    if (!incident) throw new NotFoundException();
    const existing = incident.reports.getItems().find((r) => r.unit === unit);
    if (existing) return summary(existing);
    const report = await this.reports.createReport(em, incident, { unit }, options.authorPersonId);
    for (const entry of options.personnel) {
      // Times of the report (`null`); the vehicle is chosen by the author.
      report.personnel.add(em.create(ReportPersonnelEntity, { report, personId: entry.personId, function: entry.function, allowances: [] }));
    }
    try {
      await em.flush();
    } catch (error) {
      // Created at the same time by another request: that one counts.
      if (!(error instanceof UniqueConstraintViolationException)) throw error;
      const other = await this.em.fork().findOneOrFail(ReportEntity, { incident: incidentId, unit }, { populate: ['incident'] });
      return summary(other);
    }
    await this.audit.log('incidents.unit-report-created', { reportId: report.id, reportNumber: report.number, dispatchNumber: incident.dispatchNumber, unit });
    return summary(report);
  }

  async deleteUnitReport(incidentId: string, unit: string): Promise<void> {
    const em = this.em.fork();
    const report = await em.findOne(ReportEntity, { incident: incidentId, unit }, { populate: ['incident'] });
    if (!report) return;
    if (report.status !== 'draft' || report.locked) throw new ConflictException({ code: 'incidents.unitReportNotDraft', status: report.status });
    if (report.primary) {
      // Primary only while the incident has no department report: another unit report takes over; the only report of
      // an incident stays (the incident would be left without reports).
      const [next] = await em.find(ReportEntity, { incident: report.incident, id: { $ne: report.id } }, { orderBy: { number: 'asc' } });
      if (!next) throw new ConflictException({ code: 'incidents.unitReportOnlyReport' });
      await this.reports.setPrimary(em, next, true);
    }
    const deleted = { id: report.id, number: report.number, incident: report.incident };
    await em.remove(report).flush();
    await this.audit.log('incidents.report-deleted', { reportId: deleted.id, reportNumber: deleted.number, dispatchNumber: deleted.incident.dispatchNumber });
    // The draft may have been released before (and unlocked since): receivers withdraw what is left of it.
    await this.reports.publishUnlocked(deleted, 'deleted');
  }

  async hasUnitReport(incidentId: string, unit: string): Promise<boolean> {
    return (await this.em.fork().count(ReportEntity, { incident: incidentId, unit })) > 0;
  }

  async unitReports(incidentIds: readonly string[], unit: string): Promise<Map<string, UnitReportSummary>> {
    if (!incidentIds.length) return new Map();
    const reports = await this.em.fork().find(ReportEntity, { incident: { $in: [...incidentIds] }, unit }, { populate: ['incident'] });
    return new Map(reports.map((r) => [r.incident.id, summary(r)]));
  }

  async incidents(incidentIds: readonly string[]): Promise<IncidentInfo[]> {
    if (!incidentIds.length) return [];
    const incidents = await this.em.fork().find(IncidentEntity, { id: { $in: [...incidentIds] } });
    return incidents.map((i) => ({
      incidentId: i.id,
      dispatchNumber: i.dispatchNumber,
      alarmKeyword: i.alarmKeyword,
      alarmedAt: i.alarmedAt.toISOString(),
      createdVia: i.createdVia,
    }));
  }
}
