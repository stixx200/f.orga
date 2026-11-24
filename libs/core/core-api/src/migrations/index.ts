import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261123192857_initial } from './Migration20261123192857_initial.js';

// Maintained by `pnpm run migration:create`.
export const CORE_MIGRATIONS: MigrationObject[] = [
  { name: 'core/Migration20261123192857_initial', class: Migration20261123192857_initial },
];
