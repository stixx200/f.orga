import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025154255_initial } from './Migration20261025154255_initial.js';

// Maintained by `npm run migration:create`.
export const COMPENSATION_MIGRATIONS: MigrationObject[] = [
  { name: 'compensation/Migration20261025154255_initial', class: Migration20261025154255_initial },
];
