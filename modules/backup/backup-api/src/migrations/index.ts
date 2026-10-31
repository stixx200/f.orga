import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030081344_initial } from './Migration20261030081344_initial.js';

// Maintained by `pnpm run migration:create`.
export const BACKUP_MIGRATIONS: MigrationObject[] = [
  { name: 'backup/Migration20261030081344_initial', class: Migration20261030081344_initial },
];
