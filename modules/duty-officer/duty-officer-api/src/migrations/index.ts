import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261123192919_initial } from './Migration20261123192919_initial.js';

// Maintained by `pnpm run migration:create`.
export const DUTY_OFFICER_MIGRATIONS: MigrationObject[] = [
  { name: 'duty-officer/Migration20261123192919_initial', class: Migration20261123192919_initial },
];
