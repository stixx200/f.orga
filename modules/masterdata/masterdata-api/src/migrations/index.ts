import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261110153009_person_device_token } from './Migration20261110153009_person_device_token.js';
import { Migration20261031202813_initial } from './Migration20261031202813_initial.js';

// Maintained by `pnpm run migration:create`.
export const MASTERDATA_MIGRATIONS: MigrationObject[] = [
  { name: 'masterdata/Migration20261031202813_initial', class: Migration20261031202813_initial },
  { name: 'masterdata/Migration20261110153009_person_device_token', class: Migration20261110153009_person_device_token },
];
