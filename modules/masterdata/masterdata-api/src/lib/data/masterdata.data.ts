import { Injectable } from '@nestjs/common';
import { type EntityClass, EntityManager, wrap } from '@mikro-orm/core';
import { type AuthenticatedUser, HistoryEntry, PersonDataRegistry, wordsWhere } from '@forga/core-api';
import type { SearchHit } from '@forga/core-contracts';
import { EMPTY_DRIVER_LICENSE } from '@forga/masterdata-contracts';
import { CatalogEntry } from '../catalog/catalog.js';
import { Course, CourseAttendance, CourseNomination, CourseRun } from '../courses/course.entities.js';
import { DepartmentGroup } from '../organization/group.entities.js';
import { Department, DriverLicenseCheck, DriverLicenseRequest, DriverLicenseToken, HonorAward, Membership, OfficeAssignment, Person, PersonQualification, RankAssignment, RestPeriod, Station, Vehicle } from '../masterdata.entities.js';
import { departmentsOf, PersonsService } from '../persons/persons.service.js';

/** First and last name of anonymised persons: "N." (nomen nescio) reads the same in every language. */
const ANONYMIZED_NAME = 'N.';

const plain = async <T extends object>(em: EntityManager, entity: EntityClass<T>, where: object = {}) =>
  (await em.find(entity, where as never)).map((e) => wrap(e).toObject());

/** Search, full export, data access request and anonymisation for the master data. */
@Injectable()
export class MasterdataData {
  constructor(
    private readonly em: EntityManager,
    private readonly persons: PersonsService,
    private readonly personData: PersonDataRegistry,
  ) {}

  /**
   * Persons whose file the user may read come first (those of the user's own departments before others), so directory
   * entries of other departments do not crowd them out. Directory entries name the department and lead to the person
   * list filtered by the name, because their file is not readable.
   */
  async search(user: AuthenticatedUser, query: string): Promise<SearchHit[]> {
    const found = await this.persons.list(user, { query, includeLeft: false });
    const self = user.personId ? await this.em.fork().findOne(Person, user.personId, { populate: ['memberships.department'] }) : null;
    const own = new Set(self ? departmentsOf(self) : []);
    const rank = (p: (typeof found)[number]) => (p.restricted ? 2 : p.departmentIds.some((d) => own.has(d)) ? 0 : 1);
    const departments = new Map((await this.em.fork().find(Department, {})).map((d) => [d.id, d.name]));
    const hits: SearchHit[] = found
      .map((p, index) => ({ p, index }))
      .toSorted((a, b) => rank(a.p) - rank(b.p) || a.index - b.index)
      .slice(0, 8)
      .map(({ p }) => ({
        id: p.id,
        group: { de: 'Personen', en: 'Persons' },
        title: `${p.lastName}, ${p.firstName}`,
        description: p.restricted ? (departments.get(p.primaryDepartmentId ?? '') ?? undefined) : (p.personnelNumber ?? undefined),
        to: p.restricted ? `/masterdata/persons?q=${encodeURIComponent(`${p.firstName} ${p.lastName}`)}` : `/masterdata/persons/${p.id}`,
        personId: p.id,
      }));
    const vehicles = await this.em.fork().find(Vehicle, wordsWhere(query, ['designation', 'radioCallSign', 'licensePlate']) ?? {}, { limit: 5 });
    return [
      ...hits,
      ...vehicles.map((v) => ({ id: v.id, group: { de: 'Fahrzeuge', en: 'Vehicles' }, title: v.designation, description: v.radioCallSign, to: '/masterdata/vehicles' })),
    ];
  }

