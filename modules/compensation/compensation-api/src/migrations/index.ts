import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261031202854_initial } from './Migration20261031202854_initial.js';

// Maintained by `pnpm run migration:create`.
export const COMPENSATION_MIGRATIONS: MigrationObject[] = [
  { name: 'compensation/Migration20261031202854_initial', class: Migration20261031202854_initial },
];
