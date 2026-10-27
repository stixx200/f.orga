import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261027165602_initial } from './Migration20261027165602_initial.js';

// Maintained by `npm run migration:create`.
export const MASTERDATA_MIGRATIONS: MigrationObject[] = [
  { name: 'masterdata/Migration20261027165602_initial', class: Migration20261027165602_initial },
];
