import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261031202902_initial } from './Migration20261031202902_initial.js';

// Maintained by `pnpm run migration:create`.
export const COST_RECOVERY_MIGRATIONS: MigrationObject[] = [
  { name: 'cost-recovery/Migration20261031202902_initial', class: Migration20261031202902_initial },
];