  async exportAll(): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    return {
      catalog: await plain(em, CatalogEntry),
      departments: await plain(em, Department),
      stations: await plain(em, Station),
      vehicles: await plain(em, Vehicle),
      persons: await plain(em, Person),
      memberships: await plain(em, Membership),
      qualifications: await plain(em, PersonQualification),
      ranks: await plain(em, RankAssignment),
      honors: await plain(em, HonorAward),
      offices: await plain(em, OfficeAssignment),
      restPeriods: await plain(em, RestPeriod),
      // Stickers without the hash of their ID (hidden property).
      driverLicenseChecks: await plain(em, DriverLicenseCheck),
      driverLicenseRequests: await plain(em, DriverLicenseRequest),
      driverLicenseTokens: await plain(em, DriverLicenseToken),
      groups: await plain(em, DepartmentGroup),
      courses: await plain(em, Course),
      courseRuns: await plain(em, CourseRun),
      courseAttendances: await plain(em, CourseAttendance),
      courseNominations: await plain(em, CourseNomination),
    };
  }

  async exportPerson(personId: string): Promise<Record<string, unknown>> {
    const em = this.em.fork();
    const person = await em.findOne(Person, personId);
    if (!person) return {};
    return {
      person: wrap(person).toObject(),
      memberships: await plain(em, Membership, { person: personId }),
      qualifications: await plain(em, PersonQualification, { person: personId }),
      ranks: await plain(em, RankAssignment, { person: personId }),
      honors: await plain(em, HonorAward, { person: personId }),
      offices: await plain(em, OfficeAssignment, { person: personId }),
      restPeriods: await plain(em, RestPeriod, { person: personId }),
      driverLicenseChecks: await plain(em, DriverLicenseCheck, { person: personId }),
      driverLicenseRequests: await plain(em, DriverLicenseRequest, { person: personId }),
      driverLicenseTokens: await plain(em, DriverLicenseToken, { person: personId }),
      groups: (await em.find(DepartmentGroup, {})).filter((g) => g.leader?.id === personId || g.memberIds.includes(personId)).map((g) => wrap(g).toObject()),
      courseAttendances: await plain(em, CourseAttendance, { person: personId }),
      courseNominations: await plain(em, CourseNomination, { person: personId }),
      history: await plain(em, HistoryEntry, { $or: [{ entity: 'masterdata.person', entityId: personId }, { parentEntity: 'masterdata.person', parentId: personId }] }),
    };
  }

  /**
   * The person file of former members (Personalakte): contact and sensitive data, the driving licence with its checks,
   * requests and stickers, qualifications, honours, offices, rest periods and courses are removed, and so is the history
   * holding them; the other modules remove what they keep about the persons (accounts, health data, notes, sizes, …).
   * Name, memberships and ranks stay (basic data).
   */
  async anonymizeFile(ids: readonly string[]): Promise<number> {
    const em = this.em.fork();
    const persons = await em.find(Person, { id: { $in: [...ids] }, fileAnonymizedAt: null }, { populate: ['qualifications', 'honors', 'offices', 'restPeriods'] });
    if (!persons.length) return 0;
    for (const person of persons) {
      em.assign(person, {
        salutation: '', title: '', nickname: '', street: '', postalCode: '', city: '', phonePrivate: '', phoneMobile: '', phoneWork: '', email: '',
        birthDate: null, birthPlace: '', employer: null, bank: null, notes: '',
        driverLicense: { ...EMPTY_DRIVER_LICENSE }, fileAnonymizedAt: new Date(),
      });
      person.qualifications.removeAll();
      person.honors.removeAll();
      person.offices.removeAll();
      person.restPeriods.removeAll();
      await em.nativeDelete(CourseAttendance, { person });
      await em.nativeDelete(CourseNomination, { person });
      await em.nativeDelete(DriverLicenseCheck, { person });
      await em.nativeDelete(DriverLicenseRequest, { person });
      await em.nativeDelete(DriverLicenseToken, { person });
    }
    await em.flush();
    const done = persons.map((p) => p.id);
    await this.removeHistory(em, done);
    await this.personData.anonymize(done);
    return persons.length;
  }

  /**
   * Anonymises persons completely (basic data, Personalstammrolle): first the person file, then the name becomes the
   * language-neutral "N., N." (nomen nescio; the UI marks anonymised persons in the user's language) and the personnel
   * number is removed. Memberships and ranks stay for past statistics; incident reports keep the reference.
   */
  async anonymizePersons(ids: readonly string[]): Promise<number> {
    await this.anonymizeFile(ids);
    const em = this.em.fork();
    const persons = await em.find(Person, { id: { $in: [...ids] }, anonymizedAt: null });
    if (!persons.length) return 0;
    for (const person of persons) em.assign(person, { personnelNumber: null, firstName: ANONYMIZED_NAME, lastName: ANONYMIZED_NAME, anonymizedAt: new Date() });
    await em.flush();
    await this.removeHistory(em, persons.map((p) => p.id));
    return persons.length;
  }

  private async removeHistory(em: EntityManager, ids: string[]): Promise<void> {
    await em.nativeDelete(HistoryEntry, { $or: [{ entity: 'masterdata.person', entityId: { $in: ids } }, { parentEntity: 'masterdata.person', parentId: { $in: ids } }] });
  }
}
