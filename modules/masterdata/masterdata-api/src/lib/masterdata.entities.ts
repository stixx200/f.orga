import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type {
  BankAccount,
  DepartmentType,
  DriverLicense,
  DriverLicenseCheckMethod,
  DriverLicenseClass,
  DriverLicenseTokenKind,
  Employer,
  Employment,
  Gender,
  PersonStatus,
  RestPeriodReason,
  SpecialTask,
  VehicleStatus,
} from '@forga/masterdata-contracts';

// Organization and persons reference each other (department commander, memberships), so they share one file.

export const DepartmentSchema = defineEntity({
  name: 'Department',
  schema: 'masterdata',
  tableName: 'department',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    name: p.string(),
    shortName: p.string(),
    type: p.string().$type<DepartmentType>(),
    parent: () => p.manyToOne(Department).nullable(),
    specialTasks: p.json<SpecialTask[]>(),
    commander: () => p.manyToOne(Person).nullable().deleteRule('set null'),
    /** Person IDs of the deputies, in order of representation. */
    deputyIds: p.json<string[]>(),
    /** `null` = default of the department type. */
    statisticsRelevant: p.boolean().nullable(),
    /** Inhabitants of the district; `null` = those of the municipality. */
    population: p.integer().nullable(),
    version: p.integer().version(),
  },
});
export class Department extends DepartmentSchema.class {}
DepartmentSchema.setClass(Department);

export const StationSchema = defineEntity({
  name: 'Station',
  schema: 'masterdata',
  tableName: 'station',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    name: p.string(),
    department: () => p.manyToOne(Department),
    street: p.string().default(''),
    postalCode: p.string().default(''),
    city: p.string().default(''),
    permanentlyStaffed: p.boolean().default(false),
    notes: p.text().default(''),
    version: p.integer().version(),
  },
});
export class Station extends StationSchema.class {}
StationSchema.setClass(Station);

export const VehicleSchema = defineEntity({
  name: 'Vehicle',
  schema: 'masterdata',
  tableName: 'vehicle',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    designation: p.string(),
    radioCallSign: p.string().default(''),
    licensePlate: p.string().default(''),
    /** Key of a `vehicle-type` catalog entry. */
    vehicleType: p.string(),
    department: () => p.manyToOne(Department),
    station: () => p.manyToOne(Station).nullable().deleteRule('set null'),
    seats: p.integer(),
    yearBuilt: p.integer().nullable(),
    commissionedOn: p.date().nullable(),
    decommissionedOn: p.date().nullable(),
    costRecoveryCategory: p.string().nullable(),
    statisticsCategory: p.string(),
    status: p.string().$type<VehicleStatus>().default('in-service'),
    notes: p.text().default(''),
    version: p.integer().version(),
  },
});
export class Vehicle extends VehicleSchema.class {}
VehicleSchema.setClass(Vehicle);

