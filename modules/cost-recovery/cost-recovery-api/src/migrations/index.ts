import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025052316_vokefw_2016 } from './Migration20261025052316_vokefw_2016.js';
import { Migration20261024184838_amendments } from './Migration20261024184838_amendments.js';
import { Migration20261024184441_incident_offense } from './Migration20261024184441_incident_offense.js';
import { Migration20261024080004_initial } from './Migration20261024080004_initial.js';

// Maintained by `npm run migration:create`.
export const COST_RECOVERY_MIGRATIONS: MigrationObject[] = [
  { name: 'cost-recovery/Migration20261024080004_initial', class: Migration20261024080004_initial },
  { name: 'cost-recovery/Migration20261024184441_incident_offense', class: Migration20261024184441_incident_offense },
  { name: 'cost-recovery/Migration20261024184838_amendments', class: Migration20261024184838_amendments },
  { name: 'cost-recovery/Migration20261025052316_vokefw_2016', class: Migration20261025052316_vokefw_2016 },
];
