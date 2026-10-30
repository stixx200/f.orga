import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030010525_initial } from './Migration20261030010525_initial.js';

// Maintained by `npm run migration:create`.
export const BACKUP_MIGRATIONS: MigrationObject[] = [
  { name: 'backup/Migration20261030010525_initial', class: Migration20261030010525_initial },
];
