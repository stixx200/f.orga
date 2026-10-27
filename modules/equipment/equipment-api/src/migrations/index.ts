import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261027162222_initial } from './Migration20261027162222_initial.js';

// Maintained by `npm run migration:create`.
export const EQUIPMENT_MIGRATIONS: MigrationObject[] = [
  { name: 'equipment/Migration20261027162222_initial', class: Migration20261027162222_initial },
];
