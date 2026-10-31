import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261031202931_initial } from './Migration20261031202931_initial.js';

// Maintained by `pnpm run migration:create`.
export const PERSONAL_MIGRATIONS: MigrationObject[] = [
  { name: 'personal/Migration20261031202931_initial', class: Migration20261031202931_initial },
];
