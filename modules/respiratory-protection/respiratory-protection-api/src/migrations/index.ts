import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261123192906_initial } from './Migration20261123192906_initial.js';

// Maintained by `pnpm run migration:create`.
export const RESPIRATORY_PROTECTION_MIGRATIONS: MigrationObject[] = [
  { name: 'respiratory-protection/Migration20261123192906_initial', class: Migration20261123192906_initial },
];
