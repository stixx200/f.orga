import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030081342_initial } from './Migration20261030081342_initial.js';

// Maintained by `pnpm run migration:create`.
export const MP_FEUER_MIGRATIONS: MigrationObject[] = [
  { name: 'mp-feuer/Migration20261030081342_initial', class: Migration20261030081342_initial },
];
