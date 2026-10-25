import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025134329_initial } from './Migration20261025134329_initial.js';

// Maintained by `npm run migration:create`.
export const EQUIPMENT_MIGRATIONS: MigrationObject[] = [
  { name: 'equipment/Migration20261025134329_initial', class: Migration20261025134329_initial },
];
