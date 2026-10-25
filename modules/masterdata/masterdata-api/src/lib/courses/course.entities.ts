import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { LocalizedText } from '@forga/core-contracts';
import type { CourseLevel, CourseResult, NominationStatus, PersonStatus } from '@forga/masterdata-contracts';
import { Person } from '../masterdata.entities.js';

export const CourseSchema = defineEntity({
  name: 'Course',
  schema: 'masterdata',
  tableName: 'course',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    key: p.string().unique(),
    name: p.json<LocalizedText>(),
    level: p.string().$type<CourseLevel>(),
    grantsQualifications: p.json<string[]>(),
    prerequisites: p.json<string[]>(),
    /** Qualification keys that must be valid to attend. */
    requiredQualifications: p.json<string[]>(),
    minimumAge: p.integer().nullable(),
    /** Statuses of persons who may attend. */
    allowedStatuses: p.json<PersonStatus[]>(),
    /** Target number of persons with the course per department (`departmentId → count`). */
    targets: p.json<Record<string, number>>(),
    active: p.boolean().default(true),
    sortOrder: p.integer().default(0),
    version: p.integer().version(),
  },
});
export class Course extends CourseSchema.class {}
CourseSchema.setClass(Course);

/** A course held on given dates; nominations can be assigned to it, results are recorded for all participants at once. */
export const CourseRunSchema = defineEntity({
  name: 'CourseRun',
  schema: 'masterdata',
  tableName: 'course_run',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    course: () => p.manyToOne(Course),
    startsOn: p.date(),
    endsOn: p.date().nullable(),
    location: p.string().default(''),
    notes: p.text().default(''),
    version: p.integer().version(),
  },
});
export class CourseRun extends CourseRunSchema.class {}
CourseRunSchema.setClass(CourseRun);

export const CourseAttendanceSchema = defineEntity({
  name: 'CourseAttendance',
  schema: 'masterdata',
  tableName: 'course_attendance',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    person: () => p.manyToOne(Person).deleteRule('cascade'),
    course: () => p.manyToOne(Course),
    run: () => p.manyToOne(CourseRun).nullable().deleteRule('set null'),
    startsOn: p.date(),
    endsOn: p.date().nullable(),
    result: p.string().$type<CourseResult>(),
    location: p.string().default(''),
    notes: p.text().default(''),
  },
});
export class CourseAttendance extends CourseAttendanceSchema.class {}
CourseAttendanceSchema.setClass(CourseAttendance);

export const CourseNominationSchema = defineEntity({
  name: 'CourseNomination',
  schema: 'masterdata',
  tableName: 'course_nomination',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    person: () => p.manyToOne(Person).deleteRule('cascade'),
    course: () => p.manyToOne(Course),
    priority: p.integer().default(2),
    desiredPeriod: p.string().default(''),
    status: p.string().$type<NominationStatus>().default('nominated'),
    notes: p.text().default(''),
    run: () => p.manyToOne(CourseRun).nullable().deleteRule('set null'),
    /** The passed attendance that completed the nomination; deleting it reopens the nomination. */
    attendanceId: p.string().nullable(),
    createdAt: p.datetime().onCreate(() => new Date()),
    version: p.integer().version(),
  },
});
export class CourseNomination extends CourseNominationSchema.class {}
CourseNominationSchema.setClass(CourseNomination);
