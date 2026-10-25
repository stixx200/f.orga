import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { DeadlineRegistry, defineModule, ExportRegistry, HistoryAccessRegistry, ImportRegistry, ListRegistry, OrganizationDirectory, RetentionRegistry, RoleAssignment, SearchRegistry } from '@forga/core-api';
import {
  MASTERDATA_MANIFEST,
  MASTERDATA_SETTINGS,
  ORGANIZATION,
  ORGANIZATION_REFERENCES,
  PERSON_HOLDINGS,
  PERSON_DIRECTORY,
  SENSITIVE_PERSON_FIELDS,
} from '@forga/masterdata-contracts';
import { MASTERDATA_MIGRATIONS } from '../migrations/index.js';
import { CatalogController, CatalogEntry, CatalogService } from './catalog/catalog.js';
import { Course, CourseAttendance, CourseNomination, CourseRun } from './courses/course.entities.js';
import { CoursesController } from './courses/courses.controller.js';
import { MasterdataDeadlines } from './deadlines/masterdata.deadlines.js';
import { OrganizationService, PersonDirectoryService } from './directory/directory.js';
import { CareerImport } from './imports/career.import.js';
import { PersonsImport } from './imports/persons.import.js';
import { MasterdataLists } from './lists/masterdata.lists.js';
import { DepartmentGroup } from './organization/group.entities.js';
import { GroupsController } from './organization/groups.controller.js';
import { OrganizationController } from './organization/organization.controller.js';
import { Department, HonorAward, Membership, OfficeAssignment, Person, PersonQualification, RankAssignment, RestPeriod, Station, Vehicle } from './masterdata.entities.js';
import { MasterdataData } from './data/masterdata.data.js';
import { OrganizationReferenceRegistry } from './organization/references.js';
import { PersonHoldingsRegistry } from './persons/holdings.js';
import { PersonsController } from './persons/persons.controller.js';
import { SelfController } from './self/self.controller.js';
import { PersonsService, READ, SENSITIVE } from './persons/persons.service.js';

/** Global, so other modules can inject `PERSON_DIRECTORY`, `ORGANIZATION`, `ORGANIZATION_REFERENCES` and `PERSON_HOLDINGS` without importing this package. */
@Global()
@Module({
  controllers: [CatalogController, OrganizationController, GroupsController, PersonsController, CoursesController, SelfController],
  providers: [
    CatalogService,
    PersonsService,
    MasterdataLists,
    MasterdataDeadlines,
    PersonsImport,
    CareerImport,
    MasterdataData,
    { provide: PERSON_DIRECTORY, useClass: PersonDirectoryService },
    { provide: ORGANIZATION, useClass: OrganizationService },
    OrganizationReferenceRegistry,
    { provide: ORGANIZATION_REFERENCES, useExisting: OrganizationReferenceRegistry },
    PersonHoldingsRegistry,
    { provide: PERSON_HOLDINGS, useExisting: PersonHoldingsRegistry },
  ],
  exports: [PERSON_DIRECTORY, ORGANIZATION, ORGANIZATION_REFERENCES, PERSON_HOLDINGS],
})
export class MasterdataModule implements OnModuleInit {
  constructor(
    private readonly historyAccess: HistoryAccessRegistry,
    private readonly persons: PersonsService,
    private readonly em: EntityManager,
    private readonly lists: ListRegistry,
    private readonly masterdataLists: MasterdataLists,
    private readonly deadlineRegistry: DeadlineRegistry,
    private readonly deadlines: MasterdataDeadlines,
    private readonly imports: ImportRegistry,
    private readonly personsImport: PersonsImport,
    private readonly careerImport: CareerImport,
    private readonly references: OrganizationReferenceRegistry,
    private readonly search: SearchRegistry,
    private readonly exports: ExportRegistry,
    private readonly retention: RetentionRegistry,
    private readonly data: MasterdataData,
    private readonly organization: OrganizationDirectory,
  ) {}

