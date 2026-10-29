import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029050522_initial } from './Migration20261029050522_initial.js';

// Maintained by `npm run migration:create`.
export const BACKUP_MIGRATIONS: MigrationObject[] = [
  { name: 'backup/Migration20261029050522_initial', class: Migration20261029050522_initial },
];
