import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029084003_initial } from './Migration20261029084003_initial.js';

// Maintained by `npm run migration:create`.
export const COMPENSATION_MIGRATIONS: MigrationObject[] = [
  { name: 'compensation/Migration20261029084003_initial', class: Migration20261029084003_initial },
];
