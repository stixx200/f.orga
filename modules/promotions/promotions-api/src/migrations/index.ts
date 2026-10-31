import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261031202908_initial } from './Migration20261031202908_initial.js';

// Maintained by `pnpm run migration:create`.
export const PROMOTIONS_MIGRATIONS: MigrationObject[] = [
  { name: 'promotions/Migration20261031202908_initial', class: Migration20261031202908_initial },
];
