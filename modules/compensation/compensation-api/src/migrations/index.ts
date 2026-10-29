import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029054704_initial } from './Migration20261029054704_initial.js';

// Maintained by `npm run migration:create`.
export const COMPENSATION_MIGRATIONS: MigrationObject[] = [
  { name: 'compensation/Migration20261029054704_initial', class: Migration20261029054704_initial },
];
