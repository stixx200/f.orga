import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030081330_initial } from './Migration20261030081330_initial.js';

// Maintained by `pnpm run migration:create`.
export const COST_RECOVERY_MIGRATIONS: MigrationObject[] = [
  { name: 'cost-recovery/Migration20261030081330_initial', class: Migration20261030081330_initial },
];
