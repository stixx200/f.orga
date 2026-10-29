import { z } from 'zod';
import { LocalizedText } from './i18n.js';

/** Manages the list „Aussonderung“: offering to the archive, decisions, deferring and executing. */
export const RETENTION_PERMISSION = 'core.retention.manage';

/**
 * What happens when the retention period of a record has passed: offer it to the archive first (`offer-archive`),
 * anonymise it, delete it, or nothing.
 */
export const RetentionAction = z.enum(['offer-archive', 'anonymize', 'delete', 'none']);
export type RetentionAction = z.infer<typeof RetentionAction>;

/** What happens with a record in f.orga after the archive decided (taken over or destroyed). */
export const RetentionFinalAction = z.enum(['anonymize', 'delete']);
export type RetentionFinalAction = z.infer<typeof RetentionFinalAction>;

/** The rule of one category (or one subtype of it), e.g. `incidents.incidents:special`. */
export const RetentionRule = z
  .object({
    /** Period in years from the event of the category (leaving, alarm …); `null` = unlimited. */
    years: z.number().int().min(1).max(100).nullable().default(null),
    action: RetentionAction.default('none'),
    /** Only with `offer-archive`: what happens with the record after the decision of the archive. */
    afterDecision: RetentionFinalAction.nullable().default(null),
    /** „Sonderfall prüfen“: due records always come into the list and are only processed after confirmation. */
    specialCase: z.boolean().default(false),
    /** Origin, e.g. „Aktenplan 13.20“. */
    note: z.string().trim().max(200).default(''),
  })
  .refine((r) => r.action !== 'offer-archive' || r.afterDecision !== null, { message: 'After the decision required', path: ['afterDecision'] });
export type RetentionRule = z.infer<typeof RetentionRule>;
export type RetentionRuleInput = z.input<typeof RetentionRule>;

/** Key of the rule of a subtype: `<category>:<subtype>`; the category key alone is the rule of the other records. */
export const retentionRuleKey = (category: string, subtype: string | null) => (subtype ? `${category}:${subtype}` : category);

/** Subtype of a category with its own period, e.g. incidents with special features or a kind of session. */
export const RetentionSubtype = z.object({
  key: z.string(),
  name: LocalizedText,
  description: LocalizedText.nullable(),
});
export type RetentionSubtype = z.infer<typeof RetentionSubtype>;

/** A data category with its own retention period (`GET /api/core/retention/categories`). */
export const RetentionCategory = z.object({
  key: z.string(),
  module: z.string(),
  name: LocalizedText,
  description: LocalizedText.nullable(),
  /** Event the period runs from, e.g. „Austritt“. */
  event: LocalizedText,
  actions: z.array(RetentionAction),
  /**
   * `fixed`: every subtype is always a row of its own and the category key is the rule of the other records (e.g. incidents
   * with special features / other incidents). `optional`: rows for subtypes are added as needed; records of a subtype without
   * a rule follow the rule of the category (e.g. sessions of a kind).
   */
  subtypeMode: z.enum(['fixed', 'optional']),
  subtypes: z.array(RetentionSubtype),
  /** Name of the row of the category key when it has subtypes, e.g. „Übrige Einsätze“. */
  otherName: LocalizedText.nullable(),
  /** Cash or booking records: periods of the budget law, to be agreed with the treasury; no template value. */
  financial: z.boolean(),
  /** Rule used while none is stored. */
  defaultRule: RetentionRule,
  /** At least as long as this category (e.g. the basic data of a person as long as the person file). */
  atLeastAs: z.string().nullable(),
});
export type RetentionCategory = z.infer<typeof RetentionCategory>;

/** Rules of the template „Kommunaler Aktenplan (Beispiel)“: only the periods the brigade named, nothing else. */
export const RETENTION_TEMPLATE_MUNICIPAL: Record<string, RetentionRuleInput> = {
  'masterdata.person-core': { years: 15, action: 'offer-archive', afterDecision: 'anonymize', specialCase: false, note: 'Personalstammrolle (Feuerwehr): 15 Jahre' },
  'masterdata.person-file': { years: 30, action: 'offer-archive', afterDecision: 'anonymize', specialCase: true, note: 'Feuerwehrangehörige: 30 Jahre oder Sonderfall' },
  'incidents.incidents:special': { years: 30, action: 'offer-archive', afterDecision: 'anonymize', specialCase: true, note: 'Wachbücher der Feuerwehr: 30 Jahre oder Sonderfall' },
  'incidents.incidents': { years: 3, action: 'offer-archive', afterDecision: 'anonymize', specialCase: true, note: 'Wachbücher der Feuerwehr: 3 Jahre oder Sonderfall' },
  'equipment.retired': { years: 30, action: 'offer-archive', afterDecision: 'delete', specialCase: true, note: 'Freiwillige Feuerwehr: 30 Jahre oder Sonderfall' },
  'masterdata.vehicles-retired': { years: 30, action: 'offer-archive', afterDecision: 'delete', specialCase: true, note: 'Freiwillige Feuerwehr: 30 Jahre oder Sonderfall' },
  'core.audit': { years: 2, action: 'delete', afterDecision: null, specialCase: false, note: 'Datenerfassungsprotokolle: 2–10 Jahre' },
  'core.history': { years: 10, action: 'delete', afterDecision: null, specialCase: true, note: 'Datenerfassungsprotokolle: 2–10 Jahre' },
  'training.sessions:meeting': { years: 30, action: 'offer-archive', afterDecision: 'delete', specialCase: false, note: 'Niederschriften über Ausschusssitzungen: 30 Jahre' },
  'training.sessions:staff-meeting': { years: 5, action: 'offer-archive', afterDecision: 'delete', specialCase: true, note: 'Dienstbesprechungen, Niederschriften: 5–30 Jahre' },
};