  /**
   * Registers lists, deadlines and the import profile with the core.
   * The history of a person follows the person's departments; sensitive fields need their own permission.
   */
  onModuleInit(): void {
    for (const definition of this.masterdataLists.definitions()) this.lists.register('masterdata', definition);
    this.deadlineRegistry.register(this.deadlines);
    this.imports.register('masterdata', this.personsImport.profile());
    this.imports.register('masterdata', this.careerImport.profile());
    // Role assignments of the core refer to departments by ID.
    this.references.register('core', (kind, id) =>
      kind === 'department' ? this.em.fork().count(RoleAssignment, { departmentId: id }) : Promise.resolve(0),
    );
    // The core checks role assignments and user links against departments and persons, and extends a department
    // assignment to the departments below it (youth and veterans department of an operational department).
    this.organization.register({
      departments: async () => (await this.em.fork().find(Department, {}, { fields: ['id', 'parent'] })).map((d) => ({ id: d.id, parentId: d.parent?.id ?? null })),
      persons: async (ids) =>
        (await this.em.fork().find(Person, { id: { $in: [...ids] } }, { fields: ['id', 'firstName', 'lastName', 'email'] })).map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName, email: p.email })),
      catalogEntries: () => this.em.fork().count(CatalogEntry, {}),
    });
    this.search.register('masterdata', (user, query) => this.data.search(user, query));
    this.exports.register('masterdata', { all: () => this.data.exportAll(), person: (id) => this.data.exportPerson(id) });
    this.retention.register('masterdata.persons', { run: (settings, dryRun) => this.data.anonymize(settings, dryRun) });
    this.historyAccess.register('masterdata.person', async (user, id) => {
      const person = await this.em.fork().findOne(Person, id, { populate: ['memberships.department'] });
      if (!person || !this.persons.can(user, READ, person)) return { allowed: false };
      // Rest periods are sensitive as a whole: their entries are masked like the sensitive fields of the person.
      return { allowed: true, hiddenFields: this.persons.can(user, SENSITIVE, person) ? [] : [...SENSITIVE_PERSON_FIELDS, 'masterdata.rest_period'] };
    });
    this.historyAccess.registerPermission('masterdata.catalog_entry', 'masterdata.catalogs.manage');
    this.historyAccess.registerPermission('masterdata.department', 'masterdata.organization.manage');
    this.historyAccess.registerPermission('masterdata.station', 'masterdata.organization.manage');
    this.historyAccess.registerPermission('masterdata.vehicle', 'masterdata.organization.manage');
    this.historyAccess.registerPermission('masterdata.course', 'masterdata.courses.plan');
  }
}

export const masterdataModule = defineModule({
  manifest: MASTERDATA_MANIFEST,
  nestModule: MasterdataModule,
  entities: [
    CatalogEntry,
    Department,
    Station,
    Vehicle,
    Person,
    Membership,
    PersonQualification,
    RankAssignment,
    HonorAward,
    OfficeAssignment,
    RestPeriod,
    Course,
    CourseRun,
    CourseAttendance,
    CourseNomination,
    DepartmentGroup,
  ],
  historized: [
    CatalogEntry,
    Department,
    Station,
    Vehicle,
    Person,
    { entity: Membership, parent: 'person' },
    { entity: PersonQualification, parent: 'person' },
    { entity: RankAssignment, parent: 'person' },
    { entity: HonorAward, parent: 'person' },
    { entity: OfficeAssignment, parent: 'person' },
    { entity: RestPeriod, parent: 'person' },
    Course,
    { entity: CourseRun, parent: 'course' },
    { entity: CourseAttendance, parent: 'person' },
    { entity: CourseNomination, parent: 'person' },
    { entity: DepartmentGroup, parent: 'department' },
  ],
  migrations: MASTERDATA_MIGRATIONS,
  settings: MASTERDATA_SETTINGS,
});
