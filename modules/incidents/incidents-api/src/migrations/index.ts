import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030081318_initial } from './Migration20261030081318_initial.js';

// Maintained by `pnpm run migration:create`.
export const INCIDENTS_MIGRATIONS: MigrationObject[] = [
  { name: 'incidents/Migration20261030081318_initial', class: Migration20261030081318_initial },
];
