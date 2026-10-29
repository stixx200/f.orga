import { Global, Module, type OnModuleInit } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/core';
import { AccessLog, AuditReferenceRegistry, DeadlineRegistry, defineModule, ExportRegistry, HistoryAccessRegistry, ImportRegistry, ListRegistry, OrganizationDirectory, PersonDataRegistry, RetentionRegistry, RoleAssignment, SearchRegistry } from '@forga/core-api';
import {
  CATALOG_REFERENCES,
  MASTERDATA_LICENSE_SELF_CHECK,
  MASTERDATA_MANIFEST,
  MASTERDATA_SETTINGS,
  ORGANIZATION,
  ORGANIZATION_REFERENCES,
  PERSON_HOLDINGS,
  PERSON_DIRECTORY,
  SENSITIVE_PERSON_FIELDS,
} from '@forga/masterdata-contracts';
import { MASTERDATA_MIGRATIONS } from '../migrations/index.js';
import { registerAuditReferences } from './audit/audit.references.js';
import { CatalogController, CatalogEntry, CatalogService } from './catalog/catalog.js';
import { CatalogReferenceRegistry } from './catalog/references.js';
import { MasterdataCatalogUsage } from './catalog/usage.js';
import { Course, CourseAttendance, CourseNomination, CourseRun } from './courses/course.entities.js';
import { CoursesController } from './courses/courses.controller.js';
import { MasterdataDeadlines } from './deadlines/masterdata.deadlines.js';
import { DriverLicensesController } from './driver-licenses/driver-licenses.controller.js';
import { CHECK, DriverLicensesService } from './driver-licenses/driver-licenses.service.js';
import { DriverLicenseDeadlines } from './driver-licenses/license-deadlines.js';
import { DriverLicenseLists } from './driver-licenses/license-lists.js';
import { LicenseSelfCheckService } from './driver-licenses/self-check.js';
import { OrganizationService, PersonDirectoryService } from './directory/directory.js';
import { CareerImport } from './imports/career.import.js';
import { MasterdataLookups } from './imports/lookups.js';
import { PersonsImport } from './imports/persons.import.js';
import { MasterdataLists } from './lists/masterdata.lists.js';
import { DepartmentGroup } from './organization/group.entities.js';
import { GroupsController } from './organization/groups.controller.js';
import { OrganizationController } from './organization/organization.controller.js';
import { Department, DriverLicenseCheck, DriverLicenseRequest, DriverLicenseToken, HonorAward, Membership, OfficeAssignment, Person, PersonQualification, RankAssignment, RestPeriod, Station, Vehicle } from './masterdata.entities.js';
import { MasterdataData } from './data/masterdata.data.js';
import { MasterdataDescription } from './data/masterdata.description.js';
import { MasterdataRetention } from './data/masterdata.retention.js';
import { MasterdataErasure } from './data/masterdata.erasure.js';
import { OrganizationReferenceRegistry } from './organization/references.js';
import { PersonHoldingsRegistry } from './persons/holdings.js';
import { PERSON_SENSITIVE_AREA, PersonsController } from './persons/persons.controller.js';
import { LISTS_ACCESS_AREA } from './lists/masterdata.lists.js';
import { ageOn } from './shared/dates.js';
import { today } from './shared/access.js';
import { SelfController } from './self/self.controller.js';
import { PersonPrivacyController, PersonPrivacyService, RestrictionDeadlines } from './privacy/privacy.controller.js';
import { departmentsOf, PersonsService, READ, SENSITIVE } from './persons/persons.service.js';

/**
 * Global, so other modules can inject `PERSON_DIRECTORY`, `ORGANIZATION`, `ORGANIZATION_REFERENCES`, `CATALOG_REFERENCES`,
 * `PERSON_HOLDINGS` and `MASTERDATA_LICENSE_SELF_CHECK` without importing this package.
 */
