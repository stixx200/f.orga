import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030010501_initial } from './Migration20261030010501_initial.js';

// Maintained by `npm run migration:create`.
export const RESPIRATORY_PROTECTION_MIGRATIONS: MigrationObject[] = [
  { name: 'respiratory-protection/Migration20261030010501_initial', class: Migration20261030010501_initial },
];
