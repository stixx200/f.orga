import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029150342_initial } from './Migration20261029150342_initial.js';

// Maintained by `npm run migration:create`.
export const TRAINING_MIGRATIONS: MigrationObject[] = [
  { name: 'training/Migration20261029150342_initial', class: Migration20261029150342_initial },
];
