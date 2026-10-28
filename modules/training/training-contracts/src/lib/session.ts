import { z } from 'zod';
import { Aliases, LocalizedText } from '@forga/core-contracts';

/**
 * Evidence a session type produces for every person present,
 * taken over by the respiratory protection module.
 */
/** `training-track`: Atemschutzstrecke, a stress exercise with fixed work and duration. */
export const RecordKind = z.enum(['stress-exercise', 'training-track', 'briefing', 'exercise-under-ba', 'chemical-suit-exercise']);
export type RecordKind = z.infer<typeof RecordKind>;

/**
 * How a session type is compensated: like an exercise, with the rate of special services or of fire watches, or not
 * at all.
 */
export const SessionCompensation = z.enum(['training', 'special-service', 'fire-watch', 'none']);
export type SessionCompensation = z.infer<typeof SessionCompensation>;

/**
 * Category of a session type: `training` (Übungsdienst: exercises, lessons), `special-service` (Sonderdienst, e.g.
 * supporting the equipment officer, fire safety education, fire watch) or `other` (e.g. meetings).
 */
export const SessionCategory = z.enum(['training', 'special-service', 'other']);
export type SessionCategory = z.infer<typeof SessionCategory>;

export const SessionTypeInput = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: LocalizedText,
  category: SessionCategory.default('training'),
  /** Counts for the participation rate of a person. */
  countsForParticipation: z.boolean().default(true),
  compensation: SessionCompensation.default('training'),
  record: RecordKind.nullable().default(null),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  /** Other names imports match the type by, e.g. "Übungsdienst" for "Übung". */
  aliases: Aliases,
});
export type SessionTypeInput = z.input<typeof SessionTypeInput>;

export const SessionType = SessionTypeInput.extend({ id: z.uuid(), version: z.number() });
export type SessionType = z.infer<typeof SessionType>;

const t = (key: string, de: string, en: string, extra: Partial<z.input<typeof SessionTypeInput>> = {}, sortOrder = 0): SessionTypeInput => ({ key, name: { de, en }, sortOrder, ...extra });

/**
 * Session types of a volunteer brigade in Baden-Württemberg (template). Special services count for no participation
 * rate and are paid with the special-service rate; the fire watch keeps its own rate.
 */
const special = { category: 'special-service', compensation: 'special-service', countsForParticipation: false } as const;
export const SESSION_TYPE_TEMPLATE: SessionTypeInput[] = [
  t('exercise', 'Übung', 'Exercise', {}, 10),
  t('lesson', 'Unterricht', 'Lesson', {}, 20),
  t('stress-exercise', 'Atemschutz-Belastungsübung (Übungsstrecke)', 'BA stress exercise (training track)', { record: 'stress-exercise' }, 30),
  t('ba-briefing', 'Atemschutz-Unterweisung', 'BA briefing', { record: 'briefing' }, 40),
  t('ba-exercise', 'Atemschutz-Einsatzübung', 'BA exercise', { record: 'exercise-under-ba' }, 50),
  t('chemical-suit', 'CSA-Übung', 'Chemical suit exercise', { record: 'chemical-suit-exercise' }, 60),
  t('machinist', 'Maschinistenfortbildung', 'Pump operator training', {}, 70),
  t('maintenance', 'Arbeitsdienst / Gerätepflege', 'Maintenance', {}, 80),
  t('fire-watch', 'Brandsicherheitswache', 'Fire watch', { ...special, compensation: 'fire-watch' }, 90),
  t('equipment-support', 'Unterstützung Gerätewart', 'Supporting the equipment officer', special, 92),
  t('fire-safety-education', 'Brandschutzerziehung', 'Fire safety education', special, 94),
  t('meeting', 'Sitzung / Ausschuss', 'Meeting / committee', { category: 'other', compensation: 'none', countsForParticipation: false }, 100),
  t('youth', 'Jugendfeuerwehrdienst', 'Youth fire brigade session', { compensation: 'none' }, 110),
];

export const SessionStatus = z.enum(['planned', 'held', 'closed']);
export type SessionStatus = z.infer<typeof SessionStatus>;

const datetime = z.iso.datetime({ offset: true });
const text = z.string().default('');

export const SessionInput = z
  .object({
    /** Version the client loaded (optimistic locking). */
    version: z.number().int().optional(),
    type: z.string().min(1),
    title: z.string().trim().min(1),
    startsAt: datetime,
    endsAt: datetime,
    stationId: z.uuid().nullable().default(null),
    departmentIds: z.array(z.uuid()).min(1),
    responsiblePersonId: z.uuid().nullable().default(null),
    instructorIds: z.array(z.uuid()).default([]),
    topic: text,
    goals: text,
    procedure: text,
    material: text,
  })
  .refine((s) => new Date(s.endsAt) > new Date(s.startsAt), { message: 'End before start', path: ['endsAt'] });
export type SessionInput = z.input<typeof SessionInput>;

/** Several sessions at the same weekday and time, e.g. every second Friday. */
export const SessionSeries = z.object({
  session: SessionInput,
  intervalWeeks: z.number().int().min(1).max(8),
  until: z.iso.date(),
});
export type SessionSeries = z.input<typeof SessionSeries>;

/**
 * Copies the sessions of a period, e.g. last year's plan: same local time, shifted by whole weeks
 * (52 weeks keep the weekday). Without attendance; sessions already copied are skipped.
 */
