import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025174114_initial } from './Migration20261025174114_initial.js';

// Maintained by `npm run migration:create`.
export const CORE_MIGRATIONS: MigrationObject[] = [
  { name: 'core/Migration20261025174114_initial', class: Migration20261025174114_initial },
];
