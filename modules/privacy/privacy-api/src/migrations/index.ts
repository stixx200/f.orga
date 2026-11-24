import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261123192927_initial } from './Migration20261123192927_initial.js';

// Maintained by `pnpm run migration:create`.
export const PRIVACY_MIGRATIONS: MigrationObject[] = [
  { name: 'privacy/Migration20261123192927_initial', class: Migration20261123192927_initial },
];
