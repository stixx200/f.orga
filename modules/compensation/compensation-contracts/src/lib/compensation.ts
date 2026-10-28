import { z } from 'zod';
import { LocalizedText } from '@forga/core-contracts';

const date = z.iso.date();
const money = z.number().multipleOf(0.01);

/** Where an item comes from. */
/** `duty`: special service of the duty roster (e.g. duty officer per full day); `course`: course allowance after a passed course. */
export const ItemSource = z.enum(['incident', 'training', 'function', 'manual', 'duty', 'course']);
export type ItemSource = z.infer<typeof ItemSource>;

/** What an item pays: hourly compensation, loss of earnings (to the person or the employer), flat rates, expenses. */
export const ItemKind = z.enum(['compensation', 'loss-of-earnings', 'flat-rate', 'expenses']);
export type ItemKind = z.infer<typeof ItemKind>;

export const Rounding = z.enum(['started-hour', 'started-half-hour', 'exact-minutes']);
export type Rounding = z.infer<typeof Rounding>;

/** Kinds of sessions with an hourly rate: training (Übungsdienst), special service (Sonderdienst), fire watch. */
export const TrainingRateKind = z.enum(['training', 'special-service', 'fire-watch']);
export type TrainingRateKind = z.infer<typeof TrainingRateKind>;

/** Hourly rate of a session kind valid from a date (statute parameter). */
export const TrainingRate = z.object({ kind: TrainingRateKind, validFrom: date, amount: money.min(0) });
export type TrainingRate = z.infer<typeof TrainingRate>;

/** Annual allowance for a function (§ 16 Abs. 2 FwG), with the maximum number of holders. */
export const FunctionAllowance = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: LocalizedText,
  amount: money.min(0),
  maxHolders: z.number().int().min(1).nullable().default(null),
  /** Office in the person files (masterdata catalog `office`): its holders get the allowance, not the holders kept here. */
  office: z.string().min(1).nullable().default(null),
  /** With `office`: only holders in these departments; empty = all (e.g. department commander of the main town vs. the districts). */
  departmentIds: z.array(z.uuid()).default([]),
});
export type FunctionAllowance = z.infer<typeof FunctionAllowance>;

const fa = (key: string, de: string, en: string, amount: number, maxHolders: number | null = null): FunctionAllowance => ({ key, name: { de, en }, amount, maxHolders, office: null, departmentIds: [] });

/** Function allowances as example values of a compensation statute; adjusted in the settings. */
export const DEFAULT_FUNCTION_ALLOWANCES: FunctionAllowance[] = [
  fa('commander', 'Kommandant', 'Commander', 1500, 1),
  fa('deputy-commander', 'Stv. Kommandant', 'Deputy commander', 750, 2),
  fa('department-commander-main', 'Abteilungskommandant Hauptort', 'Department commander (main town)', 500, 1),
  fa('deputy-department-commander-main', 'Stv. Abteilungskommandant Hauptort', 'Deputy department commander (main town)', 250, 2),
  fa('department-commander', 'Abteilungskommandant Teilort', 'Department commander (district)', 300),
  fa('deputy-department-commander', 'Stv. Abteilungskommandant Teilort', 'Deputy department commander (district)', 200),
  fa('youth-warden', 'Jugendfeuerwehrwart', 'Youth fire brigade warden', 300, 1),
  fa('youth-group-leader', 'Jugendgruppenleiter', 'Youth group leader', 200, null),
  fa('breathing-apparatus-officer', 'Atemschutzgerätewart', 'Breathing apparatus officer', 250, 2),
  fa('equipment-officer-main', 'Abteilungsgerätewart Hauptort', 'Equipment officer (main town)', 250, 1),
  fa('equipment-officer', 'Abteilungsgerätewart Teilort', 'Equipment officer (district)', 200),
  fa('secretary', 'Schriftführer', 'Secretary', 150, 1),
  fa('clothing-officer', 'Kleiderwart', 'Clothing officer', 150, 1),
  fa('command-group-leader', 'Leiter Führungsgruppe', 'Head of command group', 200, 1),
];

/** Hourly rate for incidents (statute), by kind of the keyword: incident, standby at the station, fire watch. */
export const IncidentRate = z.object({ kind: z.enum(['incident', 'standby', 'fire-watch']), validFrom: date, amount: money.min(0) });
export type IncidentRate = z.infer<typeof IncidentRate>;

/**
 * Statute parameters for incidents kept by the compensation module (decision E4). The incident report computes the
 * amounts with them while the compensation module is active: `@Optional() @Inject(COMPENSATION_STATUTE)`.
 */
export const COMPENSATION_STATUTE = 'compensation.Statute';
export interface CompensationStatute {
  incidentRates(): Promise<{ rates: IncidentRate[]; rounding: Rounding; minimumHours: number | null }>;
}

