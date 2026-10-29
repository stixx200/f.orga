import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029153824_initial } from './Migration20261029153824_initial.js';

// Maintained by `npm run migration:create`.
export const CLOTHING_MIGRATIONS: MigrationObject[] = [
  { name: 'clothing/Migration20261029153824_initial', class: Migration20261029153824_initial },
];
