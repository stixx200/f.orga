import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261028103747_initial } from './Migration20261028103747_initial.js';

// Maintained by `npm run migration:create`.
export const CLOTHING_MIGRATIONS: MigrationObject[] = [
  { name: 'clothing/Migration20261028103747_initial', class: Migration20261028103747_initial },
];