/** Flat rate for a passed course (compensation statute), by course key of the master data. */
export const CourseAllowance = z.object({ course: z.string().min(1), validFrom: date, amount: money.min(0) });
export type CourseAllowance = z.infer<typeof CourseAllowance>;

/** Course allowances as example values of a compensation statute (district courses); adjusted in the settings. */
export const DEFAULT_COURSE_ALLOWANCES: CourseAllowance[] = [
  { course: 'truppmann-1', validFrom: '2026-01-01', amount: 150 },
  { course: 'squad-leader', validFrom: '2026-01-01', amount: 70 },
  { course: 'breathing-apparatus', validFrom: '2026-01-01', amount: 60 },
  { course: 'radio-operator', validFrom: '2026-01-01', amount: 30 },
  { course: 'machinist', validFrom: '2026-01-01', amount: 70 },
];

/** Hourly rate for persons running a household, valid from a date (compensation statute). */
export const HouseholdRate = z.object({ validFrom: date, amount: money.min(0) });
export type HouseholdRate = z.infer<typeof HouseholdRate>;

/** Statuses of the person file whose attendance at sessions (training and special services) is compensated (statute). */
export const PaidStatus = z.enum(['probation', 'active', 'passive', 'youth', 'veterans']);
export type PaidStatus = z.infer<typeof PaidStatus>;

/** Settings section `compensation.general`. The incident report computes its amounts with `incidentRates` while the module is active. */
export const CompensationSettings = z.object({
  /** Statute values start empty; the sample statute is only taken over explicitly (`SAMPLE_STATUTE`). */
  trainingRates: z.array(TrainingRate).default([]),
  trainingRounding: Rounding.default('started-hour'),
  /** Statuses of the persons whose attendance at sessions is compensated; youth members only when the statute says so. */
  paidStatuses: z.array(PaidStatus).default(['active', 'probation']),
  /** Hourly rates for incidents; while empty, the incident reports compute with their own settings. */
  incidentRates: z.array(IncidentRate).default([]),
  incidentRounding: Rounding.default('started-hour'),
  /** Billable hours of an incident are at least this many (not for standby); `null`: no minimum. */
  incidentMinimumHours: z.number().min(0).max(24).nullable().default(null),
  /**
   * Refreshment allowance for incidents longer than `afterHours` (§ 16 Abs. 1 FwG). Without an amount in the statute
   * the run only shows a hint instead of an item.
   */
  refreshment: z.object({ afterHours: z.number().min(0).default(4), amount: money.min(0).nullable().default(null) }).default({ afterHours: 4, amount: null }),
  /**
   * Incidents over more than this many consecutive days: loss of earnings and expenses in actual amount (§ 16 Abs. 4 FwG),
   * persons running a household get `householdRates`. The run shows a hint for the individual settlement.
   */
  multiDayAfterDays: z.number().int().min(1).default(2),
  householdRates: z.array(HouseholdRate).default([]),
  courseAllowances: z.array(CourseAllowance).default([]),
  /**
   * Incident hours from the EvD reports (duty officer module) are paid like those of other reports. Off: the duty
   * officer's flat rate per duty day covers his incidents; only a loss of earnings is still recorded.
   */
  dutyOfficerReportPaid: z.boolean().default(true),
  /** Upper limits for the hourly compensation per incident or session and per person and day; `null`: none. */
  maxPerService: money.min(0).nullable().default(null),
  maxPerDay: money.min(0).nullable().default(null),
  functionAllowances: z.array(FunctionAllowance).default([]),
  /** Optional step before the payout: the commander signs the closed run as factually correct ("sachlich richtig"). */
  factualApproval: z.boolean().default(false),
  /** Change of a function holder within the year: full allowance for the holder on 31 Dec, or by months held. */
  functionSplit: z.enum(['holder-at-year-end', 'by-months']).default('by-months'),
  /** Tax-free amounts (R 3.12 LStR); only a hint for the treasury. */
  taxFreePerYear: money.min(0).default(3000),
  taxFreePerMonth: money.min(0).default(250),
  /** Purpose of the transfer; `{period}` is replaced. */
  transferPurpose: z.string().default('Entschädigung Feuerwehr {period}'),
  /** Account of the municipality the payouts are made from (SEPA file); empty until entered. */
  payer: z.object({ name: z.string().default(''), iban: z.string().default(''), bic: z.string().default('') }).default({ name: '', iban: '', bic: '' }),
});
export type CompensationSettings = z.infer<typeof CompensationSettings>;

export const COMPENSATION_SETTINGS = { 'compensation.general': CompensationSettings } as const;

