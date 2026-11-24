import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261123192904_initial } from './Migration20261123192904_initial.js';

// Maintained by `pnpm run migration:create`.
export const TRAINING_MIGRATIONS: MigrationObject[] = [
  { name: 'training/Migration20261123192904_initial', class: Migration20261123192904_initial },
];
