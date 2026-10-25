import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import type { LocalizedText } from '@forga/core-contracts';
import type { AttendanceStatus, RecordKind, SessionCompensation, SessionStatus } from '@forga/training-contracts';

export const SessionTypeSchema = defineEntity({
  name: 'SessionTypeEntity',
  schema: 'training',
  tableName: 'session_type',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    key: p.string().unique(),
    name: p.json<LocalizedText>(),
    countsForParticipation: p.boolean().default(true),
    compensation: p.string().$type<SessionCompensation>().default('training'),
    record: p.string().$type<RecordKind>().nullable(),
    active: p.boolean().default(true),
    sortOrder: p.integer().default(0),
    version: p.integer().version(),
  },
});
export class SessionTypeEntity extends SessionTypeSchema.class {}
SessionTypeSchema.setClass(SessionTypeEntity);

export const SessionSchema = defineEntity({
  name: 'SessionEntity',
  schema: 'training',
  tableName: 'session',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    type: p.string(),
    title: p.string(),
    startsAt: p.datetime().index(),
    endsAt: p.datetime(),
    stationId: p.string().nullable(),
    departmentIds: p.array().$type<string[]>(),
    responsiblePersonId: p.string().nullable(),
    instructorIds: p.array().$type<string[]>(),
    topic: p.text().default(''),
    goals: p.text().default(''),
    procedure: p.text().default(''),
    material: p.text().default(''),
    status: p.string().$type<SessionStatus>().default('planned'),
    closedAt: p.datetime().nullable(),
    closedBy: p.string().nullable(),
    /** Random code for the QR check-in; created on first request. */
    checkInCode: p.string().nullable().unique(),
    attendance: () => p.oneToMany(AttendanceEntity).mappedBy('session').orphanRemoval(),
    version: p.integer().version(),
  },
});
export class SessionEntity extends SessionSchema.class {}
SessionSchema.setClass(SessionEntity);

export const AttendanceSchema = defineEntity({
  name: 'AttendanceEntity',
  schema: 'training',
  tableName: 'attendance',
  uniques: [{ properties: ['session', 'personId'] }],
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    session: () => p.manyToOne(SessionEntity).deleteRule('cascade'),
    personId: p.string().index(),
    status: p.string().$type<AttendanceStatus>(),
    from: p.datetime().nullable(),
    to: p.datetime().nullable(),
    role: p.string().nullable(),
    breathingApparatus: p.boolean().default(false),
    kilojoules: p.integer().nullable(),
    passed: p.boolean().nullable(),
    injured: p.boolean().default(false),
    checkedInAt: p.datetime().nullable(),
    /** `false` after a QR check-in until someone with the attendance permission saves the list. */
    confirmed: p.boolean().default(true),
    /** Reason of an excuse sent by the member. */
    note: p.text().default(''),
  },
});
export class AttendanceEntity extends AttendanceSchema.class {}
AttendanceSchema.setClass(AttendanceEntity);
