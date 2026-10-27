import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261027162214_initial } from './Migration20261027162214_initial.js';

// Maintained by `npm run migration:create`.
export const INCIDENTS_MIGRATIONS: MigrationObject[] = [
  { name: 'incidents/Migration20261027162214_initial', class: Migration20261027162214_initial },
];
