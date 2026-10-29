import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029105343_initial } from './Migration20261029105343_initial.js';

// Maintained by `npm run migration:create`.
export const PROMOTIONS_MIGRATIONS: MigrationObject[] = [
  { name: 'promotions/Migration20261029105343_initial', class: Migration20261029105343_initial },
];
