import { z } from 'zod';
import { LocalizedText } from '@forga/core-contracts';
import { PersonStatus, PersonSummary } from './person.js';

export const CourseLevel = z.enum(['municipal', 'district', 'state-school']);
export type CourseLevel = z.infer<typeof CourseLevel>;

/** Statuses whose members may attend a course unless the course says otherwise. */
export const DEFAULT_COURSE_STATUSES: readonly Exclude<PersonStatus, 'left'>[] = ['probation', 'active'];

const date = z.iso.date();
/** Course dates: not before 1900 (typos such as 0202 instead of 2020). */
const courseDate = date.refine((d) => d >= '1900-01-01', { message: 'Before 1900' });

/** A course of the course catalog; only administrators maintain it. */
export const CourseInput = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: LocalizedText,
  level: CourseLevel,
  /** Qualification keys a person gets when passing the course. */
  grantsQualifications: z.array(z.string()).default([]),
  /** Course keys that must have been passed before. */
  prerequisites: z.array(z.string()).default([]),
  /** Further conditions: qualification keys that must be valid (e.g. a medical examination). */
  requiredQualifications: z.array(z.string()).default([]),
  /** Minimum age at the start of the course; `null` = none. */
  minimumAge: z.number().int().min(0).max(99).nullable().default(null),
  /** Statuses of persons who may attend, e.g. also `youth` for basic training part 1. */
  allowedStatuses: z.array(PersonStatus.exclude(['left'])).min(1).default([...DEFAULT_COURSE_STATUSES]),
  /** Target number of persons with the course per department (`departmentId → count`), for the course needs. */
  targets: z.record(z.uuid(), z.number().int().min(0).max(999)).default({}),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
});
export type CourseInput = z.input<typeof CourseInput>;

export const Course = z.object({
  id: z.uuid(),
  key: z.string(),
  name: LocalizedText,
  level: CourseLevel,
  grantsQualifications: z.array(z.string()),
  prerequisites: z.array(z.string()),
  requiredQualifications: z.array(z.string()),
  minimumAge: z.number().nullable(),
  allowedStatuses: z.array(PersonStatus),
  targets: z.record(z.string(), z.number()),
  active: z.boolean(),
  sortOrder: z.number(),
  version: z.number(),
});
export type Course = z.infer<typeof Course>;

export const CourseResult = z.enum(['passed', 'failed']);
export type CourseResult = z.infer<typeof CourseResult>;

/**
 * End not before the start. Checked on the server against today and the person: a passed course must have ended
 * (`masterdata.courseNotFinished`), no course starts in the future (`masterdata.attendanceInFuture`) or before the birth
 * (`masterdata.dateBeforeBirth`). Whoever holds all qualifications of the course already (e.g. imported or entered by
 * hand) is recorded only with `confirmHeld` (`masterdata.qualificationsHeld`); then no qualification is added twice
 * and no `masterdata.course.passed` is published (so no second course allowance).
 */
export const CourseAttendanceInput = z
  .object({
    course: z.string().min(1),
    startsOn: courseDate,
    endsOn: courseDate.nullable().default(null),
    result: CourseResult,
    location: z.string().trim().default(''),
    notes: z.string().default(''),
    confirmHeld: z.boolean().default(false),
  })
  .refine((a) => !a.endsOn || a.endsOn >= a.startsOn, { message: 'End before start', path: ['endsOn'] });
export type CourseAttendanceInput = z.input<typeof CourseAttendanceInput>;

export const CourseAttendance = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  course: z.string(),
  /** Course run the attendance was recorded for, if any. */
  runId: z.uuid().nullable(),
  startsOn: z.string(),
  endsOn: z.string().nullable(),
  result: CourseResult,
  location: z.string(),
  notes: z.string(),
});
export type CourseAttendance = z.infer<typeof CourseAttendance>;

/** `completed` (passed) and `failed` are set only by recording an attendance; deleting it reopens the nomination. */
export const NominationStatus = z.enum(['nominated', 'registered', 'confirmed', 'rejected', 'completed', 'failed']);
export type NominationStatus = z.infer<typeof NominationStatus>;

/** Statuses of an open nomination, i.e. one still waiting for the course. */
export const OPEN_NOMINATION_STATUSES = ['nominated', 'registered', 'confirmed'] as const;
/** Statuses the planners set by hand. */
export const PlannedNominationStatus = z.enum(['nominated', 'registered', 'confirmed', 'rejected']);
export type PlannedNominationStatus = z.infer<typeof PlannedNominationStatus>;

export const CourseNominationInput = z.object({
  personId: z.uuid(),
  course: z.string().min(1),
  /** 1 = high. */
  priority: z.number().int().min(1).max(3).default(2),
  desiredPeriod: z.string().trim().default(''),
  /** `completed` and `failed` are refused unless unchanged (`masterdata.nominationStatusByAttendance`). */
  status: NominationStatus.default('nominated'),
  notes: z.string().default(''),
  /** Planned course run (date) the person is meant to attend. */
  runId: z.uuid().nullable().default(null),
});
export type CourseNominationInput = z.input<typeof CourseNominationInput>;

/**
 * Nominates several persons at once, optionally for a run and with a status. Persons who cannot be nominated
 * (already nominated, course held, status or prerequisites not met, not visible) are skipped with the reason.
 */
