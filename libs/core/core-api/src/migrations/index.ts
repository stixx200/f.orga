import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261031202803_initial } from './Migration20261031202803_initial.js';

// Maintained by `pnpm run migration:create`.
export const CORE_MIGRATIONS: MigrationObject[] = [
  { name: 'core/Migration20261031202803_initial', class: Migration20261031202803_initial },
];
