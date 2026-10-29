import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { EntityManager, type FilterQuery } from '@mikro-orm/core';
import { assertNotRestricted, type AuthenticatedUser, wordsWhere } from '@forga/core-api';
import type { ProcessingRestriction } from '@forga/core-contracts';
import { type Person as PersonDto, type PersonSnapshot, type PersonSummary, readDriverLicense } from '@forga/masterdata-contracts';
import { today } from '../shared/access.js';
import { PersonFields } from './person-fields.js';
import { HonorAward, Membership, Person, PersonQualification, RankAssignment, OfficeAssignment, RestPeriod } from '../masterdata.entities.js';

export const READ = 'masterdata.persons.read';
export const WRITE = 'masterdata.persons.write';
export const SENSITIVE = 'masterdata.persons.sensitive';
/** Name, status and departments only, e.g. persons of other departments for a department commander. */
export const DIRECTORY = 'masterdata.persons.directory';

const POPULATE = ['memberships.department', 'qualifications', 'ranks', 'honors', 'offices', 'restPeriods'] as const;

/** Memberships active on the date. */
export function activeMemberships(person: Person, date = today()): Membership[] {
  return person.memberships.getItems().filter((m) => m.from <= date && (!m.to || m.to >= date));
}

/**
 * Departments a person belongs to for access checks: current memberships,
 * or all former ones once the person has left.
 */
export function departmentsOf(person: Person, date = today()): string[] {
  const current = activeMemberships(person, date);
  const memberships = current.length || person.status !== 'left' ? current : person.memberships.getItems();
  return [...new Set(memberships.map((m) => m.department.id))];
}

/** Primary department on the date (or the first current one). */
export function primaryDepartment(person: Person, date = today()): string | null {
  const current = activeMemberships(person, date);
  return (current.find((m) => m.primary) ?? current[0])?.department.id ?? null;
}

export function currentRank(person: Person, date = today()): string | null {
  const ranks = person.ranks
    .getItems()
    .filter((r) => r.since <= date)
    .toSorted((a, b) => b.since.localeCompare(a.since));
  return ranks[0]?.rank ?? null;
}

/** Qualification entries of the person valid on the date. */
export function currentQualifications(person: Person, date = today()): PersonQualification[] {
  return person.qualifications.getItems().filter((q) => q.acquiredOn <= date && (!q.validUntil || q.validUntil >= date));
}

export function validQualifications(person: Person, date = today()): string[] {
  return [...new Set(currentQualifications(person, date).map((q) => q.qualification))].toSorted();
}

/**
 * Refuses dates before the birth (memberships, qualifications, ranks, courses …); unknown birth dates pass.
 * The birth date is not part of the error, as the user may lack `masterdata.persons.sensitive`.
 */
export function assertNotBeforeBirth(birthDate: string | null | undefined, dates: readonly (string | null | undefined)[]): void {
  if (birthDate && dates.some((date) => date && date < birthDate)) throw new BadRequestException({ code: 'masterdata.dateBeforeBirth' });
}

/** Dates of the child lists of the person file that must not lie before the birth. */
export function recordedDates(person: Person): string[] {
  return [
    ...person.memberships.getItems().map((m) => m.from),
    ...person.qualifications.getItems().map((q) => q.acquiredOn),
    ...person.ranks.getItems().map((r) => r.since),
    ...person.honors.getItems().map((h) => h.awardedOn),
    ...person.offices.getItems().map((o) => o.from),
  ];
}

/** A visibility condition for all (not restricted) persons. */
const all = (where: FilterQuery<Person> | null) => !!where && Object.keys(where).length === 1 && 'restrictedAt' in where;

@Injectable()
export class PersonsService {
  constructor(
    private readonly em: EntityManager,
    private readonly fields: PersonFields,
  ) {}

  /** The person as the UI gets it, without the fields switched off in the settings (L10). */
  async dto(person: Person, user: AuthenticatedUser, options: { self?: boolean } = {}): Promise<PersonDto> {
    return this.fields.blank(this.toDto(person, user, options), await this.fields.disabled());
  }

  /**
   * Restricts a query to the persons the user may see with the permission. Persons whose processing is restricted
   * (Art. 18) never appear in lists, search and pickers; their file opens only by ID (`load`).
   */
  visibleWhere(user: AuthenticatedUser, permission: string): FilterQuery<Person> | null {
    const grant = user.grant(permission);
    if (!grant) return null;
    if (grant === 'brigade') return { restrictedAt: null };
    const date = today();
    return {
      restrictedAt: null,
      $or: [
        {
          memberships: {
            department: { $in: grant },
            from: { $lte: date },
            $or: [{ to: null }, { to: { $gte: date } }],
          },
        },
        { status: 'left', memberships: { department: { $in: grant } } },
      ],
    };
  }