/**
 * Sample statute ("Vorlage"): example rates (15 €/h, special services 12 €/h), household rate, course and function
 * allowances. Only applied when the administration takes it over in the settings; the values are examples and have to
 * be replaced by the local statute.
 */
export const SAMPLE_STATUTE = {
  trainingRates: [
    { kind: 'training', validFrom: '2026-01-01', amount: 15 },
    { kind: 'special-service', validFrom: '2026-01-01', amount: 12 },
    { kind: 'fire-watch', validFrom: '2026-01-01', amount: 15 },
  ],
  incidentRates: [
    { kind: 'incident', validFrom: '2026-01-01', amount: 15 },
    { kind: 'standby', validFrom: '2026-01-01', amount: 15 },
    { kind: 'fire-watch', validFrom: '2026-01-01', amount: 15 },
  ],
  householdRates: [{ validFrom: '2026-01-01', amount: 15 }],
  courseAllowances: DEFAULT_COURSE_ALLOWANCES,
  functionAllowances: DEFAULT_FUNCTION_ALLOWANCES,
} satisfies Partial<CompensationSettings>;

/** No hourly rates for sessions and incidents yet: the statute is not maintained. */
export const statuteMissing = (config: Pick<CompensationSettings, 'trainingRates' | 'incidentRates'>) => !config.trainingRates.length && !config.incidentRates.length;

export const Item = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  departmentId: z.uuid().nullable(),
  source: ItemSource,
  sourceId: z.string().nullable(),
  /** E.g. "2026-104711 · B2" or the title of the session. */
  label: z.string(),
  kind: ItemKind,
  date: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
  hours: z.number().nullable(),
  rate: z.number().nullable(),
  /** `null` until the loss of earnings is known. */
  amount: z.number().nullable(),
  /** During working hours for the municipality: shown with "(AZ)", no amount. */
  workingHours: z.boolean(),
  /** Difference to an item that is already in a closed run. */
  correction: z.boolean(),
  reason: z.string(),
  runId: z.uuid().nullable(),
  /** Deferred to the next run from this draft run ("In nächsten Lauf verschieben"). */
  deferredFrom: z.uuid().nullable(),
  version: z.number(),
});
export type Item = z.infer<typeof Item>;

/** Items of a draft run moved to the next run, or taken back. */
export const DeferInput = z.object({ itemIds: z.array(z.uuid()).min(1) });
export type DeferInput = z.input<typeof DeferInput>;

/** Several amounts at once (loss of earnings in a list). */
export const AmountsInput = z.array(z.object({ id: z.uuid(), amount: money.min(0), reason: z.string().trim().default('') })).min(1);
export type AmountsInput = z.input<typeof AmountsInput>;

/** Closing a run: persons without valid IBAN have to be confirmed explicitly. */
export const CloseInput = z.object({ acceptMissingIban: z.boolean().default(false) });
export type CloseInput = z.input<typeof CloseInput>;

/**
 * State of an own item: `open` (in no closed run), `settled` ("abgerechnet": in a closed run, not transferred yet, also
 * when the payout is still due another way), `paid-out` (run paid and transferred, or the other payout confirmed).
 */
export const MyItemState = z.enum(['open', 'settled', 'paid-out']);
export type MyItemState = z.infer<typeof MyItemState>;

/** "Meine Entschädigung": the own items of a year with their state and the totals per state. */
export const MyCompensation = z.object({ year: z.number(), items: z.array(Item.extend({ state: MyItemState })), open: z.number(), settled: z.number(), paid: z.number() });
export type MyCompensation = z.infer<typeof MyCompensation>;

export const ManualItemInput = z.object({
  personId: z.uuid(),
  kind: ItemKind,
  date,
  label: z.string().trim().min(1),
  amount: money,
  reason: z.string().trim().min(1),
});
export type ManualItemInput = z.input<typeof ManualItemInput>;

/** Loss of earnings: the proven amount is entered later. */
export const ItemAmountInput = z.object({ amount: money.min(0), reason: z.string().trim().default('') });
export type ItemAmountInput = z.input<typeof ItemAmountInput>;

export const RunStatus = z.enum(['draft', 'closed', 'handed-over', 'paid']);
export type RunStatus = z.infer<typeof RunStatus>;

export const RunInput = z.object({ from: date, to: date }).refine((r) => r.from <= r.to, { message: 'End before start', path: ['to'] });
export type RunInput = z.input<typeof RunInput>;

export const ProblemCode = z.enum([
  'amount-missing', 'time-missing', 'working-hours-conflict', 'duplicate', 'overlap', 'no-iban', 'max-holders', 'negative-total', 'report-not-released',
  'refreshment', 'multi-day', 'above-day-maximum', 'other-payment',
]);
export type ProblemCode = z.infer<typeof ProblemCode>;

