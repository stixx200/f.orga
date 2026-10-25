import type { MigrationObject } from '@mikro-orm/core';
import { Migration20261025083601_person_directory } from './Migration20261025083601_person_directory.js';
import { Migration20261024182805_rest_periods } from './Migration20261024182805_rest_periods.js';
import { Migration20261024181547_offices } from './Migration20261024181547_offices.js';
import { Migration20261024180759_department_population } from './Migration20261024180759_department_population.js';
import { Migration20261023122014_anonymize } from './Migration20261023122014_anonymize.js';
import { Migration20261023081648_persons_courses } from './Migration20261023081648_persons_courses.js';
import { Migration20261023071740_initial } from './Migration20261023071740_initial.js';

// Maintained by `npm run migration:create`.
export const MASTERDATA_MIGRATIONS: MigrationObject[] = [
  { name: 'masterdata/Migration20261023071740_initial', class: Migration20261023071740_initial },
  { name: 'masterdata/Migration20261023081648_persons_courses', class: Migration20261023081648_persons_courses },
  { name: 'masterdata/Migration20261023122014_anonymize', class: Migration20261023122014_anonymize },
  { name: 'masterdata/Migration20261024180759_department_population', class: Migration20261024180759_department_population },
  { name: 'masterdata/Migration20261024181547_offices', class: Migration20261024181547_offices },
  { name: 'masterdata/Migration20261024182805_rest_periods', class: Migration20261024182805_rest_periods },
  { name: 'masterdata/Migration20261025083601_person_directory', class: Migration20261025083601_person_directory },
];