export const PersonSchema = defineEntity({
  name: 'Person',
  schema: 'masterdata',
  tableName: 'person',
  indexes: [{ properties: ['lastName', 'firstName'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    personnelNumber: p.string().nullable().unique(),
    salutation: p.string().default(''),
    title: p.string().default(''),
    firstName: p.string(),
    lastName: p.string(),
    nickname: p.string().default(''),
    street: p.string().default(''),
    postalCode: p.string().default(''),
    city: p.string().default(''),
    phonePrivate: p.string().default(''),
    phoneMobile: p.string().default(''),
    phoneWork: p.string().default(''),
    email: p.string().default(''),
    birthDate: p.date().nullable(),
    birthPlace: p.string().default(''),
    gender: p.string().$type<Gender>().default('unspecified'),
    employment: p.string().$type<Employment>().default('volunteer'),
    employer: p.json<Employer>().nullable(),
    bank: p.json<BankAccount>().nullable(),
    joinedOn: p.date().nullable(),
    status: p.string().$type<PersonStatus>(),
    probationEndsOn: p.date().nullable(),
    probationDecidedOn: p.date().nullable(),
    admittedOn: p.date().nullable(),
    leftOn: p.date().nullable(),
    exitReason: p.string().nullable(),
    musician: p.boolean().default(false),
    driverLicense: p.json<DriverLicense>(),
    notes: p.text().default(''),
    /** Set when the person was anonymised after leaving (data protection). */
    anonymizedAt: p.datetime().nullable(),
    /** Set when the person file was anonymised (retention plan); name, memberships and ranks may stay longer. */
    fileAnonymizedAt: p.datetime().nullable(),
    memberships: () => p.oneToMany(Membership).mappedBy('person').orphanRemoval(),
    qualifications: () => p.oneToMany(PersonQualification).mappedBy('person').orphanRemoval(),
    ranks: () => p.oneToMany(RankAssignment).mappedBy('person').orphanRemoval(),
    honors: () => p.oneToMany(HonorAward).mappedBy('person').orphanRemoval(),
    offices: () => p.oneToMany(OfficeAssignment).mappedBy('person').orphanRemoval(),
    restPeriods: () => p.oneToMany(RestPeriod).mappedBy('person').orphanRemoval(),
    version: p.integer().version(),
  },
});
export class Person extends PersonSchema.class {}
PersonSchema.setClass(Person);

export const MembershipSchema = defineEntity({
  name: 'Membership',
  schema: 'masterdata',
  tableName: 'membership',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    person: () => p.manyToOne(Person).deleteRule('cascade'),
    department: () => p.manyToOne(Department),
    from: p.date(),
    to: p.date().nullable(),
    primary: p.boolean().default(false),
  },
});
export class Membership extends MembershipSchema.class {}
MembershipSchema.setClass(Membership);

export const PersonQualificationSchema = defineEntity({
  name: 'PersonQualification',
  schema: 'masterdata',
  tableName: 'person_qualification',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    person: () => p.manyToOne(Person).deleteRule('cascade'),
    /** Key of a `qualification` catalog entry. */
    qualification: p.string(),
    acquiredOn: p.date(),
    validUntil: p.date().nullable(),
    /** Set when the qualification comes from a passed course; no foreign key to keep entities independent. */
    courseAttendanceId: p.string().nullable(),
    notes: p.text().default(''),
  },
});
export class PersonQualification extends PersonQualificationSchema.class {}
PersonQualificationSchema.setClass(PersonQualification);

export const RankAssignmentSchema = defineEntity({
  name: 'RankAssignment',
  schema: 'masterdata',
  tableName: 'rank_assignment',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    person: () => p.manyToOne(Person).deleteRule('cascade'),
    /** Key of a `rank` catalog entry. */
    rank: p.string(),
    since: p.date(),
    notes: p.text().default(''),
  },
});
export class RankAssignment extends RankAssignmentSchema.class {}
RankAssignmentSchema.setClass(RankAssignment);

export const HonorAwardSchema = defineEntity({
  name: 'HonorAward',
  schema: 'masterdata',
  tableName: 'honor_award',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    person: () => p.manyToOne(Person).deleteRule('cascade'),
    /** Key of an `honor` catalog entry. */
    honor: p.string(),
    awardedOn: p.date(),
    notes: p.text().default(''),
  },
});
export class HonorAward extends HonorAwardSchema.class {}
HonorAwardSchema.setClass(HonorAward);

export const OfficeAssignmentSchema = defineEntity({
  name: 'OfficeAssignment',
  schema: 'masterdata',
  tableName: 'office_assignment',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    person: () => p.manyToOne(Person).deleteRule('cascade'),
    /** Key of an `office` catalog entry. */
    office: p.string(),
    /** `null` = the whole brigade (e.g. commander). No foreign key, a department may be deleted later. */
    departmentId: p.string().nullable(),
    from: p.date(),
    to: p.date().nullable(),
    notes: p.text().default(''),
  },
});
export class OfficeAssignment extends OfficeAssignmentSchema.class {}
OfficeAssignmentSchema.setClass(OfficeAssignment);

