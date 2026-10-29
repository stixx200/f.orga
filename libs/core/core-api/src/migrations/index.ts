import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029105324_initial } from './Migration20261029105324_initial.js';

// Maintained by `npm run migration:create`.
export const CORE_MIGRATIONS: MigrationObject[] = [
  { name: 'core/Migration20261029105324_initial', class: Migration20261029105324_initial },
];
