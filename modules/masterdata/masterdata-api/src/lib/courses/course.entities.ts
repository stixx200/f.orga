import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { LocalizedText } from '@forga/core-contracts';
import type { CourseLevel, CourseResult, NominationStatus } from '@forga/masterdata-contracts';
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
    active: p.boolean().default(true),
    sortOrder: p.integer().default(0),
    version: p.integer().version(),
  },
});
export class Course extends CourseSchema.class {}
CourseSchema.setClass(Course);

export const CourseAttendanceSchema = defineEntity({
  name: 'CourseAttendance',
  schema: 'masterdata',
  tableName: 'course_attendance',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    person: () => p.manyToOne(Person).deleteRule('cascade'),
    course: () => p.manyToOne(Course),
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
    createdAt: p.datetime().onCreate(() => new Date()),
    version: p.integer().version(),
  },
});
export class CourseNomination extends CourseNominationSchema.class {}
CourseNominationSchema.setClass(CourseNomination);
