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

/** Optional extra amounts per person in a report, e.g. dirt allowance. Duty officer flat rates come from the duty roster of the duty officer module. */
export const Allowance = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: LocalizedText,
  amount: z.number().min(0),
});
export type Allowance = z.infer<typeof Allowance>;

export const RuleLevel = z.enum(['error', 'warning']);
export type RuleLevel = z.infer<typeof RuleLevel>;

export const RULE_IDS = [
  'primary-missing',
  'report-empty',
  'statistics-missing',
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
  'end-unconfirmed',
  'times-order',
  'incident-time-differs',
  'personnel-duration-long',
  'personnel-times-outside',
  'vehicle-times-invalid',
  'vehicle-times-outside',
  'person-not-operational',
  'person-not-member',
  'person-too-young',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

/** Default level of every rule; settings may switch a rule off or change its level. */
export const DEFAULT_RULE_LEVELS: Record<RuleId, RuleLevel> = {
  'primary-missing': 'error',
  'report-empty': 'error',
  'statistics-missing': 'error',
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
  'end-unconfirmed': 'error',
  'times-order': 'warning',
  'incident-time-differs': 'warning',
  'personnel-duration-long': 'warning',
  'personnel-times-outside': 'warning',
  'vehicle-times-invalid': 'error',
  'vehicle-times-outside': 'warning',
  'person-not-operational': 'warning',
  'person-not-member': 'warning',
  'person-too-young': 'warning',
};

/**
 * Example rates of a compensation statute. They are not applied by default: the settings offer them as a template,
 * so nobody is compensated with sample values by accident (rule `rate-missing` reports missing rates).
 */
export const RATE_TEMPLATE: CompensationRate[] = [
  { kind: 'incident', amount: 15, validFrom: '2026-01-01' },
  { kind: 'standby', amount: 15, validFrom: '2026-01-01' },
  { kind: 'fire-watch', amount: 15, validFrom: '2026-01-01' },
];

/** Settings section `incidents.general`. Hourly rates start empty; `RATE_TEMPLATE` holds example values. */
export const IncidentSettings = z.object({
  /** Municipalities that count as "own municipality" for the statistics, compared with the incident city. */
  homeMunicipalities: z.array(z.string().trim().min(1)).default([]),
  rates: z.array(CompensationRate).default([]),
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
  /**
   * Parallel operation: incidents and reports are kept in MP-Feuer and come with the data transfer. Imported reports
   * are then read-only in f.orga until a releaser takes one over (`null`: f.orga leads).
   */
  externalLeading: z.enum(['mp-feuer']).nullable().default(null),
  /**
   * Releases taken over by the MP-Feuer import for incidents from this day on are announced to the other modules
   * (compensation items, respiratory protection, equipment); `null`: imports announce nothing.
   */
  externalEventsFrom: z.iso.date().nullable().default(null),
  rules: z
    .record(z.string(), z.object({ enabled: z.boolean().default(true), level: RuleLevel.optional() }))
    .default({}),
});
export type IncidentSettings = z.infer<typeof IncidentSettings>;

/**
 * What the import of incident personnel makes of a function text that is no function, e.g. "Arbeitszeit Stadt Musterstadt": no
 * function, but the assignment was during working hours (`during-working-hours`), with loss of earnings
 * (`loss-of-earnings`), or nothing (`ignore`).
 */
export const ImportFunctionTarget = z.enum(['during-working-hours', 'loss-of-earnings', 'ignore']);
export type ImportFunctionTarget = z.infer<typeof ImportFunctionTarget>;

/** Key of a target in the lookup `function` of the imports (mapping `{ function: { <text>: <key> } }`). */
export const importFunctionTargetKey = (target: ImportFunctionTarget) => `incidents:${target}` as const;

export const INCIDENTS_SETTINGS = {
  'incidents.general': IncidentSettings,
} as const;
