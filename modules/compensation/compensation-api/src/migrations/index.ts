import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261027162220_initial } from './Migration20261027162220_initial.js';

// Maintained by `npm run migration:create`.
export const COMPENSATION_MIGRATIONS: MigrationObject[] = [
  { name: 'compensation/Migration20261027162220_initial', class: Migration20261027162220_initial },
];
