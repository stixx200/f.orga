import { Injectable } from '@nestjs/common';
import { type EntityClass, EntityManager, wrap } from '@mikro-orm/core';
import { type AuthenticatedUser, HistoryEntry, wordsWhere } from '@forga/core-api';
import type { PrivacySettings, SearchHit } from '@forga/core-contracts';
import { CatalogEntry } from '../catalog/catalog.js';
import { Course, CourseAttendance, CourseNomination } from '../courses/course.entities.js';
import { Department, HonorAward, Membership, Person, PersonQualification, RankAssignment, Station, Vehicle } from '../masterdata.entities.js';
import { PersonsService } from '../persons/persons.service.js';

const plain = async <T extends object>(em: EntityManager, entity: EntityClass<T>, where: object = {}) =>
  (await em.find(entity, where as never)).map((e) => wrap(e).toObject());

/** Search, full export, data access request and anonymisation for the master data. */
@Injectable()
export class MasterdataData {
  constructor(
    private readonly em: EntityManager,
    private readonly persons: PersonsService,
  ) {}

  async search(user: AuthenticatedUser, query: string): Promise<SearchHit[]> {
    const hits: SearchHit[] = (await this.persons.list(user, { query, includeLeft: false })).slice(0, 8).map((p) => ({
      id: p.id,
      group: { de: 'Personen', en: 'Persons' },
      title: `${p.lastName}, ${p.firstName}`,
      description: p.personnelNumber ?? undefined,
      to: `/masterdata/persons/${p.id}`,
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
      courses: await plain(em, Course),
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
      courseAttendances: await plain(em, CourseAttendance, { person: personId }),
      courseNominations: await plain(em, CourseNomination, { person: personId }),
      history: await plain(em, HistoryEntry, { $or: [{ entity: 'masterdata.person', entityId: personId }, { parentEntity: 'masterdata.person', parentId: personId }] }),
    };
  }

  /**
   * Anonymises persons who left more than the configured years ago: name becomes "Person (ausgeschieden)",
   * contact, sensitive data, qualifications, honours and courses are removed, and so is their history.
   * Memberships and ranks stay for past statistics; incident reports keep the reference.
   */
  async anonymize(settings: PrivacySettings, dryRun: boolean): Promise<number> {
    if (!settings.anonymizeLeftAfterYears) return 0;
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - settings.anonymizeLeftAfterYears);
    const em = this.em.fork();
    const persons = await em.find(Person, { status: 'left', leftOn: { $lt: cutoff.toISOString().slice(0, 10) }, anonymizedAt: null }, { populate: ['qualifications', 'honors'] });
    if (dryRun || !persons.length) return persons.length;
    for (const person of persons) {
      em.assign(person, {
        personnelNumber: null, salutation: '', title: '', firstName: 'Person', lastName: '(ausgeschieden)', nickname: '',
        street: '', postalCode: '', city: '', phonePrivate: '', phoneMobile: '', phoneWork: '', email: '',
        birthDate: null, birthPlace: '', employer: null, bank: null, notes: '',
        driverLicense: { classes: [], expiresOn: null, lastCheckedOn: null }, anonymizedAt: new Date(),
      });
      person.qualifications.removeAll();
      person.honors.removeAll();
      await em.nativeDelete(CourseAttendance, { person });
      await em.nativeDelete(CourseNomination, { person });
    }
    await em.flush();
    const ids = persons.map((p) => p.id);
    await em.nativeDelete(HistoryEntry, { $or: [{ entity: 'masterdata.person', entityId: { $in: ids } }, { parentEntity: 'masterdata.person', parentId: { $in: ids } }] });
    return persons.length;
  }

}
