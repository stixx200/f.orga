import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261031202915_initial } from './Migration20261031202915_initial.js';

// Maintained by `pnpm run migration:create`.
export const DUTY_OFFICER_MIGRATIONS: MigrationObject[] = [
  { name: 'duty-officer/Migration20261031202915_initial', class: Migration20261031202915_initial },
];
