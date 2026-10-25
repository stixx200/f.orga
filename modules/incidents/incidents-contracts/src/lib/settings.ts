import { z } from 'zod';
import { LocalizedText } from '@forga/core-contracts';
import { CompensationKind } from './keyword.js';

/** How the duration of an assignment is rounded before it is multiplied with the hourly rate. */
export const Rounding = z.enum(['started-hour', 'started-half-hour', 'exact-minutes']);
export type Rounding = z.infer<typeof Rounding>;

export const CompensationRate = z.object({
  kind: CompensationKind,
  /** Euro per hour. */
  amount: z.number().min(0),
  validFrom: z.iso.date(),
});
export type CompensationRate = z.infer<typeof CompensationRate>;

/** Optional extra amounts per person in a report, e.g. dirt allowance. Duty officer flat rates come from the duty roster. */
export const Allowance = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: LocalizedText,
  amount: z.number().min(0),
});
export type Allowance = z.infer<typeof Allowance>;

/** Kind of special service from a duty roster with its rate per day. */
export const DutyKind = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: LocalizedText,
  /** Which days of a duty period are paid: only full 24 hours, or every started day. */
  unit: z.enum(['full-day', 'started-day']).default('full-day'),
  rates: z.array(z.object({ amountPerDay: z.number().min(0), validFrom: z.iso.date() })).default([]),
});
export type DutyKind = z.infer<typeof DutyKind>;

export const RuleLevel = z.enum(['error', 'warning']);
export type RuleLevel = z.infer<typeof RuleLevel>;

export const RULE_IDS = [
  'primary-missing',
  'report-empty',
  'statistics-missing',
  'statistics-not-allowed',
  'no-personnel',
  'vehicle-missing',
  'personnel-overlap-incident',
  'personnel-overlap-other',
  'times-invalid',
  'duration-long',
  'rate-missing',
  'working-hours-and-loss-of-earnings',
  'crew-exceeded',
  'breathing-without-qualification',
  'breathing-not-fit',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** Default level of every rule; settings may switch a rule off or change its level. */
export const DEFAULT_RULE_LEVELS: Record<RuleId, RuleLevel> = {
  'primary-missing': 'error',
  'report-empty': 'error',
  'statistics-missing': 'error',
  'statistics-not-allowed': 'error',
  'no-personnel': 'error',
  'vehicle-missing': 'error',
  'personnel-overlap-incident': 'error',
  'personnel-overlap-other': 'warning',
  'times-invalid': 'error',
  'duration-long': 'warning',
  'rate-missing': 'warning',
  'working-hours-and-loss-of-earnings': 'error',
  'crew-exceeded': 'warning',
  'breathing-without-qualification': 'warning',
  'breathing-not-fit': 'warning',
};

/** Settings section `incidents.general`. Defaults are example values of a compensation statute. */
export const IncidentSettings = z.object({
  /** Municipalities that count as "own municipality" for the statistics, compared with the incident city. */
  homeMunicipalities: z.array(z.string().trim().min(1)).default([]),
  rates: z.array(CompensationRate).default([
    { kind: 'incident', amount: 15, validFrom: '2026-01-01' },
    { kind: 'standby', amount: 15, validFrom: '2026-01-01' },
    { kind: 'fire-watch', amount: 15, validFrom: '2026-01-01' },
  ]),
  rounding: Rounding.default('started-hour'),
  /** Billable hours of an incident are at least this many (not for standby); `null`: no minimum. */
  minimumHours: z.number().min(0).max(24).nullable().default(null),
  /**
   * Two-step release: first "for compensation payout", then "for billing".
   * Without it, reports are only released for billing (which includes compensation).
   */
  compensationRelease: z.boolean().default(true),
  /** Assignments during working hours (for the employer, usually the municipality) are compensated too; otherwise they get nothing. */
  compensateDuringWorkingHours: z.boolean().default(false),
  /** Incidents and assignments longer than this many hours are flagged and not compared for overlaps (e.g. duty officer periods). */
  longDurationHours: z.number().min(1).max(240).default(24),
  /** Standby at the station is always compensated with this many hours (local practice). */
  standbyHours: z.number().min(0).default(1),
  allowances: z.array(Allowance).default([]),
  /** Special services from the duty roster (example: duty officer 10 € per full day). */
  dutyKinds: z.array(DutyKind).default([
    {
      key: 'duty-officer',
      name: { de: 'Einsatzleiter vom Dienst (EvD)', en: 'Duty officer' },
      unit: 'full-day',
      rates: [{ amountPerDay: 10, validFrom: '2026-01-01' }],
    },
  ]),
  rules: z
    .record(z.string(), z.object({ enabled: z.boolean().default(true), level: RuleLevel.optional() }))
    .default({}),
});
export type IncidentSettings = z.infer<typeof IncidentSettings>;

export const INCIDENTS_SETTINGS = {
  'incidents.general': IncidentSettings,
} as const;
