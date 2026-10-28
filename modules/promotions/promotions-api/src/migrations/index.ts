import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261028103745_initial } from './Migration20261028103745_initial.js';

// Maintained by `npm run migration:create`.
export const PROMOTIONS_MIGRATIONS: MigrationObject[] = [
  { name: 'promotions/Migration20261028103745_initial', class: Migration20261028103745_initial },
];