@Global()
@Module({
  controllers: [CatalogController, OrganizationController, GroupsController, PersonsController, CoursesController, SelfController, DriverLicensesController, PersonPrivacyController],
  providers: [
    CatalogService,
    PersonsService,
    PersonPrivacyService,
    RestrictionDeadlines,
    MasterdataLists,
    MasterdataDeadlines,
    PersonsImport,
    CareerImport,
    MasterdataLookups,
    MasterdataData,
    MasterdataDescription,
    MasterdataRetention,
    MasterdataErasure,
    { provide: PERSON_DIRECTORY, useClass: PersonDirectoryService },
    { provide: ORGANIZATION, useClass: OrganizationService },
    OrganizationReferenceRegistry,
    { provide: ORGANIZATION_REFERENCES, useExisting: OrganizationReferenceRegistry },
    CatalogReferenceRegistry,
    { provide: CATALOG_REFERENCES, useExisting: CatalogReferenceRegistry },
    MasterdataCatalogUsage,
    PersonHoldingsRegistry,
    { provide: PERSON_HOLDINGS, useExisting: PersonHoldingsRegistry },
    DriverLicensesService,
    DriverLicenseDeadlines,
    DriverLicenseLists,
    LicenseSelfCheckService,
    { provide: MASTERDATA_LICENSE_SELF_CHECK, useExisting: LicenseSelfCheckService },
  ],
  exports: [PERSON_DIRECTORY, ORGANIZATION, ORGANIZATION_REFERENCES, CATALOG_REFERENCES, PERSON_HOLDINGS, MASTERDATA_LICENSE_SELF_CHECK],
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
    private readonly lookups: MasterdataLookups,
    private readonly references: OrganizationReferenceRegistry,
    private readonly catalogReferences: CatalogReferenceRegistry,
    private readonly catalogUsage: MasterdataCatalogUsage,
    private readonly search: SearchRegistry,
    private readonly exports: ExportRegistry,
    private readonly retention: RetentionRegistry,
    private readonly data: MasterdataData,
    private readonly description: MasterdataDescription,
    private readonly retentionCategories: MasterdataRetention,
    private readonly organization: OrganizationDirectory,
    private readonly auditReferences: AuditReferenceRegistry,
    private readonly licenseDeadlines: DriverLicenseDeadlines,
    private readonly licenseLists: DriverLicenseLists,
    private readonly personPrivacy: PersonPrivacyService,
    private readonly restrictionDeadlines: RestrictionDeadlines,
    private readonly accessLog: AccessLog,
    private readonly personData: PersonDataRegistry,
    private readonly erasure: MasterdataErasure,
  ) {}

  /**
   * Registers lists, deadlines and the import profile with the core.
   * The history of a person follows the person's departments; sensitive fields need their own permission.
   */
  onModuleInit(): void {
    for (const definition of [...this.masterdataLists.definitions(), ...this.licenseLists.definitions()]) this.lists.register('masterdata', definition);
    this.deadlineRegistry.register(this.deadlines);
    this.deadlineRegistry.register(this.licenseDeadlines);
    this.deadlineRegistry.register(this.restrictionDeadlines);
    this.imports.register('masterdata', this.personsImport.profile());
    this.imports.register('masterdata', this.careerImport.profile());
    for (const lookup of this.lookups.lookups()) this.imports.registerLookup('masterdata', lookup);
    // Role assignments of the core refer to departments by ID.
    this.references.register('core', (kind, id) =>
      kind === 'department' ? this.em.fork().count(RoleAssignment, { departmentId: id }) : Promise.resolve(0),
    );
    // Person files, vehicles, courses and membership rules refer to catalog entries; the list of breathing apparatus
    // wearers relies on the qualification `breathing-apparatus`.
    this.catalogReferences.register('masterdata', (kind, key) => this.catalogUsage.count(kind, key));
    this.catalogReferences.require('masterdata', 'qualification', 'breathing-apparatus');
    // The core checks role assignments and user links against departments and persons, and extends a department
    // assignment to the departments below it (youth and veterans department of an operational department).
    this.organization.register({
      departments: async () => (await this.em.fork().find(Department, {}, { fields: ['id', 'parent', 'shortName'] })).map((d) => ({ id: d.id, parentId: d.parent?.id ?? null, name: d.shortName })),
      persons: async (ids) =>
        (await this.em.fork().find(Person, { id: { $in: [...ids] } }, { populate: ['memberships.department'] })).map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          email: p.email,
          departmentIds: departmentsOf(p),
          street: p.street,
          postalCode: p.postalCode,
          city: p.city,
          phone: p.phoneMobile || p.phonePrivate,
          anonymized: Boolean(p.anonymizedAt),
        })),
      catalogEntries: () => this.em.fork().count(CatalogEntry, {}),
      // A linked user reads and changes the person's own data including the sensitive fields.
      linkPermission: SENSITIVE,
      searchPersons: async (user, query, limit) =>
        (await this.persons.list(user, { query, includeLeft: true }))
          .slice(0, limit)
          .map((p) => ({ id: p.id, label: `${p.lastName}, ${p.firstName}${p.personnelNumber ? ` (${p.personnelNumber})` : ''}` })),
      postalAddress: async (id) => {
        const p = await this.em.fork().findOne(Person, id);
        return p && { salutation: p.salutation, title: p.title, firstName: p.firstName, lastName: p.lastName, street: p.street, postalCode: p.postalCode, city: p.city };
      },
      readablePersonIds: async (user) => (await this.persons.findVisible(user, READ)).map((p) => p.id),
      allPersonIds: async () => (await this.em.fork().find(Person, {}, { fields: ['id'] })).map((p) => p.id),
      // Restriction of processing (Art. 18): the core leaves these persons out of deadlines and search.
      restrictedPersonIds: () => this.personPrivacy.restrictedIds(),
      restrictProcessing: (personId, restriction) => this.personPrivacy.restrict(personId, restriction),
      // Consents of minors are given by their legal guardians (L9).
      minors: async (ids) => {
        const day = today();
        return (await this.em.fork().find(Person, { id: { $in: [...ids] } }, { fields: ['id', 'birthDate'] })).filter((p) => p.birthDate && ageOn(p.birthDate, day) < 18).map((p) => p.id);
      },
    });
    this.accessLog.registerArea(PERSON_SENSITIVE_AREA, { de: 'Personalakte mit sensiblen Feldern', en: 'Person file with sensitive fields' });
    this.accessLog.registerArea(LISTS_ACCESS_AREA, { de: 'Listen mit Kontakt- oder sensiblen Daten', en: 'Lists with contact or sensitive data' });
    this.search.register('masterdata', (user, query) => this.data.search(user, query));
    registerAuditReferences(this.auditReferences, this.em);
    this.exports.register('masterdata', {
      all: () => this.data.exportAll(),
      person: (id) => this.data.exportPerson(id),
      describePerson: (id, ctx) => this.description.describePerson(id, ctx),
    });
    this.retentionCategories.register(this.retention);
    this.personData.register('masterdata', this.erasure);
    this.historyAccess.register('masterdata.person', async (user, id) => {
      const person = await this.em.fork().findOne(Person, id, { populate: ['memberships.department'] });
      if (!person || !this.persons.can(user, READ, person)) return { allowed: false };
      // Rest periods are sensitive as a whole: their entries are masked like the sensitive fields of the person.
      // Requests to present the driving licence again name reasons that only the licence checkers see.
      const hidden = [
        ...(this.persons.can(user, SENSITIVE, person) ? [] : [...SENSITIVE_PERSON_FIELDS, 'masterdata.rest_period']),
        ...(this.persons.can(user, CHECK, person) ? [] : ['masterdata.driver_license_request']),
      ];
      return { allowed: true, hiddenFields: hidden };
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
    DriverLicenseCheck,
    DriverLicenseRequest,
    DriverLicenseToken,
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
    { entity: DriverLicenseCheck, parent: 'person' },
    { entity: DriverLicenseRequest, parent: 'person' },
    { entity: DriverLicenseToken, parent: 'person' },
    Course,
    { entity: CourseRun, parent: 'course' },
    { entity: CourseAttendance, parent: 'person' },
    { entity: CourseNomination, parent: 'person' },
    { entity: DepartmentGroup, parent: 'department' },
  ],
  migrations: MASTERDATA_MIGRATIONS,
  settings: MASTERDATA_SETTINGS,
});
