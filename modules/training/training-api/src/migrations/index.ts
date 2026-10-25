import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025174126_initial } from './Migration20261025174126_initial.js';

// Maintained by `npm run migration:create`.
export const TRAINING_MIGRATIONS: MigrationObject[] = [
  { name: 'training/Migration20261025174126_initial', class: Migration20261025174126_initial },
];
