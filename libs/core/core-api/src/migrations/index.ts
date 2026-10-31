import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030081313_initial } from './Migration20261030081313_initial.js';

// Maintained by `npm run migration:create`.
export const CORE_MIGRATIONS: MigrationObject[] = [
  { name: 'core/Migration20261030081313_initial', class: Migration20261030081313_initial },
];
