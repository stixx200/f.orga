import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261028122017_initial } from './Migration20261028122017_initial.js';

// Maintained by `npm run migration:create`.
export const INCIDENTS_MIGRATIONS: MigrationObject[] = [
  { name: 'incidents/Migration20261028122017_initial', class: Migration20261028122017_initial },
];
