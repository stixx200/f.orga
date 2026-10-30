import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030010512_initial } from './Migration20261030010512_initial.js';

// Maintained by `npm run migration:create`.
export const CLOTHING_MIGRATIONS: MigrationObject[] = [
  { name: 'clothing/Migration20261030010512_initial', class: Migration20261030010512_initial },
];