export const BulkNominationInput = z.object({
  course: z.string().min(1),
  personIds: z.array(z.uuid()).min(1).max(500),
  priority: z.number().int().min(1).max(3).default(2),
  desiredPeriod: z.string().trim().default(''),
  runId: z.uuid().nullable().default(null),
  status: z.enum(OPEN_NOMINATION_STATUSES).default('nominated'),
});
export type BulkNominationInput = z.input<typeof BulkNominationInput>;

export const BulkNominationResult = z.object({
  created: z.number(),
  /** Persons skipped with the reason, e.g. `masterdata.alreadyNominated`. */
  skipped: z.array(z.object({ personId: z.string(), code: z.string() })),
});
export type BulkNominationResult = z.infer<typeof BulkNominationResult>;

/** Sets status and/or run of several open nominations; fields left out stay as they are. */
export const BulkNominationUpdate = z
  .object({
    nominationIds: z.array(z.uuid()).min(1).max(500),
    status: PlannedNominationStatus.optional(),
    runId: z.uuid().nullable().optional(),
  })
  .refine((u) => u.status !== undefined || u.runId !== undefined, { message: 'Nothing to change', path: ['status'] });
export type BulkNominationUpdate = z.input<typeof BulkNominationUpdate>;

export const BulkNominationUpdateResult = z.object({
  updated: z.number(),
  /** Nominations not changed with the reason, e.g. `masterdata.nominationStatusByAttendance`. */
  skipped: z.array(z.object({ nominationId: z.string(), code: z.string() })),
});
export type BulkNominationUpdateResult = z.infer<typeof BulkNominationUpdateResult>;

export const CourseNomination = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  course: z.string(),
  priority: z.number(),
  desiredPeriod: z.string(),
  status: NominationStatus,
  notes: z.string(),
  runId: z.uuid().nullable(),
  createdAt: z.string(),
  version: z.number(),
});
export type CourseNomination = z.infer<typeof CourseNomination>;

/**
 * A course run ("Lehrgangstermin"): a course held on given dates, e.g. Truppmann Teil 2 in the municipality or the
 * district course a group of persons is registered for. Nominations can be assigned to it, and the results of all
 * participants are recorded at once.
 */
export const CourseRunInput = z
  .object({
    course: z.string().min(1),
    startsOn: courseDate,
    endsOn: courseDate.nullable().default(null),
    location: z.string().trim().default(''),
    notes: z.string().default(''),
  })
  .refine((r) => !r.endsOn || r.endsOn >= r.startsOn, { message: 'End before start', path: ['endsOn'] });
export type CourseRunInput = z.input<typeof CourseRunInput>;

export const CourseRun = z.object({
  id: z.uuid(),
  course: z.string(),
  startsOn: z.string(),
  endsOn: z.string().nullable(),
  location: z.string(),
  notes: z.string(),
  /** Nominations assigned to the run (visible to the user). */
  nominated: z.number(),
  /** Attendances recorded for the run (visible to the user). */
  recorded: z.number(),
  version: z.number(),
});
export type CourseRun = z.infer<typeof CourseRun>;

/**
 * Results of a course for several persons at once, e.g. all nominations of a run.
 * Persons who did not attend are simply left out; persons with a result for the run already are skipped
 * (`masterdata.resultRecordedAlready`). `confirmHeld` as in `CourseAttendanceInput`.
 */
export const CourseResultsInput = z
  .object({
    course: z.string().min(1),
    /** Dates and location are taken from the run when given. */
    runId: z.uuid().nullable().default(null),
    startsOn: courseDate.nullable().default(null),
    endsOn: courseDate.nullable().default(null),
    location: z.string().trim().default(''),
    results: z.array(z.object({ personId: z.uuid(), result: CourseResult, notes: z.string().default('') })).min(1).max(500),
    confirmHeld: z.boolean().default(false),
  })
  .refine((r) => r.runId !== null || r.startsOn !== null, { message: 'Start or run required', path: ['startsOn'] })
  .refine((r) => !r.endsOn || !r.startsOn || r.endsOn >= r.startsOn, { message: 'End before start', path: ['endsOn'] });
export type CourseResultsInput = z.input<typeof CourseResultsInput>;

export const CourseResultsOutcome = z.object({
  recorded: z.number(),
  /** Persons not recorded with the reason, e.g. `masterdata.coursePassedAlready`. */
  skipped: z.array(z.object({ personId: z.string(), code: z.string() })),
});
export type CourseResultsOutcome = z.infer<typeof CourseResultsOutcome>;

/** Central course planning: nominations across departments and candidates who are not nominated yet. */
export const CoursePlanning = z.object({
  course: Course,
  nominations: z.array(
    /** `prerequisitesMet`: status allowed, conditions met and the course not held yet. */
    z.object({ nomination: CourseNomination, person: PersonSummary, prerequisitesMet: z.boolean() }),
  ),
  /** Persons who meet all conditions of the course, have not passed it and are not nominated. */
  candidates: z.array(PersonSummary),
  runs: z.array(CourseRun),
});
export type CoursePlanning = z.infer<typeof CoursePlanning>;

/**
 * Course needs: per course and department the persons with the course, the target and the open nominations.
 * Only members whose status the course allows count; departments without such members (and without a target) are left out.
 */
export const CourseNeed = z.object({
  course: z.string(),
  departmentId: z.uuid(),
  /** Members with a status allowed for the course who have the course or all its qualifications. */
  have: z.number(),
  target: z.number().nullable(),
  nominated: z.number(),
});
export type CourseNeed = z.infer<typeof CourseNeed>;
