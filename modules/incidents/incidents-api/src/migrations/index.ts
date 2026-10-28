import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261028103733_initial } from './Migration20261028103733_initial.js';

// Maintained by `npm run migration:create`.
export const INCIDENTS_MIGRATIONS: MigrationObject[] = [
  { name: 'incidents/Migration20261028103733_initial', class: Migration20261028103733_initial },
];
