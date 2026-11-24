import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261123192921_initial } from './Migration20261123192921_initial.js';

// Maintained by `pnpm run migration:create`.
export const INFO_TERMINAL_MIGRATIONS: MigrationObject[] = [
  { name: 'info-terminal/Migration20261123192921_initial', class: Migration20261123192921_initial },
];
