import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261123192916_initial } from './Migration20261123192916_initial.js';

// Maintained by `pnpm run migration:create`.
export const CLOTHING_MIGRATIONS: MigrationObject[] = [
  { name: 'clothing/Migration20261123192916_initial', class: Migration20261123192916_initial },
];
