import { Global, Inject, Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { Attachments, DeadlineRegistry, defineModule, ExportRegistry, HistoryAccessRegistry, ImportRegistry, ListRegistry, SearchRegistry } from '@forga/core-api';
import { INCIDENTS_LOOKUP, INCIDENTS_MANIFEST, INCIDENTS_SETTINGS } from '@forga/incidents-contracts';
import { ORGANIZATION_REFERENCES, type OrganizationReferences } from '@forga/masterdata-contracts';
import { INCIDENTS_MIGRATIONS } from '../migrations/index.js';
import { ExternalController } from './api/external.controller.js';
import { IncidentsData } from './data/incidents.data.js';
import { IncidentsLookupService } from './data/incidents.lookup.js';
import { IncidentsDeadlines } from './deadlines/incidents.deadlines.js';
import { DutyController, DutyEvents, DutyRosterImport } from './duty/duty.js';
import { MpFeuerIncidentsImport } from './imports/mp-feuer.import.js';
import {
  AlarmKeywordEntity,
  DutyAssignmentEntity,
  IncidentEntity,
  InvolvedPartyEntity,
  OtherAgencyEntity,
  ReportEntity,
  ReportPersonnelEntity,
  ReportRevisionEntity,
  ReportVehicleEntity,
  StatisticsYearEntity,
} from './incidents.entities.js';
import { KeywordsController } from './keywords/keywords.controller.js';
import { AssignmentLines, MyIncidentsController, PersonAssignmentsController } from './lists/assignments.js';
import { CompensationChecker } from './lists/compensation-check.js';
import { CompensationExportController } from './lists/compensation-export.js';
import { IncidentsLists } from './lists/incidents.lists.js';
import { StatisticsController } from './statistics/statistics.controller.js';
import { IncidentsController } from './reports/incidents.controller.js';
import { ReportContextLoader } from './reports/report-context.js';
import { ReportPdf } from './reports/report-pdf.js';
import { READ, RELEASE, ReportsService } from './reports/reports.service.js';

/** Global, so other modules can inject `INCIDENTS_LOOKUP`. */
@Global()
@Module({
  controllers: [KeywordsController, IncidentsController, PersonAssignmentsController, MyIncidentsController, ExternalController, CompensationExportController, StatisticsController, DutyController],
  providers: [
    IncidentsData, ReportContextLoader, ReportsService, ReportPdf, IncidentsDeadlines, AssignmentLines, IncidentsLists, DutyRosterImport, DutyEvents, MpFeuerIncidentsImport, CompensationChecker,
    IncidentsLookupService, { provide: INCIDENTS_LOOKUP, useExisting: IncidentsLookupService },
  ],
  exports: [INCIDENTS_LOOKUP],
})
export class IncidentsModule implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly historyAccess: HistoryAccessRegistry,
    private readonly deadlineRegistry: DeadlineRegistry,
    private readonly deadlines: IncidentsDeadlines,
    private readonly lists: ListRegistry,
    private readonly incidentsLists: IncidentsLists,
    private readonly imports: ImportRegistry,
    private readonly dutyRosterImport: DutyRosterImport,
    private readonly mpFeuerImport: MpFeuerIncidentsImport,
    @Inject(ORGANIZATION_REFERENCES) private readonly references: OrganizationReferences,
    private readonly search: SearchRegistry,
    private readonly exports: ExportRegistry,
    private readonly data: IncidentsData,
    private readonly attachments: Attachments,
    private readonly reports: ReportsService,
  ) {}

  /** Reports are readable per department; incidents for everyone who can read one of their reports. */
  onModuleInit(): void {
    this.deadlineRegistry.register(this.deadlines);
    for (const definition of this.incidentsLists.definitions()) this.lists.register('incidents', definition);
    this.imports.register('incidents', this.dutyRosterImport.profile());
    this.imports.register('incidents', this.mpFeuerImport.profile());
    // Reports keep the IDs of departments, vehicles and standby stations; those must not be deleted.
    this.references.register('incidents', (kind, id) => {
      const em = this.em.fork();
      if (kind === 'department') return em.count(ReportEntity, { departmentId: id });
      if (kind === 'station') return em.count(ReportPersonnelEntity, { standbyStationId: id });
      return Promise.all([em.count(ReportVehicleEntity, { vehicleId: id }), em.count(ReportPersonnelEntity, { vehicleId: id })]).then(([a, b]) => a + b);
    });
    this.search.register('incidents', (user, query) => this.data.search(user, query));
    this.exports.register('incidents', { all: () => this.data.exportAll(), person: (id) => this.data.exportPerson(id) });
    this.historyAccess.register('incidents.report', async (user, id) => {
      const report = await this.em.fork().findOne(ReportEntity, id);
      return { allowed: Boolean(report) && (user.can(READ, report!.departmentId) || user.grant(RELEASE) === 'brigade') };
    });
    // Photos, alarm fax and sketches of a report: readable like the report, added and removed while it may be edited.
    const report = (id: string) => this.em.fork().findOne(ReportEntity, id);
    this.attachments.register('incidents.report', {
      read: async (user, id) => {
        const r = await report(id);
        return Boolean(r) && (user.can(READ, r!.departmentId) || user.grant(RELEASE) === 'brigade');
      },
      write: async (user, id) => {
        const r = await report(id);
        if (!r) return false;
        try {
          this.reports.assertWrite(user, r);
          return true;
        } catch {
          return false;
        }
      },
    });
    // An incident: readable for those who may read one of its reports.
    this.historyAccess.register('incidents.incident', async (user, id) => {
      const reports = await this.em.fork().find(ReportEntity, { incident: id });
      return { allowed: user.grant(RELEASE) === 'brigade' || reports.some((r) => user.can(READ, r.departmentId)) };
    });
    this.historyAccess.registerPermission('incidents.alarm_keyword', 'incidents.settings.manage');
    this.historyAccess.registerPermission('incidents.statistics_year', 'incidents.statistics');
    this.historyAccess.registerPermission('incidents.duty_assignment', 'incidents.duty.manage');
  }
}

export const incidentsModule = defineModule({
  manifest: INCIDENTS_MANIFEST,
  nestModule: IncidentsModule,
  entities: [
    AlarmKeywordEntity,
    IncidentEntity,
    ReportEntity,
    ReportPersonnelEntity,
    ReportVehicleEntity,
    InvolvedPartyEntity,
    OtherAgencyEntity,
    StatisticsYearEntity,
    DutyAssignmentEntity,
    ReportRevisionEntity,
  ],
  historized: [
    AlarmKeywordEntity,
    IncidentEntity,
    ReportEntity,
    { entity: ReportPersonnelEntity, parent: 'report' },
    { entity: ReportVehicleEntity, parent: 'report' },
    { entity: InvolvedPartyEntity, parent: 'report' },
    { entity: OtherAgencyEntity, parent: 'report' },
    StatisticsYearEntity,
    DutyAssignmentEntity,
  ],
  migrations: INCIDENTS_MIGRATIONS,
  settings: INCIDENTS_SETTINGS,
});
