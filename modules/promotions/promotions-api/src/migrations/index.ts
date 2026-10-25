import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261024165037_exclusion_target_rank } from './Migration20261024165037_exclusion_target_rank.js';
import { Migration20261024082145_initial } from './Migration20261024082145_initial.js';

// Maintained by `npm run migration:create`.
export const PROMOTIONS_MIGRATIONS: MigrationObject[] = [
  { name: 'promotions/Migration20261024082145_initial', class: Migration20261024082145_initial },
  { name: 'promotions/Migration20261024165037_exclusion_target_rank', class: Migration20261024165037_exclusion_target_rank },
];
