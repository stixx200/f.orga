import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261024191451_incident_rates } from './Migration20261024191451_incident_rates.js';
import { Migration20261024054153_initial } from './Migration20261024054153_initial.js';

// Maintained by `npm run migration:create`.
export const COMPENSATION_MIGRATIONS: MigrationObject[] = [
  { name: 'compensation/Migration20261024054153_initial', class: Migration20261024054153_initial },
  { name: 'compensation/Migration20261024191451_incident_rates', class: Migration20261024191451_incident_rates },
];
