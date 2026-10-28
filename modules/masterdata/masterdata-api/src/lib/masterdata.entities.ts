import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type {
  BankAccount,
  DepartmentType,
  DriverLicense,
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
    /** Other names imports match the vehicle by; unique among the vehicles. */
    aliases: p.json<string[]>(),
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
    /** Actual name of the course for collective entries like "other course" (catalog attribute `describe`). */
    description: p.string().default(''),
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
