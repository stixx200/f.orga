import { Controller, Get, Query } from '@nestjs/common';
import type { IncidentUnit } from '@forga/incidents-contracts';
import { IncidentUnitsRegistry } from './units.registry.js';

/** The brigade-wide units writing their own reports (e.g. the duty officer), for names and permissions in the UI. */
@Controller('incidents/units')
export class UnitsController {
  constructor(private readonly units: IncidentUnitsRegistry) {}

  /**
   * Every logged-in user: the UI names unit reports with them, also in lists of incidents. `active=true`: only the
   * units of active modules, e.g. to offer them for a new incident.
   */
  @Get()
  async list(@Query('active') active?: string): Promise<IncidentUnit[]> {
    return active === 'true' ? this.units.active() : this.units.all();
  }
}