export const Problem = z.object({
  code: ProblemCode,
  /** Blocking problems prevent closing the run. */
  blocking: z.boolean(),
  personId: z.uuid().nullable(),
  name: z.string(),
  itemIds: z.array(z.uuid()),
  detail: z.string(),
});
export type Problem = z.infer<typeof Problem>;

export const PersonTotal = z.object({
  personId: z.uuid(),
  name: z.string(),
  departmentId: z.uuid().nullable(),
  incidents: z.number(),
  sessions: z.number(),
  amount: z.number(),
});
export type PersonTotal = z.infer<typeof PersonTotal>;

/** A payout of a run that is not in the transfer files (payee without valid IBAN, confirmed when closing). */
export const ManualPayout = z.object({
  /** Person ID, or `employer-…` for loss of earnings assigned to an employer. */
  key: z.string(),
  name: z.string(),
  personIds: z.array(z.string()),
  amount: z.number(),
  paidAt: z.string().nullable(),
  paidBy: z.string().nullable(),
});
export type ManualPayout = z.infer<typeof ManualPayout>;

export const Run = z.object({
  id: z.uuid(),
  number: z.string(),
  from: z.string(),
  to: z.string(),
  status: RunStatus,
  total: z.number(),
  itemCount: z.number(),
  closedAt: z.string().nullable(),
  closedBy: z.string().nullable(),
  /** Persons without valid IBAN confirmed when closing; they are left out of the transfer files. */
  withoutIban: z.array(z.string()),
  /** Payouts of the payees confirmed without IBAN: paid another way, open until marked as paid. */
  manualPayouts: z.array(ManualPayout),
  /** Factual approval ("sachlich richtig") of the closed run. */
  approvedAt: z.string().nullable(),
  approvedBy: z.string().nullable(),
  handedOverAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  version: z.number(),
});
export type Run = z.infer<typeof Run>;

export const RunDetail = Run.extend({
  items: z.array(Item),
  /** Items deferred from this draft to the next run. */
  deferred: z.array(Item),
  persons: z.array(PersonTotal),
  departments: z.array(z.object({ departmentId: z.uuid().nullable(), persons: z.number(), incidents: z.number(), amount: z.number() })),
  problems: z.array(Problem),
});
export type RunDetail = z.infer<typeof RunDetail>;

export const FunctionHolderInput = z.object({
  personId: z.uuid(),
  functionKey: z.string().min(1),
  from: date,
  to: date.nullable().default(null),
});
export type FunctionHolderInput = z.input<typeof FunctionHolderInput>;

export const FunctionHolder = z.object({
  /** For holders from the person files a stable synthetic ID. */
  id: z.string(),
  personId: z.uuid(),
  functionKey: z.string(),
  from: z.string(),
  to: z.string().nullable(),
  /** `masterdata`: from the offices in the person files (read-only here). */
  source: z.enum(['module', 'masterdata']),
  version: z.number(),
});
export type FunctionHolder = z.infer<typeof FunctionHolder>;

/** Annual totals of a person, split by kind, with the tax hint. */
export const YearTotal = z.object({
  personId: z.uuid(),
  name: z.string(),
  byKind: z.record(z.string(), z.number()),
  total: z.number(),
  /** Months above the monthly tax-free amount. */
  monthsAbove: z.array(z.number()),
  aboveYear: z.boolean(),
});
export type YearTotal = z.infer<typeof YearTotal>;

export const COMPENSATION_EVENTS = { runClosed: 'compensation.run.completed' } as const;

export interface RunClosedEvent {
  runId: string;
  number: string;
  from: string;
  to: string;
  total: number;
}

/** Preview in the settings: an incident computed with the (unsaved) settings. */
export const PreviewInput = z.object({ incidentId: z.uuid(), settings: CompensationSettings });
export type PreviewInput = z.input<typeof PreviewInput>;

export interface PreviewPerson {
  personId: string | null;
  name: string;
  from: string;
  to: string;
  standby: boolean;
  duringWorkingHours: boolean;
  hours: number;
  rate: number | null;
  allowances: number;
  /** Amount of the incident report (or its override). */
  computed: number;
  overridden: boolean;
  /** Paid out after the statute limits. */
  amount: number;
  refreshment: number | null;
  hints: ('refreshment' | 'multi-day' | 'capped')[];
}

export interface Preview {
  incidentId: string;
  dispatchNumber: string;
  alarmKeyword: string;
  alarmedAt: string;
  compensationKind: 'incident' | 'standby' | 'fire-watch';
  /** `departmentId` is `null` for the report of a brigade-wide unit (e.g. the EvD report, `unit`). */
  reports: { reportId: string; reportNumber: string; departmentId: string | null; unit: string | null; status: string; personnel: PreviewPerson[] }[];
}
