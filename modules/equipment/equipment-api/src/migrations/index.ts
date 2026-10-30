import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030010505_initial } from './Migration20261030010505_initial.js';

// Maintained by `npm run migration:create`.
export const EQUIPMENT_MIGRATIONS: MigrationObject[] = [
  { name: 'equipment/Migration20261030010505_initial', class: Migration20261030010505_initial },
];
