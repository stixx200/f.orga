import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025174117_initial } from './Migration20261025174117_initial.js';

// Maintained by `npm run migration:create`.
export const MASTERDATA_MIGRATIONS: MigrationObject[] = [
  { name: 'masterdata/Migration20261025174117_initial', class: Migration20261025174117_initial },
];
