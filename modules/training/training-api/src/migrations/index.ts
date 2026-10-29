import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029125315_initial } from './Migration20261029125315_initial.js';

// Maintained by `npm run migration:create`.
export const TRAINING_MIGRATIONS: MigrationObject[] = [
  { name: 'training/Migration20261029125315_initial', class: Migration20261029125315_initial },
];
