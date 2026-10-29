import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029180725_initial } from './Migration20261029180725_initial.js';

// Maintained by `npm run migration:create`.
export const BACKUP_MIGRATIONS: MigrationObject[] = [
  { name: 'backup/Migration20261029180725_initial', class: Migration20261029180725_initial },
];
