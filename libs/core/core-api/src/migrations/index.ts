import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025154236_initial } from './Migration20261025154236_initial.js';

// Maintained by `npm run migration:create`.
export const CORE_MIGRATIONS: MigrationObject[] = [
  { name: 'core/Migration20261025154236_initial', class: Migration20261025154236_initial },
];
