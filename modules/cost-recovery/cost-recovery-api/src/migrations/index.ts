import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029084008_initial } from './Migration20261029084008_initial.js';

// Maintained by `npm run migration:create`.
export const COST_RECOVERY_MIGRATIONS: MigrationObject[] = [
  { name: 'cost-recovery/Migration20261029084008_initial', class: Migration20261029084008_initial },
];
