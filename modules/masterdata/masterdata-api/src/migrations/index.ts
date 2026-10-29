import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029123713_initial } from './Migration20261029123713_initial.js';

// Maintained by `npm run migration:create`.
export const MASTERDATA_MIGRATIONS: MigrationObject[] = [
  { name: 'masterdata/Migration20261029123713_initial', class: Migration20261029123713_initial },
];
