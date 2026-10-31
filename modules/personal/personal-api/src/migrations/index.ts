import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030151728_initial } from './Migration20261030151728_initial.js';

// Maintained by `pnpm run migration:create`.
export const PERSONAL_MIGRATIONS: MigrationObject[] = [
  { name: 'personal/Migration20261030151728_initial', class: Migration20261030151728_initial },
];
