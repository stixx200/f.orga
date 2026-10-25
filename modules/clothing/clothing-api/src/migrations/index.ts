import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025125651_barcode_rfid } from './Migration20261025125651_barcode_rfid.js';
import { Migration20261025115128_initial } from './Migration20261025115128_initial.js';

// Maintained by `npm run migration:create`.
export const CLOTHING_MIGRATIONS: MigrationObject[] = [
  { name: 'clothing/Migration20261025115128_initial', class: Migration20261025115128_initial },
  { name: 'clothing/Migration20261025125651_barcode_rfid', class: Migration20261025125651_barcode_rfid },
];
