import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025074430_import_transfer } from './Migration20261025074430_import_transfer.js';
import { Migration20261024170751_attachments } from './Migration20261024170751_attachments.js';
import { Migration20261024084435_oidc } from './Migration20261024084435_oidc.js';
import { Migration20261024064937_scrubsecrethistory } from './Migration20261024064937_scrubsecrethistory.js';
import { Migration20261023133942_moduletemplategrants } from './Migration20261023133942_moduletemplategrants.js';
import { Migration20261023122012_shellgaps } from './Migration20261023122012_shellgaps.js';
import { Migration20261023120838_rolealldepartments } from './Migration20261023120838_rolealldepartments.js';
import { Migration20261023120410_impersonation } from './Migration20261023120410_impersonation.js';
import { Migration20261023085513_role_templates } from './Migration20261023085513_role_templates.js';
import { Migration20261023083514_lists_tasks_imports } from './Migration20261023083514_lists_tasks_imports.js';
import { Migration20261023081647_history_parent } from './Migration20261023081647_history_parent.js';
import { Migration20261023071739_initial } from './Migration20261023071739_initial.js';

// Maintained by `npm run migration:create`.
export const CORE_MIGRATIONS: MigrationObject[] = [
  { name: 'core/Migration20261023071739_initial', class: Migration20261023071739_initial },
  { name: 'core/Migration20261023081647_history_parent', class: Migration20261023081647_history_parent },
  { name: 'core/Migration20261023083514_lists_tasks_imports', class: Migration20261023083514_lists_tasks_imports },
  { name: 'core/Migration20261023085513_role_templates', class: Migration20261023085513_role_templates },
  { name: 'core/Migration20261023120410_impersonation', class: Migration20261023120410_impersonation },
  { name: 'core/Migration20261023120838_rolealldepartments', class: Migration20261023120838_rolealldepartments },
  { name: 'core/Migration20261023122012_shellgaps', class: Migration20261023122012_shellgaps },
  { name: 'core/Migration20261023133942_moduletemplategrants', class: Migration20261023133942_moduletemplategrants },
  { name: 'core/Migration20261024064937_scrubsecrethistory', class: Migration20261024064937_scrubsecrethistory },
  { name: 'core/Migration20261024084435_oidc', class: Migration20261024084435_oidc },
  { name: 'core/Migration20261024170751_attachments', class: Migration20261024170751_attachments },
  { name: 'core/Migration20261025074430_import_transfer', class: Migration20261025074430_import_transfer },
];
