import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261029203401_initial } from './Migration20261029203401_initial.js';

// Maintained by `npm run migration:create`.
export const PRIVACY_MIGRATIONS: MigrationObject[] = [
  { name: 'privacy/Migration20261029203401_initial', class: Migration20261029203401_initial },
];
