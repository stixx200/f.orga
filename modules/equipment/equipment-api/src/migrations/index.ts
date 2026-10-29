import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029184825_initial } from './Migration20261029184825_initial.js';

// Maintained by `npm run migration:create`.
export const EQUIPMENT_MIGRATIONS: MigrationObject[] = [
  { name: 'equipment/Migration20261029184825_initial', class: Migration20261029184825_initial },
];
