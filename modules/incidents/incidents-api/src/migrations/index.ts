import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261031202827_initial } from './Migration20261031202827_initial.js';

// Maintained by `pnpm run migration:create`.
export const INCIDENTS_MIGRATIONS: MigrationObject[] = [
  { name: 'incidents/Migration20261031202827_initial', class: Migration20261031202827_initial },
];
