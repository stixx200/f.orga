import { z } from 'zod';
import type { DepartmentType } from './department.js';
import { DriverLicense } from './driver-license.js';
import { isValidIban, normalizeIban } from './iban.js';

export const Gender = z.enum(['female', 'male', 'diverse', 'unspecified']);
export type Gender = z.infer<typeof Gender>;

/** Employment relationship as asked in the annual statistics (F14–F18, F25). */
export const Employment = z.enum([
  'volunteer',
  'career-higher',
  'career-elevated',
  'career-intermediate',
  'fire-service-employee',
  'administration-employee',
]);
export type Employment = z.infer<typeof Employment>;

export const PersonStatus = z.enum(['probation', 'active', 'passive', 'youth', 'veterans', 'left']);
export type PersonStatus = z.infer<typeof PersonStatus>;

/**
 * Statuses that fit the type of the primary department: youth and children's departments hold youth members,
 * veterans departments veterans, all others members in probation, active or passive.
 * Moving between youth, operational and veterans happens only through the transfers.
 */
export const STATUSES_BY_DEPARTMENT_TYPE: Record<DepartmentType, readonly Exclude<PersonStatus, 'left'>[]> = {
  youth: ['youth'],
  children: ['youth'],
  veterans: ['veterans'],
  operational: ['probation', 'active', 'passive'],
  command: ['probation', 'active', 'passive'],
  'special-service': ['probation', 'active', 'passive'],
  music: ['probation', 'active', 'passive'],
};

const date = z.iso.date();
const text = z.string().trim().default('');

/** An IBAN (spaces allowed) with valid check digits, stored without spaces; empty = none. */
export const Iban = z
  .string()
  .trim()
  .transform(normalizeIban)
  .refine((iban) => iban === '' || isValidIban(iban), { message: 'Invalid IBAN', params: { code: 'masterdata.invalidIban' } });

export const Employer = z.object({
  name: text,
  street: text,
  postalCode: text,
  city: text,
  phone: text,
  contact: text,
  /** Account of the employer, for an assigned loss of earnings. */
  iban: Iban.default(''),
  /** From this date the loss of earnings is assigned to the employer and paid to the employer (statute). */
  lossOfEarningsAssignedFrom: z.iso.date().nullable().default(null),
});
export type Employer = z.infer<typeof Employer>;

export const BankAccount = z.object({
  iban: Iban,
  accountHolder: text,
});
export type BankAccount = z.infer<typeof BankAccount>;

/**
 * Fields that need the permission `masterdata.persons.sensitive`: birth data, employer and bank account, and the
 * internal notes, the exit reason and the rest periods (e.g. dormant membership), which may reveal personal circumstances.
 */
export const SENSITIVE_PERSON_FIELDS = ['birthDate', 'birthPlace', 'employer', 'bank', 'notes', 'exitReason', 'restPeriods'] as const;

/** Master data of a person that is edited as a whole. */
export const PersonInput = z.object({
  /** Version the client loaded (optimistic locking). */
  version: z.number().int().optional(),
  personnelNumber: z.string().trim().nullable().default(null),
  salutation: text,
  title: text,
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1),
  nickname: text,
  street: text,
  postalCode: text,
  city: text,
  phonePrivate: text,
  phoneMobile: text,
  phoneWork: text,
  email: z.union([z.email(), z.literal('')]).default(''),
  gender: Gender.default('unspecified'),
  employment: Employment.default('volunteer'),
  joinedOn: date.nullable().default(null),
  musician: z.boolean().default(false),
  notes: z.string().default(''),
  /** Sensitive; ignored when the user lacks `masterdata.persons.sensitive`. */
  birthDate: date.nullable().optional(),
  birthPlace: z.string().trim().optional(),
  employer: Employer.optional(),
  bank: BankAccount.optional(),
});
export type PersonInput = z.input<typeof PersonInput>;

export const MembershipInput = z.object({
  departmentId: z.uuid(),
  from: date,
  to: date.nullable().default(null),
  /** Exactly one current membership is the primary one (compensation is grouped by it). */
  primary: z.boolean().default(false),
});
export type MembershipInput = z.input<typeof MembershipInput>;

