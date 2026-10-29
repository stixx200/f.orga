import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029203336_initial } from './Migration20261029203336_initial.js';

// Maintained by `npm run migration:create`.
export const COST_RECOVERY_MIGRATIONS: MigrationObject[] = [
  { name: 'cost-recovery/Migration20261029203336_initial', class: Migration20261029203336_initial },
];
