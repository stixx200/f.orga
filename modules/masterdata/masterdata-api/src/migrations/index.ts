import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030010454_initial } from './Migration20261030010454_initial.js';

// Maintained by `npm run migration:create`.
export const MASTERDATA_MIGRATIONS: MigrationObject[] = [
  { name: 'masterdata/Migration20261030010454_initial', class: Migration20261030010454_initial },
];
