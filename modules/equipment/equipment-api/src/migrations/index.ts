import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261031202857_initial } from './Migration20261031202857_initial.js';

// Maintained by `pnpm run migration:create`.
export const EQUIPMENT_MIGRATIONS: MigrationObject[] = [
  { name: 'equipment/Migration20261031202857_initial', class: Migration20261031202857_initial },
];
