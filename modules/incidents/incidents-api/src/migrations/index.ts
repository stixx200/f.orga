import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025134320_initial } from './Migration20261025134320_initial.js';

// Maintained by `npm run migration:create`.
export const INCIDENTS_MIGRATIONS: MigrationObject[] = [
  { name: 'incidents/Migration20261025134320_initial', class: Migration20261025134320_initial },
];
