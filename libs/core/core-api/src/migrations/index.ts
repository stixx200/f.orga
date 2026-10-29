import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029144220_initial } from './Migration20261029144220_initial.js';

// Maintained by `npm run migration:create`.
export const CORE_MIGRATIONS: MigrationObject[] = [
  { name: 'core/Migration20261029144220_initial', class: Migration20261029144220_initial },
];
