import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025132549_report_costs_moved } from './Migration20261025132549_report_costs_moved.js';
import { Migration20261025132529_copy_report_costs } from './Migration20261025132529_copy_report_costs.js';
import { Migration20261025132522_incident_costs } from './Migration20261025132522_incident_costs.js';
import { Migration20261024174751_breathing_device } from './Migration20261024174751_breathing_device.js';
import { Migration20261024165806_chemical_suit } from './Migration20261024165806_chemical_suit.js';
import { Migration20261023092912_report_revisions } from './Migration20261023092912_report_revisions.js';
import { Migration20261023090244_statistics_duty_roster } from './Migration20261023090244_statistics_duty_roster.js';
import { Migration20261023085535_externally_managed } from './Migration20261023085535_externally_managed.js';
import { Migration20261023084839_initial } from './Migration20261023084839_initial.js';

// Maintained by `npm run migration:create`.
export const INCIDENTS_MIGRATIONS: MigrationObject[] = [
  { name: 'incidents/Migration20261023084839_initial', class: Migration20261023084839_initial },
  { name: 'incidents/Migration20261023085535_externally_managed', class: Migration20261023085535_externally_managed },
  { name: 'incidents/Migration20261023090244_statistics_duty_roster', class: Migration20261023090244_statistics_duty_roster },
  { name: 'incidents/Migration20261023092912_report_revisions', class: Migration20261023092912_report_revisions },
  { name: 'incidents/Migration20261024165806_chemical_suit', class: Migration20261024165806_chemical_suit },
  { name: 'incidents/Migration20261024174751_breathing_device', class: Migration20261024174751_breathing_device },
  { name: 'incidents/Migration20261025132522_incident_costs', class: Migration20261025132522_incident_costs },
  { name: 'incidents/Migration20261025132529_copy_report_costs', class: Migration20261025132529_copy_report_costs },
  { name: 'incidents/Migration20261025132549_report_costs_moved', class: Migration20261025132549_report_costs_moved },
];
