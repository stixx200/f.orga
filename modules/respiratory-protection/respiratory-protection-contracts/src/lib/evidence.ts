import { z } from 'zod';

/**
 * Kinds of evidence a breathing apparatus wearer collects (FwDV 7). `training-track` (Atemschutzstrecke) is a stress
 * exercise with fixed work and duration (rule `trackKilojoules`, `trackMinutes`); it counts as stress exercise.
 */
/**
 * Person statuses (master data) that count as breathing apparatus wearers: active members and members on probation.
 * Veterans, passive members and youth do not get traffic lights, deadlines or e-mails.
 */
export const WEARER_STATUSES: readonly string[] = ['active', 'probation'];

export const EvidenceKind = z.enum(['examination', 'stress-exercise', 'training-track', 'briefing', 'exercise', 'incident', 'chemical-suit']);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

/** Where the evidence comes from; only manual evidence can be changed here. */
export const EvidenceSource = z.enum(['manual', 'training', 'incidents', 'import']);
export type EvidenceSource = z.infer<typeof EvidenceSource>;

const date = z.iso.date();
const optionalText = z.string().trim().max(500).default('');

/** Kind of breathing apparatus used (Atemschutznachweis). */
export const BreathingDevice = z.enum(['compressed-air', 'rebreather', 'filter']);
export type BreathingDevice = z.infer<typeof BreathingDevice>;

/** Examination group: devices up to 5 kg (G 26.2) or heavier (G 26.3). */
export const ExaminationGroup = z.enum(['up-to-5kg', 'over-5kg']);
export type ExaminationGroup = z.infer<typeof ExaminationGroup>;

/**
 * Result of the medical examination (DGUV G 26): no concerns, no concerns for a limited time (certificate with
 * "valid until"), no concerns under certain conditions (see restrictions), concerns (not fit).
 */
export const ExaminationResult = z.enum(['no-concerns', 'no-concerns-limited', 'no-concerns-conditional', 'concerns']);
export type ExaminationResult = z.infer<typeof ExaminationResult>;

export const EvidenceInput = z.object({
  personId: z.uuid(),
  kind: EvidenceKind,
  date,
  /** Examination: "valid until" of the certificate (after the date, at most the interval of the rule); without it the interval applies. */
  validUntil: date.nullable().default(null),
  /** Examination: result, required when recording; `null` only for examinations taken over without result. */
  result: ExaminationResult.nullable().default(null),
  /** Examination: doctor or office. */
  examiner: optionalText,
  /** Examination: e.g. "only devices up to 5 kg"; no findings. */
  restrictions: optionalText,
  /** Examination: for devices up to 5 kg the interval over 50 is 24 instead of 12 months; `null` = over 5 kg. */
  examinationGroup: ExaminationGroup.nullable().default(null),
  /** Exercises and incidents: kind of apparatus. */
  device: BreathingDevice.nullable().default(null),
  /** Stress exercise: training facility. */
  facility: optionalText,
  kilojoules: z.number().int().min(0).max(1000).nullable().default(null),
  passed: z.boolean().nullable().default(null),
  /** Time under breathing apparatus. */
  minutes: z.number().int().min(0).max(1440).nullable().default(null),
  note: optionalText,
});
export type EvidenceInput = z.input<typeof EvidenceInput>;

/** Several persons at once, e.g. after the training track. */
export const QuickEntryInput = z.object({
  kind: EvidenceKind.exclude(['examination']),
  date,
  facility: optionalText,
  entries: z
    .array(z.object({ personId: z.uuid(), kilojoules: z.number().int().min(0).max(1000).nullable().default(null), passed: z.boolean().nullable().default(null), minutes: z.number().int().min(0).nullable().default(null) }))
    .min(1),
});
export type QuickEntryInput = z.input<typeof QuickEntryInput>;

export const Evidence = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  kind: EvidenceKind,
  date: z.string(),
  validUntil: z.string().nullable(),
  result: ExaminationResult.nullable(),
  examiner: z.string(),
  restrictions: z.string(),
  examinationGroup: ExaminationGroup.nullable(),
  device: BreathingDevice.nullable(),
  facility: z.string(),
  kilojoules: z.number().nullable(),
  passed: z.boolean().nullable(),
  minutes: z.number().nullable(),
  note: z.string(),
  source: EvidenceSource,
  /** Session or report the evidence comes from. */
  sourceId: z.string().nullable(),
  /** Withdrawn while the incident report is unlocked; does not count. */
  withdrawn: z.boolean(),
  version: z.number(),
});
export type Evidence = z.infer<typeof Evidence>;

