import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029124459_initial } from './Migration20261029124459_initial.js';

// Maintained by `npm run migration:create`.
export const PROMOTIONS_MIGRATIONS: MigrationObject[] = [
  { name: 'promotions/Migration20261029124459_initial', class: Migration20261029124459_initial },
];