  /** Persons visible with the permission, filtered further by `where`, sorted by name. */
  async findVisible(user: AuthenticatedUser, permission: string, where: FilterQuery<Person> = {}): Promise<Person[]> {
    const visible = this.visibleWhere(user, permission);
    if (!visible) return [];
    return this.em
      .fork()
      .find(Person, { $and: [visible, where] }, { populate: POPULATE, orderBy: { lastName: 'asc', firstName: 'asc' } });
  }

  can(user: AuthenticatedUser, permission: string, person: Person): boolean {
    if (user.grant(permission) === 'brigade') return true;
    return departmentsOf(person).some((id) => user.can(permission, id));
  }

  /** Would the step-up (second factor) give the permission for the person? */
  needsStepUp(user: AuthenticatedUser, permission: string, person: Person): boolean {
    if (this.can(user, permission, person)) return false;
    return user.heldGrant(permission) === 'brigade' || departmentsOf(person).some((id) => user.needsStepUp(permission, id));
  }

  /** The error for a missing permission on the person: `auth.stepUpRequired` if the step-up would give it. */
  denied(user: AuthenticatedUser, permission: string, person: Person) {
    return this.needsStepUp(user, permission, person) ? user.stepUpRequired() : new ForbiddenException({ code: 'auth.forbidden', permissions: [permission] });
  }

  /** Loads a person with all child lists and checks the permission. */
  async load(em: EntityManager, id: string, user: AuthenticatedUser, permission: string): Promise<Person> {
    const person = await em.findOne(Person, id, { populate: POPULATE });
    if (!person) throw new NotFoundException();
    if (!this.can(user, READ, person)) throw new NotFoundException();
    this.assertReadable(user, person);
    if (!this.can(user, permission, person)) throw this.denied(user, permission, person);
    return person;
  }

  /**
   * A person whose processing is restricted is readable (and correctable) only with `core.privacy.manage`:
   * `privacy.processingRestricted`, or `auth.stepUpRequired` if the step-up would give the permission.
   */
  assertReadable(user: AuthenticatedUser, person: Person): void {
    assertNotRestricted(user, Boolean(person.restrictedAt));
  }

  async list(
    user: AuthenticatedUser,
    filter: { query?: string; departmentId?: string; status?: string; qualification?: string; includeLeft?: boolean },
  ): Promise<PersonSummary[]> {
    const full = this.visibleWhere(user, READ);
    const names = this.visibleWhere(user, DIRECTORY);
    if (!full && !names) return [];
    // Qualifications are part of the personnel file, so filtering by them stays within it.
    // An empty condition (all departments) inside `$or` would be dropped, so it is taken as is.
    const visible = filter.qualification || !names ? full : !full || all(names) ? names : all(full) ? full : { $or: [full, names] };
    if (!visible) return [];
    const conditions: FilterQuery<Person>[] = [visible];
    if (filter.status) conditions.push({ status: filter.status as Person['status'] });
    else if (!filter.includeLeft) conditions.push({ status: { $ne: 'left' } });
    // Each word in first or last name, so "Felix", "Funke, Felix" and "Felix Funke" find the same person.
    const words = wordsWhere(filter.query ?? '', ['firstName', 'lastName'], (like) => (full ? [{ $and: [full, { personnelNumber: { $ilike: like } }] }] : []));
    if (words) conditions.push(words as FilterQuery<Person>);
    if (filter.departmentId) conditions.push({ memberships: { department: filter.departmentId } });
    if (filter.qualification) conditions.push({ qualifications: { qualification: filter.qualification } });

    const persons = await this.em
      .fork()
      .find(Person, { $and: conditions }, { populate: POPULATE, orderBy: { lastName: 'asc', firstName: 'asc' } });
    return persons.map((p) => (this.can(user, READ, p) ? this.summary(p) : this.restrictedSummary(p)));
  }

  /** Directory entry without the personnel file. */
  restrictedSummary(person: Person): PersonSummary {
    return {
      id: person.id,
      personnelNumber: null,
      firstName: person.firstName,
      lastName: person.lastName,
      status: person.status,
      rank: null,
      primaryDepartmentId: primaryDepartment(person),
      departmentIds: departmentsOf(person),
      qualifications: [],
      phoneMobile: '',
      email: '',
      restricted: true,
    };
  }

  summary(person: Person): PersonSummary {
    return {
      id: person.id,
      personnelNumber: person.personnelNumber ?? null,
      firstName: person.firstName,
      lastName: person.lastName,
      status: person.status,
      rank: currentRank(person),
      primaryDepartmentId: primaryDepartment(person),
      departmentIds: departmentsOf(person),
      qualifications: validQualifications(person),
      phoneMobile: person.phoneMobile,
      email: person.email,
    };
  }