/** Configurable fitness rule; default per FwDV 7 (decision E5). */
export const FitnessRule = z.object({
  examination: z.boolean().default(true),
  briefing: z.boolean().default(true),
  stressExercise: z.boolean().default(true),
  exercise: z.boolean().default(true),
  chemicalSuit: z.boolean().default(true),
  /** Annual evidence: valid 12 months, or until the end of the following calendar year. */
  window: z.enum(['twelve-months', 'calendar-year']).default('twelve-months'),
  minKilojoules: z.number().int().min(0).default(80),
  /** From the age `olderFromAge` (default 50) on. */
  minKilojoulesFrom50: z.number().int().min(0).default(60),
  /** Minimum age of wearers (FwDV 7). */
  minimumAge: z.number().int().min(0).max(99).default(18),
  /**
   * Age from which on (inclusive: `age >= olderFromAge` on the date of the evidence) the lower kJ limit and the
   * shorter examination intervals apply (DGUV G 26).
   */
  olderFromAge: z.number().int().min(0).max(99).default(50),
  /** Examination interval `by-age` in months: below `olderFromAge`, from it on, and from it on for devices up to 5 kg. */
  examinationMonths: z.number().int().min(1).max(120).default(36),
  examinationMonthsOlder: z.number().int().min(1).max(120).default(12),
  examinationMonthsOlderLight: z.number().int().min(1).max(120).default(24),
  /** Atemschutzstrecke: fixed work in kJ and duration in minutes of a run; `null` = not set, a run then counts when passed. */
  trackKilojoules: z.number().int().min(0).max(1000).nullable().default(null),
  trackMinutes: z.number().int().min(0).max(1440).nullable().default(null),
  /** Interval of the examination without "valid until": by age (36 months, over 50: 12 months) or fixed years. */
  examinationInterval: z.union([z.literal('by-age'), z.literal(1), z.literal(2), z.literal(3)]).default('by-age'),
  incidentReplacesExercise: z.boolean().default(true),
  /** Yellow when evidence expires within these days. */
  leadDays: z.number().int().min(0).max(365).default(60),
});
export type FitnessRule = z.infer<typeof FitnessRule>;

export const RESPIRATORY_PROTECTION_SETTINGS = { 'respiratory-protection.rule': FitnessRule } as const;

export const FitnessColor = z.enum(['green', 'yellow', 'red', 'grey']);
export type FitnessColor = z.infer<typeof FitnessColor>;

export const ConditionKey = z.enum(['qualification', 'minimum-age', 'examination', 'briefing', 'stress-exercise', 'exercise', 'chemical-suit']);
export type ConditionKey = z.infer<typeof ConditionKey>;

export const Condition = z.object({
  key: ConditionKey,
  met: z.boolean(),
  /** Date of the evidence that fulfils the condition. */
  lastDate: z.string().nullable(),
  /** Until when it is fulfilled. */
  dueOn: z.string().nullable(),
  /** Examination with the result "concerns" (only for those who may see examinations). */
  concerns: z.boolean().optional(),
});
export type Condition = z.infer<typeof Condition>;

export const FitnessStatus = z.object({
  personId: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  departmentIds: z.array(z.uuid()),
  color: FitnessColor,
  conditions: z.array(Condition),
  nextDue: z.string().nullable(),
  /** Minimum work in kJ of a stress exercise today (by age; without birth date the general minimum). */
  minimumKilojoules: z.number(),
});
export type FitnessStatus = z.infer<typeof FitnessStatus>;

/** Person file tab: status and the evidence the user may see. */
export const PersonRespiratoryProtection = z.object({ status: FitnessStatus, evidence: z.array(Evidence) });
export type PersonRespiratoryProtection = z.infer<typeof PersonRespiratoryProtection>;

/**
 * Traffic light of persons on a date for other modules, e.g. the incident report warns about wearers who are not fit.
 * Inject optionally: `@Optional() @Inject(RESPIRATORY_PROTECTION_FITNESS) fitness?: FitnessLookup`.
 */
export const RESPIRATORY_PROTECTION_FITNESS = 'respiratory-protection.Fitness';

export interface FitnessLookup {
  colors(personIds: readonly string[], date: string): Promise<Map<string, FitnessColor>>;
}

export const RESPIRATORY_PROTECTION_EVENTS = { statusChanged: 'respiratory-protection.status.changed' } as const;

export interface StatusChangedEvent {
  personId: string;
  previous: FitnessColor | null;
  color: FitnessColor;
}