export const RestPeriodSchema = defineEntity({
  name: 'RestPeriod',
  schema: 'masterdata',
  tableName: 'rest_period',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    person: () => p.manyToOne(Person).deleteRule('cascade'),
    reason: p.string().$type<RestPeriodReason>(),
    from: p.date(),
    to: p.date().nullable(),
    notes: p.text().default(''),
  },
});
export class RestPeriod extends RestPeriodSchema.class {}
RestPeriodSchema.setClass(RestPeriod);

/**
 * Proof that a driving licence was presented (or confirmed at a self-check). Never changed, only cancelled with a
 * reason, so the proof for the municipality stays complete. No copy, photo or licence number is stored.
 */
export const DriverLicenseCheckSchema = defineEntity({
  name: 'DriverLicenseCheck',
  schema: 'masterdata',
  tableName: 'driver_license_check',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    person: () => p.manyToOne(Person).deleteRule('cascade'),
    checkedOn: p.date(),
    method: p.string().$type<DriverLicenseCheckMethod>(),
    /** Examining person; `null` at self-checks and for old data. */
    checkedBy: () => p.manyToOne(Person).nullable().deleteRule('set null'),
    originalPresented: p.boolean().default(false),
    /** Classes found at the check (empty at self-checks). */
    classes: p.json<DriverLicenseClass[]>(),
    /** Self-declaration confirmed at a self-check, in the language of the screen. */
    selfDeclaration: p.text().default(''),
    terminalId: p.string().nullable(),
    /** Name of the info terminal of a self-check. */
    device: p.string().default(''),
    /** Request to present the licence again that this check settled. */
    requestId: p.string().nullable(),
    note: p.text().default(''),
    recordedAt: p.datetime(),
    cancelledAt: p.datetime().nullable(),
    cancelledBy: p.string().nullable(),
    cancelReason: p.text().nullable(),
  },
});
export class DriverLicenseCheck extends DriverLicenseCheckSchema.class {}
DriverLicenseCheckSchema.setClass(DriverLicenseCheck);

/** Request to present the licence again for a concrete reason; settled by the next check or withdrawn. */
export const DriverLicenseRequestSchema = defineEntity({
  name: 'DriverLicenseRequest',
  schema: 'masterdata',
  tableName: 'driver_license_request',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    person: () => p.manyToOne(Person).deleteRule('cascade'),
    reason: p.text(),
    dueOn: p.date(),
    requestedAt: p.datetime(),
    /** Display name of the requesting user. */
    requestedBy: p.string(),
    completedByCheckId: p.string().nullable(),
    withdrawnAt: p.datetime().nullable(),
    withdrawnBy: p.string().nullable(),
    withdrawReason: p.text().nullable(),
  },
});
export class DriverLicenseRequest extends DriverLicenseRequestSchema.class {}
DriverLicenseRequestSchema.setClass(DriverLicenseRequest);

/**
 * NFC or barcode sticker on the licence of a person for self-checks. Only an HMAC of the ID is stored (`codeHash`,
 * hidden from the history), plus the last characters to recognise the sticker. At most one active sticker per person.
 */
export const DriverLicenseTokenSchema = defineEntity({
  name: 'DriverLicenseToken',
  schema: 'masterdata',
  tableName: 'driver_license_token',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    person: () => p.manyToOne(Person).deleteRule('cascade'),
    kind: p.string().$type<DriverLicenseTokenKind>(),
    codeHash: p.string().index().hidden(),
    suffix: p.string(),
    registeredAt: p.datetime(),
    registeredBy: p.string(),
    revokedAt: p.datetime().nullable(),
    revokedBy: p.string().nullable(),
    revokeReason: p.text().nullable(),
  },
});
export class DriverLicenseToken extends DriverLicenseTokenSchema.class {}
DriverLicenseTokenSchema.setClass(DriverLicenseToken);