  snapshot(person: Person, date: string): PersonSnapshot {
    const primary = primaryDepartment(person, date);
    const departments = activeMemberships(person, date).map((m) => m.department.id);
    return {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      status: person.status,
      birthDate: person.birthDate ?? null,
      departmentIds: primary ? [primary, ...departments.filter((d) => d !== primary)] : departments,
      primaryDepartmentId: primary,
      qualifications: validQualifications(person, date),
      rank: currentRank(person, date),
      gender: person.gender,
      employment: person.employment,
      musician: person.musician,
      driverLicenseClasses: readDriverLicense(person.driverLicense).classes.map((c) => c.class),
    };
  }

  /**
   * With `self`, the person's own view: all own data, but without internal notes.
   * Without `masterdata.persons.sensitive`, the sensitive fields (`SENSITIVE_PERSON_FIELDS`) are left out or empty.
   */
  toDto(person: Person, user: AuthenticatedUser, options: { self?: boolean } = {}): PersonDto {
    const sensitive = options.self || this.can(user, SENSITIVE, person);
    const dto: PersonDto = {
      id: person.id,
      personnelNumber: person.personnelNumber ?? null,
      salutation: person.salutation,
      title: person.title,
      firstName: person.firstName,
      lastName: person.lastName,
      nickname: person.nickname,
      street: person.street,
      postalCode: person.postalCode,
      city: person.city,
      phonePrivate: person.phonePrivate,
      phoneMobile: person.phoneMobile,
      phoneWork: person.phoneWork,
      email: person.email,
      gender: person.gender,
      employment: person.employment,
      joinedOn: person.joinedOn ?? null,
      musician: person.musician,
      driverLicense: readDriverLicense(person.driverLicense),
      notes: options.self || !sensitive ? '' : person.notes,
      status: person.status,
      probationEndsOn: person.probationEndsOn ?? null,
      probationDecidedOn: person.probationDecidedOn ?? null,
      admittedOn: person.admittedOn ?? null,
      leftOn: person.leftOn ?? null,
      exitReason: sensitive ? (person.exitReason ?? null) : null,
      rank: currentRank(person),
      memberships: sortBy(person.memberships.getItems(), (m) => m.from).map((m) => ({
        id: m.id,
        departmentId: m.department.id,
        from: m.from,
        to: m.to ?? null,
        primary: m.primary,
      })),
      qualifications: sortBy(person.qualifications.getItems(), (q) => q.acquiredOn).map((q: PersonQualification) => ({
        id: q.id,
        qualification: q.qualification,
        acquiredOn: q.acquiredOn,
        validUntil: q.validUntil ?? null,
        courseAttendanceId: q.courseAttendanceId ?? null,
        notes: q.notes,
      })),
      ranks: sortBy(person.ranks.getItems(), (r) => r.since).map((r: RankAssignment) => ({
        id: r.id,
        rank: r.rank,
        since: r.since,
        notes: r.notes,
      })),
      honors: sortBy(person.honors.getItems(), (h) => h.awardedOn).map((h: HonorAward) => ({
        id: h.id,
        honor: h.honor,
        awardedOn: h.awardedOn,
        notes: h.notes,
      })),
      restPeriods: (sensitive ? sortBy(person.restPeriods.getItems(), (r) => r.from) : []).map((r: RestPeriod) => ({ id: r.id, reason: r.reason, from: r.from, to: r.to ?? null, notes: r.notes })),
      offices: sortBy(person.offices.getItems(), (o) => o.from).map((o: OfficeAssignment) => ({
        id: o.id,
        office: o.office,
        departmentId: o.departmentId ?? null,
        from: o.from,
        to: o.to ?? null,
        notes: o.notes,
      })),
      sensitiveHidden: !sensitive,
      stepUpAvailable: !sensitive && this.needsStepUp(user, SENSITIVE, person),
      anonymizedAt: person.anonymizedAt ? person.anonymizedAt.toISOString() : null,
      processingRestriction: processingRestriction(person),
      privacyInformation: person.privacyInformedOn && person.privacyInformedVia ? { informedOn: person.privacyInformedOn, via: person.privacyInformedVia } : null,
      version: person.version,
    };
    if (sensitive) {
      dto.birthDate = person.birthDate ?? null;
      dto.birthPlace = person.birthPlace;
      // Employer data stored before the IBAN and the assignment existed lacks those fields.
      dto.employer = { name: '', street: '', postalCode: '', city: '', phone: '', contact: '', iban: '', lossOfEarningsAssignedFrom: null, ...person.employer };
      dto.bank = person.bank ?? { iban: '', accountHolder: '' };
    }
    return dto;
  }
}

/** The restriction of processing of the person, `null` if none. */
export function processingRestriction(person: Person): ProcessingRestriction | null {
  return person.restrictedAt && person.restrictionReason
    ? { restrictedAt: person.restrictedAt.toISOString(), reason: person.restrictionReason, until: person.restrictedUntil ?? null, requestId: person.restrictionRequestId ?? null }
    : null;
}

function sortBy<T>(items: T[], key: (item: T) => string): T[] {
  return items.toSorted((a, b) => key(a).localeCompare(key(b)));
}
