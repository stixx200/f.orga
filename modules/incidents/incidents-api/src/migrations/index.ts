import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261027165604_initial } from './Migration20261027165604_initial.js';

// Maintained by `npm run migration:create`.
export const INCIDENTS_MIGRATIONS: MigrationObject[] = [
  { name: 'incidents/Migration20261027165604_initial', class: Migration20261027165604_initial },
];