export const CreatePersonInput = PersonInput.extend({
  status: PersonStatus.exclude(['left']).default('probation'),
  memberships: z.array(MembershipInput).min(1),
});
export type CreatePersonInput = z.input<typeof CreatePersonInput>;

export const Membership = z.object({
  id: z.uuid(),
  departmentId: z.uuid(),
  from: z.string(),
  to: z.string().nullable(),
  primary: z.boolean(),
});
export type Membership = z.infer<typeof Membership>;

export const PersonQualificationInput = z.object({
  qualification: z.string().min(1),
  acquiredOn: date,
  /** `null` = computed from the validity of the catalog entry. */
  validUntil: date.nullable().default(null),
  notes: z.string().default(''),
});
export type PersonQualificationInput = z.input<typeof PersonQualificationInput>;

export const PersonQualification = z.object({
  id: z.uuid(),
  qualification: z.string(),
  acquiredOn: z.string(),
  validUntil: z.string().nullable(),
  /** Set when the qualification comes from a passed course. */
  courseAttendanceId: z.uuid().nullable(),
  notes: z.string(),
});
export type PersonQualification = z.infer<typeof PersonQualification>;

export const RankAssignmentInput = z.object({ rank: z.string().min(1), since: date, notes: z.string().default('') });
export type RankAssignmentInput = z.input<typeof RankAssignmentInput>;

export const RankAssignment = z.object({ id: z.uuid(), rank: z.string(), since: z.string(), notes: z.string() });
export type RankAssignment = z.infer<typeof RankAssignment>;

/** An office held for a period, in a department or for the whole brigade (`departmentId` null). */
export const OfficeAssignmentInput = z
  .object({ office: z.string().min(1), departmentId: z.uuid().nullable().default(null), from: date, to: date.nullable().default(null), notes: z.string().default('') })
  .refine((o) => !o.to || o.to >= o.from, { message: 'End before start', path: ['to'] });
export type OfficeAssignmentInput = z.input<typeof OfficeAssignmentInput>;

export const OfficeAssignment = z.object({ id: z.uuid(), office: z.string(), departmentId: z.uuid().nullable(), from: z.string(), to: z.string().nullable(), notes: z.string() });
export type OfficeAssignment = z.infer<typeof OfficeAssignment>;

/** A period that does not count as service time (promotions): dormant membership or service in another brigade. */
export const RestPeriodReason = z.enum(['dormant', 'other-brigade']);
export type RestPeriodReason = z.infer<typeof RestPeriodReason>;
export const RestPeriodInput = z
  .object({ reason: RestPeriodReason, from: date, to: date.nullable().default(null), notes: z.string().default('') })
  .refine((r) => !r.to || r.to >= r.from, { message: 'End before start', path: ['to'] });
export type RestPeriodInput = z.input<typeof RestPeriodInput>;
export const RestPeriod = z.object({ id: z.uuid(), reason: RestPeriodReason, from: z.string(), to: z.string().nullable(), notes: z.string() });
export type RestPeriod = z.infer<typeof RestPeriod>;

export const HonorAwardInput = z.object({ honor: z.string().min(1), awardedOn: date, notes: z.string().default('') });
export type HonorAwardInput = z.input<typeof HonorAwardInput>;

export const HonorAward = z.object({ id: z.uuid(), honor: z.string(), awardedOn: z.string(), notes: z.string() });
export type HonorAward = z.infer<typeof HonorAward>;

/** Shortening or extending the probation, e.g. after youth fire brigade membership. */
export const ProbationChange = z.object({
  probationEndsOn: date,
  reason: z.string().trim().min(1),
  decidedOn: date.nullable().default(null),
});
export type ProbationChange = z.input<typeof ProbationChange>;

/**
 * Final admission after the probation. Before the end of the probation or while qualifications of the probation
 * (settings) are missing, the admission needs a reason (`masterdata.admissionReasonRequired`), like a shortened probation.
 */
export const Admission = z.object({ decidedOn: date, reason: z.string().trim().max(500).default('') });
export type Admission = z.input<typeof Admission>;

/** Status change other than admission and leaving, e.g. active → veterans. */
export const StatusChange = z.object({ status: z.enum(['active', 'passive', 'youth', 'veterans']), effectiveOn: date });
export type StatusChange = z.infer<typeof StatusChange>;

