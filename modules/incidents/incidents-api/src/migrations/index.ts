import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029124441_initial } from './Migration20261029124441_initial.js';

// Maintained by `npm run migration:create`.
export const INCIDENTS_MIGRATIONS: MigrationObject[] = [
  { name: 'incidents/Migration20261029124441_initial', class: Migration20261029124441_initial },
];
