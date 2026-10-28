import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261028103729_initial } from './Migration20261028103729_initial.js';

// Maintained by `npm run migration:create`.
export const CORE_MIGRATIONS: MigrationObject[] = [
  { name: 'core/Migration20261028103729_initial', class: Migration20261028103729_initial },
];
