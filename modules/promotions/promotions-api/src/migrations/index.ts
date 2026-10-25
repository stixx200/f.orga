import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025154302_initial } from './Migration20261025154302_initial.js';

// Maintained by `npm run migration:create`.
export const PROMOTIONS_MIGRATIONS: MigrationObject[] = [
  { name: 'promotions/Migration20261025154302_initial', class: Migration20261025154302_initial },
];
