import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261031202911_initial } from './Migration20261031202911_initial.js';

// Maintained by `pnpm run migration:create`.
export const CLOTHING_MIGRATIONS: MigrationObject[] = [
  { name: 'clothing/Migration20261031202911_initial', class: Migration20261031202911_initial },
];
