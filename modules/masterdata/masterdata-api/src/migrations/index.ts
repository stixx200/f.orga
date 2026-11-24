import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261123192859_initial } from './Migration20261123192859_initial.js';

// Maintained by `pnpm run migration:create`.
export const MASTERDATA_MIGRATIONS: MigrationObject[] = [
  { name: 'masterdata/Migration20261123192859_initial', class: Migration20261123192859_initial },
];
