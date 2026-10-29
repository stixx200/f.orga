import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029124444_initial } from './Migration20261029124444_initial.js';

// Maintained by `npm run migration:create`.
export const TRAINING_MIGRATIONS: MigrationObject[] = [
  { name: 'training/Migration20261029124444_initial', class: Migration20261029124444_initial },
];
