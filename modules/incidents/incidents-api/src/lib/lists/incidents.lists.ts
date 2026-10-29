import { Inject, Injectable } from '@nestjs/common';
import { berlinDayStart, berlinDayAfter } from '@forga/core-api';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { z } from 'zod';
import type { Language, ListColumn } from '@forga/core-contracts';
import type { AuthenticatedUser, ListDefinition } from '@forga/core-api';
import type { ReportStatus } from '@forga/incidents-contracts';
import { ORGANIZATION, type Organization, PERSON_DIRECTORY, type PersonDirectory } from '@forga/masterdata-contracts';
import { ReportEntity } from '../incidents.entities.js';
import { ReportsService, READ } from '../reports/reports.service.js';
import { ownerName } from '../units/units.registry.js';
import { AssignmentLines } from './assignments.js';

const col = (key: string, de: string, en: string, width?: number, align?: ListColumn['align']): ListColumn => ({
  key,
  label: { de, en },
  ...(width ? { width } : {}),
  ...(align ? { align } : {}),
});

const STATUS: Record<ReportStatus, { de: string; en: string }> = {
  draft: { de: 'Entwurf', en: 'Draft' },
  review: { de: 'Zur Prüfung', en: 'For review' },
  'released-compensation': { de: 'Freigegeben (Entschädigung)', en: 'Released (compensation)' },
  'released-billing': { de: 'Freigegeben (Abrechnung)', en: 'Released (billing)' },
};

const thisYear = () => new Date().getFullYear();
const Period = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), departmentId: z.uuid().optional() });
type Period = z.infer<typeof Period>;
const period = (p: Period) => ({ from: p.from ?? `${thisYear()}-01-01`, to: p.to ?? `${thisYear()}-12-31` });

const periodParameters = [
  { key: 'from', label: { de: 'Von', en: 'From' }, type: 'date' as const },
  { key: 'to', label: { de: 'Bis', en: 'To' }, type: 'date' as const },
  { key: 'departmentId', label: { de: 'Abteilung', en: 'Department' }, type: 'department' as const },
];

