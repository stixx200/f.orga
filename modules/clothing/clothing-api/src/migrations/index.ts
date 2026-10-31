import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030081335_initial } from './Migration20261030081335_initial.js';

// Maintained by `pnpm run migration:create`.
export const CLOTHING_MIGRATIONS: MigrationObject[] = [
  { name: 'clothing/Migration20261030081335_initial', class: Migration20261030081335_initial },
];
