import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025154239_initial } from './Migration20261025154239_initial.js';

// Maintained by `npm run migration:create`.
export const MASTERDATA_MIGRATIONS: MigrationObject[] = [
  { name: 'masterdata/Migration20261025154239_initial', class: Migration20261025154239_initial },
];
