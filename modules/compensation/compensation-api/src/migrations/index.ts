import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261028180439_initial } from './Migration20261028180439_initial.js';

// Maintained by `npm run migration:create`.
export const COMPENSATION_MIGRATIONS: MigrationObject[] = [
  { name: 'compensation/Migration20261028180439_initial', class: Migration20261028180439_initial },
];
