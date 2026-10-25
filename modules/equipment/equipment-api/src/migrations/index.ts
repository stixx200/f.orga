import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025174135_initial } from './Migration20261025174135_initial.js';

// Maintained by `npm run migration:create`.
export const EQUIPMENT_MIGRATIONS: MigrationObject[] = [
  { name: 'equipment/Migration20261025174135_initial', class: Migration20261025174135_initial },
];
