import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261123192914_initial } from './Migration20261123192914_initial.js';

// Maintained by `pnpm run migration:create`.
export const PROMOTIONS_MIGRATIONS: MigrationObject[] = [
  { name: 'promotions/Migration20261123192914_initial', class: Migration20261123192914_initial },
];
