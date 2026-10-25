import { Inject, Injectable, Optional } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { COMPENSATION_STATUTE, type CompensationStatute } from '@forga/compensation-contracts';
import { ModuleStateService, SettingsService } from '@forga/core-api';
import type { IncidentSettings } from '@forga/incidents-contracts';
import {
  type Department,
  ORGANIZATION,
  type Organization,
  PERSON_DIRECTORY,
  type PersonDirectory,
  type PersonSnapshot,
  type Vehicle,
} from '@forga/masterdata-contracts';
import { localDate } from '../domain/compensation.js';
import { AlarmKeywordEntity } from '../incidents.entities.js';

/** Everything the report logic needs besides the report itself, loaded once per request. */
export interface ReportContext {
  settings: IncidentSettings;
  keywords: Map<string, AlarmKeywordEntity>;
  departments: Map<string, Department>;
  vehicles: Map<string, Vehicle>;
  /** Snapshots of the persons involved, as of the incident date. */
  persons: Map<string, PersonSnapshot>;
}

@Injectable()
export class ReportContextLoader {
  constructor(
    private readonly em: EntityManager,
    private readonly settings: SettingsService,
    private readonly modules: ModuleStateService,
    @Inject(ORGANIZATION) private readonly organization: Organization,
    @Inject(PERSON_DIRECTORY) private readonly directory: PersonDirectory,
    @Optional() @Inject(COMPENSATION_STATUTE) private readonly statute?: CompensationStatute,
  ) {}

  /** The settings; with the compensation module active its statute rates and rounding apply (decision E4). */
  async settingsOnly(): Promise<IncidentSettings> {
    const settings = (await this.settings.get<IncidentSettings>('incidents.general')) as IncidentSettings;
    if (!this.statute || (await this.modules.inactiveIds()).has('compensation')) return settings;
    const { rates, rounding, minimumHours } = await this.statute.incidentRates();
    return { ...settings, rates, rounding, minimumHours };
  }

  async load(personIds: readonly string[], date: string): Promise<ReportContext> {
    const [settings, keywords, departments, vehicles, persons] = await Promise.all([
      this.settingsOnly(),
      this.em.fork().find(AlarmKeywordEntity, {}),
      this.organization.departments(),
      this.organization.vehicles({ includeRetired: true }),
      this.directory.snapshots([...new Set(personIds)], localDate(date)),
    ]);
    return {
      settings,
      keywords: new Map(keywords.map((k) => [k.key, k])),
      departments: new Map(departments.map((d) => [d.id, d])),
      vehicles: new Map(vehicles.map((v) => [v.id, v])),
      persons: new Map(persons.map((p) => [p.id, p])),
    };
  }
}
