import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261031202844_initial } from './Migration20261031202844_initial.js';

// Maintained by `pnpm run migration:create`.
export const TRAINING_MIGRATIONS: MigrationObject[] = [
  { name: 'training/Migration20261031202844_initial', class: Migration20261031202844_initial },
];
