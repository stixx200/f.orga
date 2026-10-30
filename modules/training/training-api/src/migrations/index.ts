import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261030081321_initial } from './Migration20261030081321_initial.js';

// Maintained by `npm run migration:create`.
export const TRAINING_MIGRATIONS: MigrationObject[] = [
  { name: 'training/Migration20261030081321_initial', class: Migration20261030081321_initial },
];
