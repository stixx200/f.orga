import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { DeadlineInput, DeadlineProvider } from '@forga/core-api';
import type { ReportStatus } from '@forga/incidents-contracts';
import { localDate } from '../domain/compensation.js';
import { ReportEntity } from '../incidents.entities.js';
import { ReportContextLoader } from '../reports/report-context.js';
import { ReportWriters } from '../reports/report-writers.js';
import { RELEASE, REVIEW, WRITE } from '../reports/reports.service.js';
import { IncidentUnitsRegistry } from '../units/units.registry.js';

const DAY = 86_400_000;

/**
 * Work items of the report workflow as deadlines:
 * - drafts for their author (one week after the alarm); a draft locked by a releaser for the releasers instead,
 *   because the author can no longer write it,
 * - drafts without an author, with an author who cannot write it (no account or no permission) and overdue
 *   drafts for the writers of the department and the releasers,
 * - reports for review for the releasers and the pre-reviewers of the department,
 * - with the two-step release, reports released for compensation for the releasers (release for billing).
 */
@Injectable()
export class IncidentsDeadlines implements DeadlineProvider {
  readonly module = 'incidents';

  constructor(
    private readonly em: EntityManager,
    private readonly contexts: ReportContextLoader,
    private readonly writers: ReportWriters,
    private readonly units: IncidentUnitsRegistry,
  ) {}

  async deadlines(asOf: string): Promise<DeadlineInput[]> {
    const twoSteps = (await this.contexts.settingsOnly()).compensationRelease;
    const statuses: ReportStatus[] = twoSteps ? ['draft', 'review', 'released-compensation'] : ['draft', 'review'];
    const reports = await this.em.fork().find(ReportEntity, { status: { $in: statuses } }, { populate: ['incident'] });
    const writers = await this.writers.index();
    return reports.map((report): DeadlineInput => {
      const subject = {
        type: 'incidents.report',
        id: report.id,
        label: `${report.incident.dispatchNumber} ${report.incident.alarmKeyword} (${report.number})`,
      };
      const due = (days: number) => localDate(new Date(report.alarmedAt.getTime() + days * DAY).toISOString());
      const releasers = { departmentIds: [], permission: RELEASE };
      // Reports of brigade-wide units: their writers and pre-reviewers instead of those of a department.
      const unit = report.departmentId ? undefined : this.units.get(report.unit);
      const departmentIds = report.departmentId ? [report.departmentId] : [];
      const write = unit ? unit.writePermission : WRITE;
      const review = unit ? unit.reviewPermission : REVIEW;
      if (report.status === 'released-compensation') {
        return {
          id: `report-billing:${report.id}`,
          kind: 'report-billing',
          title: { de: 'Einsatzbericht zur Abrechnung freigeben', en: 'Release incident report for billing' },
          subject,
          dueOn: due(42),
          leadDays: 28,
          ...releasers,
        };
      }
      if (report.status === 'review') {
        return {
          id: `report-review:${report.id}`,
          kind: 'report-review',
          title: { de: 'Einsatzbericht prüfen und freigeben', en: 'Review and release incident report' },
          subject,
          dueOn: due(14),
          leadDays: 14,
          departmentIds,
          permission: [RELEASE, review],
        };
      }
      if (report.locked) {
        return {
          id: `report-locked:${report.id}`,
          kind: 'report-locked',
          title: { de: 'Gesperrten Entwurf fertigstellen oder entsperren', en: 'Complete or unlock locked draft' },
          subject,
          dueOn: due(7),
          leadDays: 7,
          ...releasers,
        };
      }
      // Writers of the department and releasers take over drafts nobody else would write.
      const department = unit ? { departmentIds, permission: [review, RELEASE] } : { departmentIds, permission: [WRITE, RELEASE] };
      const possible = report.departmentId ? writers.of(report.departmentId) : writers.ofUnit(report.unit ?? '');
      if (!report.authorPersonId || !possible.has(report.authorPersonId)) {
        return {
          id: `report-open:${report.id}`,
          kind: 'report-no-author',
          title: { de: 'Verfasser für Einsatzbericht zuweisen', en: 'Assign author of incident report' },
          subject,
          dueOn: due(7),
          leadDays: 7,
          ...department,
        };
      }
      if (due(7) < asOf) {
        return {
          id: `report-open:${report.id}`,
          kind: 'report-overdue',
          title: { de: 'Überfälligen Einsatzbericht fertigstellen lassen', en: 'Have overdue incident report completed' },
          subject,
          dueOn: due(7),
          leadDays: 7,
          ...department,
        };
      }
      return {
        id: `report-open:${report.id}`,
        kind: report.returnComment ? 'report-returned' : 'report-open',
        title: report.returnComment
          ? { de: 'Einsatzbericht überarbeiten', en: 'Revise incident report' }
          : { de: 'Einsatzbericht schreiben', en: 'Write incident report' },
        subject,
        dueOn: due(7),
        leadDays: 7,
        departmentIds,
        permission: write,
        personIds: [report.authorPersonId],
      };
    });
  }
}
