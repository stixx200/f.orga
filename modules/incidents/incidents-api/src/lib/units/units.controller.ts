import { Controller, Get } from '@nestjs/common';
import type { IncidentUnit } from '@forga/incidents-contracts';
import { IncidentUnitsRegistry } from './units.registry.js';

/** The brigade-wide units writing their own reports (e.g. the duty officer), for names and permissions in the UI. */
@Controller('incidents/units')
export class UnitsController {
  constructor(private readonly units: IncidentUnitsRegistry) {}

  /** Every logged-in user: the UI names unit reports with them, also in lists of incidents. */
  @Get()
  list(): IncidentUnit[] {
    return this.units.all();
  }
}
