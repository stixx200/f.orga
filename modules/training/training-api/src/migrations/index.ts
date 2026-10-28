import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261028133009_initial } from './Migration20261028133009_initial.js';

// Maintained by `npm run migration:create`.
export const TRAINING_MIGRATIONS: MigrationObject[] = [
  { name: 'training/Migration20261028133009_initial', class: Migration20261028133009_initial },
];
