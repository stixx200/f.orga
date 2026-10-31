import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030081346_initial } from './Migration20261030081346_initial.js';

// Maintained by `npm run migration:create`.
export const PRIVACY_MIGRATIONS: MigrationObject[] = [
  { name: 'privacy/Migration20261030081346_initial', class: Migration20261030081346_initial },
];