export const SessionCopy = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    weeks: z.number().int().min(1).max(104),
    departmentId: z.uuid().nullable().default(null),
  })
  .refine((c) => c.to >= c.from, { message: 'End before start', path: ['to'] });
export type SessionCopy = z.input<typeof SessionCopy>;
export const SessionCopyResult = z.object({ created: z.number(), skipped: z.number() });
export type SessionCopyResult = z.infer<typeof SessionCopyResult>;

export const AttendanceStatus = z.enum(['present', 'excused', 'absent']);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

export const AttendanceInput = z.object({
  personId: z.uuid(),
  status: AttendanceStatus,
  /** `null` = times of the session. */
  from: datetime.nullable().default(null),
  to: datetime.nullable().default(null),
  /** E.g. `instructor`. */
  role: z.string().nullable().default(null),
  breathingApparatus: z.boolean().default(false),
  /** Stress exercise: work achieved in kJ and whether it was passed. */
  kilojoules: z.number().int().min(0).nullable().default(null),
  passed: z.boolean().nullable().default(null),
  /** Own forces injured (annual statistics F26). */
  injured: z.boolean().default(false),
  /**
   * QR check-in of the person as the client loaded it. An unconfirmed check-in the client did not know yet (made while
   * the list was being edited) is kept instead of being overwritten.
   */
  checkedInAt: datetime.nullable().default(null),
});
export type AttendanceInput = z.input<typeof AttendanceInput>;

/** Attendance may start and end this much outside the session times (e.g. setting up, cleaning up). */
export const ATTENDANCE_TOLERANCE_MINUTES = 120;

export const Attendance = z.object({
  personId: z.uuid(),
  status: AttendanceStatus,
  from: z.string().nullable(),
  to: z.string().nullable(),
  role: z.string().nullable(),
  breathingApparatus: z.boolean(),
  kilojoules: z.number().nullable(),
  passed: z.boolean().nullable(),
  injured: z.boolean(),
  /** Set when the person checked in via QR code. */
  checkedInAt: z.string().nullable(),
  /** `false` after a QR check-in until the attendance list is saved (confirmed). */
  confirmed: z.boolean(),
  /** Reason given with an excuse in "My area". */
  note: z.string(),
});
export type Attendance = z.infer<typeof Attendance>;

/** A session in "My area": upcoming or past, with the own attendance. */
export interface MySession {
  id: string;
  type: string;
  title: string;
  startsAt: string;
  endsAt: string;
  stationId: string | null;
  departmentIds: string[];
  status: SessionStatus;
  own: { status: AttendanceStatus; note: string } | null;
}

export interface MyTraining {
  upcoming: MySession[];
  past: MySession[];
  /** Closed sessions of the own departments this year that count for the participation, and how many the person attended. */
  year: { sessions: number; present: number; excused: number };
}

export const ExcuseInput = z.object({ note: z.string().trim().max(500).default('') });
export type ExcuseInput = z.input<typeof ExcuseInput>;

export const Session = z.object({
  id: z.uuid(),
  type: z.string(),
  title: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  stationId: z.uuid().nullable(),
  departmentIds: z.array(z.uuid()),
  responsiblePersonId: z.uuid().nullable(),
  instructorIds: z.array(z.uuid()),
  topic: z.string(),
  goals: z.string(),
  procedure: z.string(),
  material: z.string(),
  status: SessionStatus,
  closedAt: z.string().nullable(),
  closedBy: z.string().nullable(),
  attendance: z.array(Attendance),
  /** Other sessions of the same departments at the same time. */
  overlaps: z.array(z.object({ id: z.uuid(), title: z.string(), startsAt: z.string() })),
  version: z.number(),
});
export type Session = z.infer<typeof Session>;

/** A QR check-in code is replaced every this many seconds; a scanned code is accepted for one more period. */
export const CHECK_IN_ROTATION_SECONDS = 60;

/**
 * Code shown as QR code. Check-in is open from shortly before the start until the end of the session (`validFrom`,
 * `validUntil`); the code itself changes every minute (`rotatesAt`), so a photo of it does not work later.
 */
export const CheckIn = z.object({
  code: z.string(),
  validFrom: z.string(),
  validUntil: z.string(),
  rotatesAt: z.string(),
  /** Persons checked in via QR so far. */
  checkedIn: z.number(),
});
export type CheckIn = z.infer<typeof CheckIn>;

export const TrainingSettings = z.object({
  /** Minutes before the start from which the QR check-in works. */
  checkInBeforeMinutes: z.number().int().min(0).max(240).default(30),
  /** Secret part of the calendar feed address; empty = no feed. */
  feedToken: z.string().default(''),
  /** Reusable texts for the learning goals and the procedure of a session. */
  snippets: z.array(z.object({ title: z.string().trim().min(1).max(100), text: z.string().max(4000) })).max(200).default([]),
});
export type TrainingSettings = z.infer<typeof TrainingSettings>;

export const TRAINING_SETTINGS = { 'training.general': TrainingSettings } as const;

/**
 * Participation of one person in a period: `sessions` are those of the person's departments while a member (and those
 * the person is listed in); `departmentId` is the primary department at the end of the period.
 */
export const Participation = z.object({
  personId: z.uuid(),
  departmentId: z.uuid().nullable(),
  sessions: z.number(),
  present: z.number(),
  excused: z.number(),
  rate: z.number(),
  hours: z.number(),
});
export type Participation = z.infer<typeof Participation>;
