import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025134333_initial } from './Migration20261025134333_initial.js';

// Maintained by `npm run migration:create`.
export const PROMOTIONS_MIGRATIONS: MigrationObject[] = [
  { name: 'promotions/Migration20261025134333_initial', class: Migration20261025134333_initial },
];
