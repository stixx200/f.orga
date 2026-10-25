import { z } from 'zod';
import { LocalizedText } from '@forga/core-contracts';
import { PersonSummary } from './person.js';

export const CourseLevel = z.enum(['municipal', 'district', 'state-school']);
export type CourseLevel = z.infer<typeof CourseLevel>;

/** A course of the course catalog; only administrators maintain it. */
export const CourseInput = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: LocalizedText,
  level: CourseLevel,
  /** Qualification keys a person gets when passing the course. */
  grantsQualifications: z.array(z.string()).default([]),
  /** Course keys that must have been passed before. */
  prerequisites: z.array(z.string()).default([]),
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
  active: z.boolean(),
  sortOrder: z.number(),
  version: z.number(),
});
export type Course = z.infer<typeof Course>;

export const CourseResult = z.enum(['passed', 'failed']);
export type CourseResult = z.infer<typeof CourseResult>;

export const CourseAttendanceInput = z.object({
  course: z.string().min(1),
  startsOn: z.iso.date(),
  endsOn: z.iso.date().nullable().default(null),
  result: CourseResult,
  location: z.string().trim().default(''),
  notes: z.string().default(''),
});
export type CourseAttendanceInput = z.input<typeof CourseAttendanceInput>;

export const CourseAttendance = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  course: z.string(),
  startsOn: z.string(),
  endsOn: z.string().nullable(),
  result: CourseResult,
  location: z.string(),
  notes: z.string(),
});
export type CourseAttendance = z.infer<typeof CourseAttendance>;

export const NominationStatus = z.enum(['nominated', 'registered', 'confirmed', 'rejected', 'completed']);
export type NominationStatus = z.infer<typeof NominationStatus>;

export const CourseNominationInput = z.object({
  personId: z.uuid(),
  course: z.string().min(1),
  /** 1 = high. */
  priority: z.number().int().min(1).max(3).default(2),
  desiredPeriod: z.string().trim().default(''),
  status: NominationStatus.default('nominated'),
  notes: z.string().default(''),
});
export type CourseNominationInput = z.input<typeof CourseNominationInput>;

export const CourseNomination = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  course: z.string(),
  priority: z.number(),
  desiredPeriod: z.string(),
  status: NominationStatus,
  notes: z.string(),
  createdAt: z.string(),
  version: z.number(),
});
export type CourseNomination = z.infer<typeof CourseNomination>;

/** Central course planning: nominations across departments and candidates who are not nominated yet. */
export const CoursePlanning = z.object({
  course: Course,
  nominations: z.array(
    z.object({ nomination: CourseNomination, person: PersonSummary, prerequisitesMet: z.boolean() }),
  ),
  /** Persons who meet the prerequisites, have not passed the course and are not nominated. */
  candidates: z.array(PersonSummary),
});
export type CoursePlanning = z.infer<typeof CoursePlanning>;
