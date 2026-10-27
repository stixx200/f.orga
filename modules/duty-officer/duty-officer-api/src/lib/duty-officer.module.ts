import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager, wrap } from '@mikro-orm/core';
import { DeadlineRegistry, defineModule, ExportRegistry, HistoryAccessRegistry, ImportRegistry } from '@forga/core-api';
import { DUTY_OFFICER_MANIFEST, DUTY_OFFICER_READ, DUTY_OFFICER_ROSTER, DUTY_OFFICER_SETTINGS, DUTY_ROSTER } from '@forga/duty-officer-contracts';
import { DUTY_OFFICER_MIGRATIONS } from '../migrations/index.js';
import { DutyAssignmentEntity, ExpectedReportEntity, IncidentExemptionEntity } from './duty-officer.entities.js';
import { EvdIncidentsController, EvdReports } from './reports/evd-reports.js';
import { DutyEvents, DutyOfficerConfig, DutyRosterImport, DutyRosterService, RosterController } from './roster/roster.js';

/** Global, so other modules can inject `DUTY_ROSTER` (e.g. the compensation export of the incident reports). */
@Global()
@Module({
  controllers: [RosterController, EvdIncidentsController],
  providers: [DutyOfficerConfig, DutyEvents, DutyRosterImport, DutyRosterService, { provide: DUTY_ROSTER, useExisting: DutyRosterService }, EvdReports],
  exports: [DUTY_ROSTER],
})
export class DutyOfficerModule implements OnModuleInit {
  constructor(
    private readonly em: EntityManager,
    private readonly imports: ImportRegistry,
    private readonly rosterImport: DutyRosterImport,
    private readonly deadlines: DeadlineRegistry,
    private readonly evd: EvdReports,
    private readonly exports: ExportRegistry,
    private readonly historyAccess: HistoryAccessRegistry,
  ) {}

  onModuleInit(): void {
    this.imports.register('duty-officer', this.rosterImport.profile());
    this.deadlines.register(this.evd);
    const duties = async (where: object = {}) => (await this.em.fork().find(DutyAssignmentEntity, where)).map((d) => wrap(d).toObject());
    this.exports.register('duty-officer', {
      all: async () => ({ duties: await duties(), ...(await this.evd.exportAll()) }),
      person: async (personId) => ({ duties: await duties({ personId }) }),
    });
    this.historyAccess.registerPermission('duty_officer.duty_assignment', DUTY_OFFICER_ROSTER);
    this.historyAccess.registerPermission('duty_officer.incident_exemption', DUTY_OFFICER_READ);
  }
}

export const dutyOfficerModule = defineModule({
  manifest: DUTY_OFFICER_MANIFEST,
  nestModule: DutyOfficerModule,
  entities: [DutyAssignmentEntity, ExpectedReportEntity, IncidentExemptionEntity],
  historized: [DutyAssignmentEntity, IncidentExemptionEntity],
  migrations: DUTY_OFFICER_MIGRATIONS,
  settings: DUTY_OFFICER_SETTINGS,
});
