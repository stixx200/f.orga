import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029125322_initial } from './Migration20261029125322_initial.js';

// Maintained by `npm run migration:create`.
export const EQUIPMENT_MIGRATIONS: MigrationObject[] = [
  { name: 'equipment/Migration20261029125322_initial', class: Migration20261029125322_initial },
];
