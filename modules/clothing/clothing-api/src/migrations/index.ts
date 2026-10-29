import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029065356_initial } from './Migration20261029065356_initial.js';

// Maintained by `npm run migration:create`.
export const CLOTHING_MIGRATIONS: MigrationObject[] = [
  { name: 'clothing/Migration20261029065356_initial', class: Migration20261029065356_initial },
];
