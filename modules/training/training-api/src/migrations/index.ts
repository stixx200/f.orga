import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025154249_initial } from './Migration20261025154249_initial.js';

// Maintained by `npm run migration:create`.
export const TRAINING_MIGRATIONS: MigrationObject[] = [
  { name: 'training/Migration20261025154249_initial', class: Migration20261025154249_initial },
];
