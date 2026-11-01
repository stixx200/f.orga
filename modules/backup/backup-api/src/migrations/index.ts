import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261031202925_initial } from './Migration20261031202925_initial.js';

// Maintained by `pnpm run migration:create`.
export const BACKUP_MIGRATIONS: MigrationObject[] = [
  { name: 'backup/Migration20261031202925_initial', class: Migration20261031202925_initial },
];
