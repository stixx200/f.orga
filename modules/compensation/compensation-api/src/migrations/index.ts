import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030081325_initial } from './Migration20261030081325_initial.js';

// Maintained by `npm run migration:create`.
export const COMPENSATION_MIGRATIONS: MigrationObject[] = [
  { name: 'compensation/Migration20261030081325_initial', class: Migration20261030081325_initial },
];
