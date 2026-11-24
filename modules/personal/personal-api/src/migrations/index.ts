import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261123192930_initial } from './Migration20261123192930_initial.js';

// Maintained by `pnpm run migration:create`.
export const PERSONAL_MIGRATIONS: MigrationObject[] = [
  { name: 'personal/Migration20261123192930_initial', class: Migration20261123192930_initial },
];