/**
 * Transfer from the youth brigade into an operational department (fire brigade statute): the youth membership ends,
 * the operational one starts on `on` with a probation that may be shortened or waived with a reason.
 */
export const TransferToOperational = z
  .object({
    departmentId: z.uuid(),
    on: date,
    /** End of the probation; `null` = waived because of the youth membership, the person is admitted directly. */
    probationEndsOn: date.nullable(),
    /** Required when the probation is shortened or waived. */
    reason: z.string().trim().max(500).default(''),
    /** Decision of the body named in the settings (e.g. Feuerwehrausschuss). */
    decidedOn: date.nullable().default(null),
  })
  .refine((t) => t.probationEndsOn === null || t.probationEndsOn >= t.on, { message: 'Probation ends before the transfer', path: ['probationEndsOn'] });
export type TransferToOperational = z.input<typeof TransferToOperational>;

/** Transfer to the veterans (fire brigade statute): operational and command memberships end, the rank stays. */
export const TransferToVeterans = z.object({ departmentId: z.uuid(), on: date, decidedOn: date.nullable().default(null) });
export type TransferToVeterans = z.input<typeof TransferToVeterans>;

export const Leave = z.object({ leftOn: date, exitReason: z.string().min(1) });
export type Leave = z.infer<typeof Leave>;

export const PersonSummary = z.object({
  id: z.uuid(),
  personnelNumber: z.string().nullable(),
  firstName: z.string(),
  lastName: z.string(),
  status: PersonStatus,
  rank: z.string().nullable(),
  primaryDepartmentId: z.uuid().nullable(),
  departmentIds: z.array(z.uuid()),
  /** Keys of currently valid qualifications. */
  qualifications: z.array(z.string()),
  phoneMobile: z.string(),
  email: z.string(),
  /** Only in the person directory (`masterdata.persons.directory`): name, status and departments, everything else empty. */
  restricted: z.boolean().optional(),
});
export type PersonSummary = z.infer<typeof PersonSummary>;

export const Person = z.object({
  id: z.uuid(),
  personnelNumber: z.string().nullable(),
  salutation: z.string(),
  title: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  nickname: z.string(),
  street: z.string(),
  postalCode: z.string(),
  city: z.string(),
  phonePrivate: z.string(),
  phoneMobile: z.string(),
  phoneWork: z.string(),
  email: z.string(),
  gender: Gender,
  employment: Employment,
  joinedOn: z.string().nullable(),
  musician: z.boolean(),
  /** Classes are changed by recording a check (`masterdata.licenses.check`), not with the person. */
  driverLicense: DriverLicense,
  /** Sensitive: empty without `masterdata.persons.sensitive`. */
  notes: z.string(),
  status: PersonStatus,
  probationEndsOn: z.string().nullable(),
  probationDecidedOn: z.string().nullable(),
  admittedOn: z.string().nullable(),
  leftOn: z.string().nullable(),
  /** Sensitive: `null` without `masterdata.persons.sensitive`. */
  exitReason: z.string().nullable(),
  rank: z.string().nullable(),
  memberships: z.array(Membership),
  qualifications: z.array(PersonQualification),
  ranks: z.array(RankAssignment),
  honors: z.array(HonorAward),
  offices: z.array(OfficeAssignment),
  /** Sensitive: empty without `masterdata.persons.sensitive`. */
  restPeriods: z.array(RestPeriod),
  /** `true` if sensitive fields were left out because the permission is missing. */
  sensitiveHidden: z.boolean(),
  /** Set when the person was anonymised after leaving. */
  anonymizedAt: z.string().nullable(),
  birthDate: z.string().nullable().optional(),
  birthPlace: z.string().optional(),
  employer: Employer.optional(),
  bank: BankAccount.optional(),
  version: z.number().int(),
});
export type Person = z.infer<typeof Person>;

/** What members change themselves in "My area": contact details and bank account. */
export const SelfContactInput = z.object({
  version: z.number().int(),
  street: text,
  postalCode: text,
  city: text,
  phonePrivate: text,
  phoneMobile: text,
  phoneWork: text,
  email: z.union([z.email(), z.literal('')]).default(''),
  bank: BankAccount.optional(),
});
export type SelfContactInput = z.input<typeof SelfContactInput>;
