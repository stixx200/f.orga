import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261028185432_initial } from './Migration20261028185432_initial.js';

// Maintained by `npm run migration:create`.
export const MASTERDATA_MIGRATIONS: MigrationObject[] = [
  { name: 'masterdata/Migration20261028185432_initial', class: Migration20261028185432_initial },
];