function dateTime(iso: string, language: Language): string {
  return new Date(iso).toLocaleString(language === 'de' ? 'de-DE' : 'en-GB', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Berlin' });
}

/** List templates of the incidents module. */
@Injectable()
export class IncidentsLists {
  constructor(
    private readonly em: EntityManager,
    private readonly reports: ReportsService,
    private readonly lines: AssignmentLines,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
  ) {}

  definitions(): ListDefinition<never>[] {
    return [this.openReports(), this.incidents(), this.perDepartment(), this.hoursPerPerson()] as ListDefinition<never>[];
  }

  private readableReports(user: AuthenticatedUser): FilterQuery<ReportEntity> {
    return this.reports.readableFilter(user) ?? { id: null };
  }

  /** Replaces the former check app: open reports with their findings, sorted by author. */
  private openReports(): ListDefinition<{ departmentId?: string }> {
    return {
      id: 'incidents.open-reports',
      name: { de: 'Offene Einsatzberichte', en: 'Open incident reports' },
      permission: READ,
      personalData: 'names',
      parameters: [periodParameters[2]],
      schema: z.object({ departmentId: z.uuid().optional() }),
      columns: [
        col('author', 'Verfasser', 'Author', 1.5),
        col('department', 'Abteilung', 'Department', 1.3),
        col('dispatchNumber', 'Leitstellen-Nr.', 'Dispatch no.', 1.2),
        col('alarmedAt', 'Alarmierung', 'Alarm'),
        col('keyword', 'Stichwort', 'Keyword'),
        col('status', 'Status', 'Status'),
        col('errors', 'Fehler', 'Errors', 0.6, 'right'),
        col('warnings', 'Warnungen', 'Warnings', 0.7, 'right'),
      ],
      orientation: 'landscape',
      rows: async (user, params, language) => {
        const em = this.em.fork();
        const reports = await em.find(
          ReportEntity,
          { $and: [this.readableReports(user), { status: { $in: ['draft', 'review'] } }, params.departmentId ? { departmentId: params.departmentId } : {}] },
          { populate: ['incident', 'personnel', 'vehicles', 'involvedParties', 'otherAgencies'], orderBy: { alarmedAt: 'asc' } },
        );
        const rows = [];
        const authors = new Set<string>();
        // Authors whose processing is restricted (Art. 18) are not named.
        const restricted = await this.directory.restrictedIds(reports.flatMap((r) => (r.authorPersonId ? [r.authorPersonId] : [])));
        for (const report of reports) {
          const context = await this.reports.contextFor(report);
          const findings = await this.reports.findings(em, report, context);
          const author = report.authorPersonId && !restricted.has(report.authorPersonId) ? context.persons.get(report.authorPersonId) : undefined;
          if (author && report.authorPersonId) authors.add(report.authorPersonId);
          rows.push({
            author: author ? `${author.lastName}, ${author.firstName}` : '–',
            department: ownerName(report, new Map([...context.departments.values()].map((d) => [d.id, d.name])), this.reports.units, language),
            dispatchNumber: report.incident.dispatchNumber,
            alarmedAt: dateTime(report.alarmedAt.toISOString(), language),
            keyword: report.incident.alarmKeyword,
            status: STATUS[report.status as ReportStatus][language],
            errors: findings.filter((f) => f.level === 'error').length,
            warnings: findings.filter((f) => f.level === 'warning' && !f.acknowledged).length,
          });
        }
        return { personIds: [...authors], rows: rows.toSorted((a, b) => a.author.localeCompare(b.author)) };
      },
    };
  }

  private incidents(): ListDefinition<Period> {
    return {
      id: 'incidents.incidents',
      name: { de: 'Einsätze', en: 'Incidents' },
      permission: READ,
      parameters: periodParameters,
      schema: Period,
      columns: [
        col('alarmedAt', 'Alarmierung', 'Alarm'),
        col('dispatchNumber', 'Leitstellen-Nr.', 'Dispatch no.'),
        col('keyword', 'Stichwort', 'Keyword'),
        col('location', 'Einsatzort', 'Location', 2),
        col('department', 'Abteilung', 'Department', 1.3),
        col('primary', 'Hauptbericht', 'Primary', 0.8, 'center'),
        col('status', 'Status', 'Status', 1.3),
      ],
      orientation: 'landscape',
      rows: async (user, params, language) => {
        const { from, to } = period(params);
        const reports = await this.em.fork().find(
          ReportEntity,
          {
            $and: [
              this.readableReports(user),
              { alarmedAt: { $gte: berlinDayStart(from), $lt: berlinDayAfter(to) } },
              params.departmentId ? { departmentId: params.departmentId } : {},
            ],
          },
          { populate: ['incident'], orderBy: { alarmedAt: 'asc' } },
        );
        const departments = new Map((await this.organization.departments()).map((d) => [d.id, d.name]));
        return {
          subtitle: `${from} – ${to}`,
          rows: reports.map((r) => ({
            alarmedAt: dateTime(r.alarmedAt.toISOString(), language),
            dispatchNumber: r.incident.dispatchNumber,
            keyword: r.incident.alarmKeyword,
            location: [r.incident.location.street, r.incident.location.houseNumber, r.incident.location.city].filter(Boolean).join(' '),
            department: ownerName(r, departments, this.reports.units, language),
            primary: r.primary,
            status: STATUS[r.status as ReportStatus][language],
          })),
        };
      },
    };
  }

  private perDepartment(): ListDefinition<Period> {
    return {
      id: 'incidents.per-department',
      name: { de: 'Einsätze je Abteilung', en: 'Incidents per department' },
      permission: READ,
      parameters: periodParameters.slice(0, 2),
      schema: Period,
      columns: [
        col('department', 'Abteilung', 'Department', 2),
        col('reports', 'Berichte', 'Reports', 1, 'right'),
        col('primary', 'davon Hauptbericht', 'thereof primary', 1, 'right'),
        col('persons', 'Einsatzkräfte', 'Assignments', 1, 'right'),
        col('hours', 'Stunden', 'Hours', 1, 'right'),
      ],
      rows: async (user, params, language) => {
        const p = period(params);
        const lines = await this.lines.load(user, p, { language });
        const reports = new Map<string, { department: string; primary: boolean }>();
        const em = this.em.fork();
        for (const report of await em.find(ReportEntity, { id: { $in: [...new Set(lines.map((l) => l.reportId))] } })) {
          reports.set(report.id, { department: lines.find((l) => l.reportId === report.id)?.reportDepartment ?? '', primary: report.primary });
        }
        const byDepartment = new Map<string, typeof lines>();
        for (const line of lines) byDepartment.set(line.reportDepartment, [...(byDepartment.get(line.reportDepartment) ?? []), line]);
        return {
          subtitle: `${p.from} – ${p.to}`,
          rows: [...byDepartment.entries()]
            .map(([department, list]) => {
              const reportIds = new Set(list.map((l) => l.reportId));
              return {
                department,
                reports: reportIds.size,
                primary: [...reportIds].filter((id) => reports.get(id)?.primary).length,
                persons: list.length,
                hours: Math.round(list.reduce((s, l) => s + (new Date(l.to).getTime() - new Date(l.from).getTime()) / 3_600_000, 0) * 10) / 10,
              };
            })
            .toSorted((a, b) => a.department.localeCompare(b.department)),
        };
      },
    };
  }

  private hoursPerPerson(): ListDefinition<Period> {
    return {
      id: 'incidents.hours-per-person',
      name: { de: 'Einsatzstunden je Person', en: 'Incident hours per person' },
      permission: READ,
      personalData: 'names',
      parameters: periodParameters,
      schema: Period,
      columns: [
        col('name', 'Name', 'Name', 2),
        col('department', 'Abteilung', 'Department', 1.5),
        col('incidents', 'Einsätze', 'Incidents', 0.8, 'right'),
        col('hours', 'Stunden', 'Hours', 0.8, 'right'),
        col('standby', 'Bereitschaft', 'Standby', 0.8, 'right'),
        col('breathing', 'Atemschutz (min)', 'Breathing apparatus (min)', 1, 'right'),
      ],
      rows: async (user, params) => {
        const p = period(params);
        const lines = (await this.lines.load(user, p, { departmentId: params.departmentId, withoutRestricted: true })).filter((l) => l.personId);
        const byPerson = new Map<string, typeof lines>();
        for (const line of lines) byPerson.set(line.personId as string, [...(byPerson.get(line.personId as string) ?? []), line]);
        return {
          subtitle: `${p.from} – ${p.to}`,
          personIds: [...byPerson.keys()],
          rows: [...byPerson.values()]
            .map((list) => ({
              name: list[0].name,
              department: list[0].personDepartment,
              incidents: new Set(list.map((l) => l.incidentId)).size,
              hours: Math.round(list.reduce((s, l) => s + (new Date(l.to).getTime() - new Date(l.from).getTime()) / 3_600_000, 0) * 10) / 10,
              standby: list.filter((l) => l.standby).length,
              breathing: list.reduce((s, l) => s + l.breathingMinutes, 0),
            }))
            .toSorted((a, b) => b.hours - a.hours || a.name.localeCompare(b.name)),
        };
      },
    };
  }
}
