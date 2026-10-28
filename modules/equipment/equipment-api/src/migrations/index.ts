import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261028185443_initial } from './Migration20261028185443_initial.js';

// Maintained by `npm run migration:create`.
export const EQUIPMENT_MIGRATIONS: MigrationObject[] = [
  { name: 'equipment/Migration20261028185443_initial', class: Migration20261028185443_initial },
];
