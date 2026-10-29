import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029105329_initial } from './Migration20261029105329_initial.js';

// Maintained by `npm run migration:create`.
export const INCIDENTS_MIGRATIONS: MigrationObject[] = [
  { name: 'incidents/Migration20261029105329_initial', class: Migration20261029105329_initial },
];
