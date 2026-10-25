import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261024173002_usage_source } from './Migration20261024173002_usage_source.js';
import { Migration20261024085427_defect_reporter } from './Migration20261024085427_defect_reporter.js';
import { Migration20261024063721_initial } from './Migration20261024063721_initial.js';

// Maintained by `npm run migration:create`.
export const EQUIPMENT_MIGRATIONS: MigrationObject[] = [
  { name: 'equipment/Migration20261024063721_initial', class: Migration20261024063721_initial },
  { name: 'equipment/Migration20261024085427_defect_reporter', class: Migration20261024085427_defect_reporter },
  { name: 'equipment/Migration20261024173002_usage_source', class: Migration20261024173002_usage_source },
];
