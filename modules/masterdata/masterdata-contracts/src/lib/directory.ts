import type { CatalogEntry, CatalogKind } from './catalog.js';
import type { Department } from './department.js';
import type { Employment, Gender, PersonStatus, PersonSummary } from './person.js';
import type { Station } from './station.js';
import type { Vehicle } from './vehicle.js';

/**
 * Read interfaces of the masterdata module for other modules.
 * Inject them by token, e.g. `@Inject(PERSON_DIRECTORY) persons: PersonDirectory`.
 */
export const PERSON_DIRECTORY = 'masterdata.PersonDirectory';
export const ORGANIZATION = 'masterdata.Organization';
export const ORGANIZATION_REFERENCES = 'masterdata.OrganizationReferences';

/** A person as of a given date, with what other modules usually need to check. */
export interface PersonSnapshot {
  id: string;
  firstName: string;
  lastName: string;
  status: PersonStatus;
  birthDate: string | null;
  /** Departments with a membership on the date; the primary one first. */
  departmentIds: string[];
  primaryDepartmentId: string | null;
  /** Qualification keys valid on the date. */
  qualifications: string[];
  rank: string | null;
  gender: Gender;
  employment: Employment;
  musician: boolean;
  driverLicenseClasses: string[];
}

export interface PersonDirectory {
  /** Search by name or personnel number among non-left persons. */
  search(query: string, options?: { departmentIds?: string[]; limit?: number }): Promise<PersonSummary[]>;
  /** Snapshots of the persons on the date (default: today); unknown IDs are omitted. */
  snapshots(ids: readonly string[], date?: string): Promise<PersonSnapshot[]>;
  findByPersonnelNumber(personnelNumber: string): Promise<PersonSummary | null>;
  /** Summaries (with e-mail and phone) of the given persons, e.g. to notify them; unknown IDs are omitted. */
  summaries(ids: readonly string[]): Promise<PersonSummary[]>;
  /** Snapshots of all persons with a membership on the date, e.g. for the annual statistics. */
  membersOn(date: string): Promise<PersonSnapshot[]>;
  /** Names and membership periods of all persons, e.g. to match names on many dates in an import. */
  memberPeriods(): Promise<MemberPeriods[]>;
  /** Bank account and employer for payouts (sensitive: only for the server, never passed to the UI as is). */
  paymentDetails(ids: readonly string[]): Promise<PaymentDetails[]>;
  /** Career data for promotions; without IDs all persons who have not left. */
  careers(ids?: readonly string[]): Promise<PersonCareer[]>;
  /** Offices held (also past ones), e.g. for function allowances; optionally only of these offices. */
  offices(filter?: { offices?: readonly string[] }): Promise<OfficeHolding[]>;
  /** Records a promotion in the person file (rank history). */
  recordPromotion(personId: string, promotion: { rank: string; since: string; notes: string }): Promise<void>;
}

export interface MemberPeriods {
  id: string;
  firstName: string;
  lastName: string;
  periods: { from: string; to: string | null }[];
}

/** Persons of `memberPeriods()` with a membership on the date. */
export const membersOnDate = (persons: readonly MemberPeriods[], date: string) =>
  persons.filter((p) => p.periods.some((m) => m.from <= date && (!m.to || m.to >= date)));

export interface PersonCareer {
  id: string;
  firstName: string;
  lastName: string;
  status: PersonStatus;
  primaryDepartmentId: string | null;
  departmentIds: string[];
  joinedOn: string | null;
  probationEndsOn: string | null;
  musician: boolean;
  /** Rank history, oldest first. */
  ranks: { rank: string; since: string }[];
  /** Qualifications with the date acquired (also expired ones). */
  qualifications: { qualification: string; acquiredOn: string }[];
  /** Offices held, also past ones. */
  offices: { office: string; departmentId: string | null; from: string; to: string | null }[];
  /** Periods that do not count as service time (dormant membership, service in another brigade). */
  restPeriods: { from: string; to: string | null }[];
}

/** An office held by a person for a period. */
export interface OfficeHolding {
  personId: string;
  office: string;
  departmentId: string | null;
  from: string;
  to: string | null;
}

export interface PaymentDetails {
  id: string;
  firstName: string;
  lastName: string;
  street: string;
  postalCode: string;
  city: string;
  iban: string;
  accountHolder: string;
  employerName: string;
  employerIban: string;
  /** From this date the loss of earnings is paid to the employer; `null` = to the person. */
  lossOfEarningsAssignedFrom: string | null;
}

export interface Organization {
  departments(): Promise<Department[]>;
  stations(): Promise<Station[]>;
  vehicles(options?: { includeRetired?: boolean }): Promise<Vehicle[]>;
  /** Catalog entries of a kind in their order, e.g. the ranks. */
  catalog(kind: CatalogKind): Promise<CatalogEntry[]>;
}

export type OrganizationObject = 'department' | 'station' | 'vehicle';

/**
 * Other modules report how often they reference a department, station or vehicle,
 * so the masterdata module deletes only objects nothing refers to.
 * Register in `onModuleInit`: `references.register('incidents', (kind, id) => …count…)`.
 */
export interface OrganizationReferences {
  register(module: string, count: (kind: OrganizationObject, id: string) => Promise<number>): void;
}

/**
 * Other modules report what a person still holds (e.g. personal protective equipment of the clothing store).
 * Leaving the brigade and the transfer to the veterans are refused while anything is held.
 */
export const PERSON_HOLDINGS = 'masterdata.PersonHoldings';

export interface PersonHoldings {
  register(module: string, count: (personId: string) => Promise<number>): void;
}

/** Domain events published by the masterdata module after the change is committed. */
export const MASTERDATA_EVENTS = {
  personLeft: 'masterdata.person.left',
  qualificationChanged: 'masterdata.person.qualification-changed',
  coursePassed: 'masterdata.course.passed',
} as const;

export interface PersonLeftEvent {
  personId: string;
  leftOn: string;
  exitReason: string;
}

export interface QualificationChangedEvent {
  personId: string;
  qualification: string;
}

export interface CoursePassedEvent {
  personId: string;
  course: string;
  /** Name of the course (German), e.g. for compensation items. */
  courseName: string;
  /** End of the course (or its start), `YYYY-MM-DD`. */
  passedOn: string;
  attendanceId: string;
}
