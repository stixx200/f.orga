import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import type { DeadlineInput, DeadlineProvider } from '@forga/core-api';
import { localDate } from '../domain/compensation.js';
import { ReportEntity } from '../incidents.entities.js';
import { RELEASE, WRITE } from '../reports/reports.service.js';

const DAY = 86_400_000;

/**
 * Work items of the report workflow as deadlines:
 * drafts for their author (one week after the alarm), reports for review for the releasers.
 */
@Injectable()
export class IncidentsDeadlines implements DeadlineProvider {
  readonly module = 'incidents';

  constructor(private readonly em: EntityManager) {}

  async deadlines(): Promise<DeadlineInput[]> {
    const reports = await this.em.fork().find(ReportEntity, { status: { $in: ['draft', 'review'] } }, { populate: ['incident'] });
    return reports.map((report) => {
      const subject = {
        type: 'incidents.report',
        id: report.id,
        label: `${report.incident.dispatchNumber} ${report.incident.alarmKeyword} (${report.number})`,
      };
      if (report.status === 'review') {
        return {
          id: `report-review:${report.id}`,
          kind: 'report-review',
          title: { de: 'Einsatzbericht prüfen und freigeben', en: 'Review and release incident report' },
          subject,
          dueOn: localDate(new Date(report.alarmedAt.getTime() + 14 * DAY).toISOString()),
          leadDays: 14,
          departmentIds: [],
          permission: RELEASE,
        };
      }
      return {
        id: `report-open:${report.id}`,
        kind: report.returnComment ? 'report-returned' : 'report-open',
        title: report.returnComment
          ? { de: 'Einsatzbericht überarbeiten', en: 'Revise incident report' }
          : { de: 'Einsatzbericht schreiben', en: 'Write incident report' },
        subject,
        dueOn: localDate(new Date(report.alarmedAt.getTime() + 7 * DAY).toISOString()),
        leadDays: 7,
        departmentIds: [report.departmentId],
        permission: WRITE,
        personIds: report.authorPersonId ? [report.authorPersonId] : undefined,
      };
    });
  }
}
