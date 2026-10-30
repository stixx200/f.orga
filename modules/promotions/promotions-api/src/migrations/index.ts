import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030010510_initial } from './Migration20261030010510_initial.js';

// Maintained by `npm run migration:create`.
export const PROMOTIONS_MIGRATIONS: MigrationObject[] = [
  { name: 'promotions/Migration20261030010510_initial', class: Migration20261030010510_initial },
];
