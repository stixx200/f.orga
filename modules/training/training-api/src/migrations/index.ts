import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030010458_initial } from './Migration20261030010458_initial.js';

// Maintained by `npm run migration:create`.
export const TRAINING_MIGRATIONS: MigrationObject[] = [
  { name: 'training/Migration20261030010458_initial', class: Migration20261030010458_initial },
];
