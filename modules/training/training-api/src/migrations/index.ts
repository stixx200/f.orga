import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261024164659_checkin_confirmed } from './Migration20261024164659_checkin_confirmed.js';
import { Migration20261024085330_excuse_note } from './Migration20261024085330_excuse_note.js';
import { Migration20261023124049_initial } from './Migration20261023124049_initial.js';

// Maintained by `npm run migration:create`.
export const TRAINING_MIGRATIONS: MigrationObject[] = [
  { name: 'training/Migration20261023124049_initial', class: Migration20261023124049_initial },
  { name: 'training/Migration20261024085330_excuse_note', class: Migration20261024085330_excuse_note },
  { name: 'training/Migration20261024164659_checkin_confirmed', class: Migration20261024164659_checkin_confirmed },
];
