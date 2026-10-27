import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261027162226_initial } from './Migration20261027162226_initial.js';

// Maintained by `npm run migration:create`.
export const PROMOTIONS_MIGRATIONS: MigrationObject[] = [
  { name: 'promotions/Migration20261027162226_initial', class: Migration20261027162226_initial },
];
