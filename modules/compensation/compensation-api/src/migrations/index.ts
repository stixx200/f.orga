import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261123192908_initial } from './Migration20261123192908_initial.js';

// Maintained by `pnpm run migration:create`.
export const COMPENSATION_MIGRATIONS: MigrationObject[] = [
  { name: 'compensation/Migration20261123192908_initial', class: Migration20261123192908_initial },
];
