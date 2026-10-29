import { Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { AuditReferenceRegistry, defineModule, ExportRegistry, HistoryAccessRegistry, PersonDataRegistry, RetentionRegistry } from '@forga/core-api';
import { MP_FEUER_MANIFEST, MP_FEUER_READ, MP_FEUER_SETTINGS } from '@forga/mp-feuer-contracts';
import { MP_FEUER_MIGRATIONS } from '../migrations/index.js';
import { registerAuditReferences } from './audit/audit.references.js';
import { MpFeuerExports } from './exports/export-adapter.js';
import { MpFeuerMappingEntity, MpFeuerRunDatasetEntity, MpFeuerRunEntity } from './mp-feuer.entities.js';
import { MpFeuerMappings } from './runs/mp-feuer-mappings.js';
import { MpFeuerController, RunsController } from './runs/runs.controller.js';
import { RunPersonData } from './runs/run-person-data.js';
import { MpFeuerRuns } from './runs/runs.service.js';

@Module({ controllers: [RunsController, MpFeuerController], providers: [MpFeuerRuns, MpFeuerMappings, MpFeuerExports, RunPersonData] })
export class MpFeuerModule implements OnModuleInit {
  constructor(
    private readonly historyAccess: HistoryAccessRegistry,
    private readonly retention: RetentionRegistry,
    private readonly runs: MpFeuerRuns,
    private readonly auditReferences: AuditReferenceRegistry,
    private readonly em: EntityManager,
    private readonly exports: ExportRegistry,
    private readonly personData: RunPersonData,
    private readonly personDataRegistry: PersonDataRegistry,
  ) {}

  onModuleInit(): void {
    registerAuditReferences(this.auditReferences, this.em);
    this.historyAccess.registerPermission('mp_feuer.run', MP_FEUER_READ);
    this.historyAccess.registerPermission('mp_feuer.mapping', MP_FEUER_READ);
    // The rows read from the transfer files hold personal data; they go after the apply, at the latest after 7 days.
    // Rows and reports of the transfers hold names from MP-Feuer: full export, data access request and access report.
    this.exports.register('mp-feuer', {
      all: () => this.personData.all(),
      person: (id) => this.personData.person(id),
      describePerson: (id, ctx) => this.personData.describePerson(id, ctx),
    });
    this.personDataRegistry.register('mp-feuer', {
      anonymize: (ids, ctx) => this.personData.anonymize(ids, ctx),
      erasure: (id) => this.personData.erasure(id),
      erase: (id, _areas, ctx) => this.personData.anonymize([id], ctx),
    });
    this.retention.register('mp-feuer.rows', { run: (_settings, dryRun) => this.runs.expireRows(dryRun) });
  }
}

export const mpFeuerModule = defineModule({
  manifest: MP_FEUER_MANIFEST,
  nestModule: MpFeuerModule,
  entities: [MpFeuerRunEntity, MpFeuerRunDatasetEntity, MpFeuerMappingEntity],
  historized: [MpFeuerRunEntity, MpFeuerMappingEntity],
  migrations: MP_FEUER_MIGRATIONS,
  settings: MP_FEUER_SETTINGS,
  settingsAccess: { 'mp-feuer.remembered': { managersOnly: true } },
});
