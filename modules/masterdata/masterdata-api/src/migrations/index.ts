import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261031202813_initial } from './Migration20261031202813_initial.js';

// Maintained by `pnpm run migration:create`.
export const MASTERDATA_MIGRATIONS: MigrationObject[] = [
  { name: 'masterdata/Migration20261031202813_initial', class: Migration20261031202813_initial },
];
