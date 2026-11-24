import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261123192925_initial } from './Migration20261123192925_initial.js';

// Maintained by `pnpm run migration:create`.
export const BACKUP_MIGRATIONS: MigrationObject[] = [
  { name: 'backup/Migration20261123192925_initial', class: Migration20261123192925_initial },
];
