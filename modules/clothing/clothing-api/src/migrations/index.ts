import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261027165618_initial } from './Migration20261027165618_initial.js';

// Maintained by `npm run migration:create`.
export const CLOTHING_MIGRATIONS: MigrationObject[] = [
  { name: 'clothing/Migration20261027165618_initial', class: Migration20261027165618_initial },
];
