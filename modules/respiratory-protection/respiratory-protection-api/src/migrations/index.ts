import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261024173930_device_and_group } from './Migration20261024173930_device_and_group.js';
import { Migration20261023133459_initial } from './Migration20261023133459_initial.js';

// Maintained by `npm run migration:create`.
export const RESPIRATORY_PROTECTION_MIGRATIONS: MigrationObject[] = [
  { name: 'respiratory-protection/Migration20261023133459_initial', class: Migration20261023133459_initial },
  { name: 'respiratory-protection/Migration20261024173930_device_and_group', class: Migration20261024173930_device_and_group },
];
