import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261027165606_initial } from './Migration20261027165606_initial.js';

// Maintained by `npm run migration:create`.
export const TRAINING_MIGRATIONS: MigrationObject[] = [
  { name: 'training/Migration20261027165606_initial', class: Migration20261027165606_initial },
];
