import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261123192902_initial } from './Migration20261123192902_initial.js';

// Maintained by `pnpm run migration:create`.
export const INCIDENTS_MIGRATIONS: MigrationObject[] = [
  { name: 'incidents/Migration20261123192902_initial', class: Migration20261123192902_initial },
];
