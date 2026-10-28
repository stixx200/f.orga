import { Module, type OnModuleInit } from '@nestjs/common';
import { defineModule, HistoryAccessRegistry, RetentionRegistry } from '@forga/core-api';
import { MP_FEUER_MANIFEST, MP_FEUER_READ, MP_FEUER_SETTINGS } from '@forga/mp-feuer-contracts';
import { MP_FEUER_MIGRATIONS } from '../migrations/index.js';
import { MpFeuerExports } from './exports/export-adapter.js';
import { MpFeuerMappingEntity, MpFeuerRunDatasetEntity, MpFeuerRunEntity } from './mp-feuer.entities.js';
import { MpFeuerMappings } from './runs/mp-feuer-mappings.js';
import { MpFeuerController, RunsController } from './runs/runs.controller.js';
import { MpFeuerRuns } from './runs/runs.service.js';

@Module({ controllers: [RunsController, MpFeuerController], providers: [MpFeuerRuns, MpFeuerMappings, MpFeuerExports] })
export class MpFeuerModule implements OnModuleInit {
  constructor(
    private readonly historyAccess: HistoryAccessRegistry,
    private readonly retention: RetentionRegistry,
    private readonly runs: MpFeuerRuns,
  ) {}

  onModuleInit(): void {
    this.historyAccess.registerPermission('mp_feuer.run', MP_FEUER_READ);
    this.historyAccess.registerPermission('mp_feuer.mapping', MP_FEUER_READ);
    // The rows read from the transfer files hold personal data; they go after the apply, at the latest after 7 days.
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