/** Result of a retention run (`POST /api/core/retention/run`). */
export const RetentionResult = z.object({
  dryRun: z.boolean(),
  /**
   * Per rule key: records anonymised or deleted right away (real run), or due now (dry run), e.g.
   * `{ 'core.audit': 120, 'incidents.incidents:special': 3 }`.
   */
  counts: z.record(z.string(), z.number()),
  /** Per rule key: new cases in the list „Aussonderung“ (real run). */
  cases: z.record(z.string(), z.number()),
  /** Period that applies per rule key when it differs from the entered one (e.g. basic data as long as the person file). */
  effectiveYears: z.record(z.string(), z.number()),
  /** Warnings about the rules, e.g. `retention.personCoreShorter`. */
  warnings: z.array(z.string()),
});
export type RetentionResult = z.infer<typeof RetentionResult>;

/** Runs the retention rules; a dry run may try other rules than the stored ones, e.g. before saving them. */
export const RetentionRun = z.object({
  dryRun: z.boolean().default(true),
  /** Only for dry runs: rules replacing the stored ones. */
  settings: z.object({ retention: z.record(z.string(), RetentionRule) }).optional(),
});
export type RetentionRun = z.input<typeof RetentionRun>;

/**
 * State of a case in the list „Aussonderung“: due, offered to the archive, taken over (`accepted`) or destroyed by the archive
 * (`destroyed`, „kassiert“), deferred as a special case, or done (anonymised or deleted in f.orga).
 */
export const RetentionCaseStatus = z.enum(['due', 'offered', 'accepted', 'destroyed', 'deferred', 'done']);
export type RetentionCaseStatus = z.infer<typeof RetentionCaseStatus>;

export const RetentionCase = z.object({
  id: z.uuid(),
  category: z.string(),
  /** Rule the case came from, e.g. `incidents.incidents:special`. */
  ruleKey: z.string(),
  recordId: z.string(),
  /** Name of the record (data only, no words); after the execution only number and date (no names of persons). */
  label: z.string(),
  /** Why the record belongs to its subtype, e.g. „30 Jahre aufbewahren (Sonderfall)“. */
  reason: LocalizedText.nullable(),
  /** Day the period started (leaving, alarm, …; see the event of the category). */
  eventDate: z.string(),
  /** Day the period ended. */
  dueSince: z.string(),
  attachments: z.number().int(),
  status: RetentionCaseStatus,
  action: RetentionAction,
  afterDecision: RetentionFinalAction.nullable(),
  specialCase: z.boolean(),
  /** Error code why the record cannot be deleted now, e.g. `retention.costNoticeOpen`. */
  blockedBy: z.string().nullable(),
  offerId: z.string().nullable(),
  offeredAt: z.string().nullable(),
  archive: z.string().nullable(),
  offerNote: z.string().nullable(),
  decidedOn: z.string().nullable(),
  decisionNote: z.string().nullable(),
  deferredUntil: z.string().nullable(),
  deferReason: z.string().nullable(),
  executedAt: z.string().nullable(),
  executedAction: RetentionFinalAction.nullable(),
  version: z.number(),
});
export type RetentionCase = z.infer<typeof RetentionCase>;

const caseIds = z.array(z.uuid()).min(1).max(500);
const day = z.iso.date();

/** Offers the cases to the archive; the export is downloaded with the returned `offerId`. */
export const RetentionOffer = z.object({ caseIds, archive: z.string().trim().min(1).max(200), note: z.string().trim().max(500).default('') });
export type RetentionOffer = z.input<typeof RetentionOffer>;

/** Decision of the archive on offered cases. */
export const RetentionDecision = z.object({
  caseIds,
  decision: z.enum(['accepted', 'destroyed']),
  date: day,
  note: z.string().trim().max(500).default(''),
});
export type RetentionDecision = z.input<typeof RetentionDecision>;

/** Defers special cases until a day, with a reason (e.g. pending proceedings). */
export const RetentionDeferral = z.object({ caseIds, until: day, reason: z.string().trim().min(1).max(500) });
export type RetentionDeferral = z.input<typeof RetentionDeferral>;

/** Runs the action of the cases in f.orga (after the decision of the archive, or a confirmed special case). */
export const RetentionExecution = z.object({ caseIds });
export type RetentionExecution = z.input<typeof RetentionExecution>;

export const RetentionExecutionResult = z.object({
  executed: z.number().int(),
  /** Cases not executed, with the error code (e.g. `retention.decisionMissing`, `retention.costNoticeOpen`). */
  failed: z.array(z.object({ caseId: z.uuid(), code: z.string() })),
});
export type RetentionExecutionResult = z.infer<typeof RetentionExecutionResult>;
