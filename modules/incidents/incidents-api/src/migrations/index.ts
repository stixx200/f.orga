import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029164313_initial } from './Migration20261029164313_initial.js';

// Maintained by `npm run migration:create`.
export const INCIDENTS_MIGRATIONS: MigrationObject[] = [
  { name: 'incidents/Migration20261029164313_initial', class: Migration20261029164313_initial },
];
