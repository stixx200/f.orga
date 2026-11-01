import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261031202928_initial } from './Migration20261031202928_initial.js';

// Maintained by `pnpm run migration:create`.
export const PRIVACY_MIGRATIONS: MigrationObject[] = [
  { name: 'privacy/Migration20261031202928_initial', class: Migration20261031202928_initial },
];
