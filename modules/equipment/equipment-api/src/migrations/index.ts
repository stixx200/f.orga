import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261123192910_initial } from './Migration20261123192910_initial.js';

// Maintained by `pnpm run migration:create`.
export const EQUIPMENT_MIGRATIONS: MigrationObject[] = [
  { name: 'equipment/Migration20261123192910_initial', class: Migration20261123192910_initial },
];
