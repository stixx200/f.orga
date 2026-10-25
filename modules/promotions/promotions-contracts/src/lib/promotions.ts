import { z } from 'zod';
import type { Explanation } from './evaluate.js';
import { PromotionRule } from './rules.js';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const EntryState = z.enum(['fulfilled', 'preview', 'missing', 'excluded', 'manual']);
export type EntryState = z.infer<typeof EntryState>;

/** Decision on a list entry: promote, defer to a later list, or not promote (with reason). */
export const EntryDecision = z.enum(['promote', 'defer', 'reject']);
export type EntryDecision = z.infer<typeof EntryDecision>;

export const ListStatus = z.enum(['draft', 'decided', 'executed']);
export type ListStatus = z.infer<typeof ListStatus>;

/** A person with the next possible promotion, evaluated live. */
export interface Candidate {
  personId: string;
  firstName: string;
  lastName: string;
  departmentId: string | null;
  rank: string | null;
  rankSince: string | null;
  targetRank: string | null;
  ruleKey: string | null;
  state: EntryState;
  /** State by the rules alone, also for an excluded person. */
  ruleState: 'fulfilled' | 'preview' | 'missing';
  /** From when all conditions are met. */
  metOn: string | null;
  missing: Explanation[];
  explanation: Explanation | null;
  exclusion: Exclusion | null;
}

export interface ListEntry {
  personId: string;
  firstName: string;
  lastName: string;
  departmentId: string | null;
  rank: string | null;
  rankSince: string | null;
  targetRank: string;
  ruleKey: string | null;
  state: EntryState;
  metOn: string | null;
  missing: Explanation[];
  decision: EntryDecision;
  comment: string;
}

/** A person who would be on the list by the rules but is excluded; shown greyed out in draft lists. */
export interface ExcludedCandidate {
  personId: string;
  firstName: string;
  lastName: string;
  departmentId: string | null;
  rank: string | null;
  targetRank: string;
  /** Only for those who may manage exclusions. */
  exclusion: Pick<Exclusion, 'from' | 'until' | 'reason'> | null;
}

export interface PromotionList {
  id: string;
  title: string;
  /** Date the conditions are checked on. */
  referenceDate: string;
  /** Date the promotions take effect (rank history, certificates). */
  effectiveDate: string;
  status: ListStatus;
  entries: ListEntry[];
  /** Draft lists only: excluded persons who would otherwise be proposed. */
  excluded: ExcludedCandidate[];
  decidedOn: string | null;
  decidedBy: string | null;
  executedAt: string | null;
  notes: string;
  version: number;
}

export interface PromotionListSummary {
  id: string;
  title: string;
  referenceDate: string;
  effectiveDate: string;
  status: ListStatus;
  promote: number;
  total: number;
}

export const ListInput = z.object({
  title: z.string().trim().min(1).max(200),
  referenceDate: date,
  effectiveDate: date,
  notes: z.string().max(2000).default(''),
});
export type ListInput = z.input<typeof ListInput>;

export const EntryUpdate = z.object({
  decision: EntryDecision,
  comment: z.string().max(1000).default(''),
  version: z.number().int(),
});
export type EntryUpdate = z.input<typeof EntryUpdate>;

/** A promotion outside the rules (e.g. on taking over a function); the comment gives the reason. */
export const ManualEntryInput = z.object({
  personId: z.uuid(),
  targetRank: z.string().min(1),
  comment: z.string().trim().min(1).max(1000),
  version: z.number().int(),
});
export type ManualEntryInput = z.input<typeof ManualEntryInput>;

export const DecideInput = z.object({
  /** Date of the decision (e.g. the committee meeting). */
  decidedOn: date,
  notes: z.string().max(2000).default(''),
  version: z.number().int(),
});
export type DecideInput = z.input<typeof DecideInput>;

/** Excludes a person from promotions, e.g. after a disciplinary measure; `until` = null means until lifted. */
export const ExclusionInput = z.object({
  personId: z.uuid(),
  from: date,
  until: date.nullable().default(null),
  /** Only promotions to this rank (catalog key); `null` = all promotions. */
  targetRank: z.string().min(1).nullable().default(null),
  reason: z.string().trim().min(1).max(1000),
});
export type ExclusionInput = z.input<typeof ExclusionInput>;

export interface Exclusion {
  id: string;
  personId: string;
  firstName: string;
  lastName: string;
  from: string;
  until: string | null;
  targetRank: string | null;
  reason: string;
  createdBy: string;
  version: number;
}

/** Tries a (not yet saved) rule on one person, e.g. in the rule editor. */
export const RuleTestInput = z.object({ personId: z.uuid(), rule: PromotionRule, on: date.optional() });
export type RuleTestInput = z.input<typeof RuleTestInput>;

/** Rank tab in the person file. */
export interface PersonPromotion {
  rank: string | null;
  rankSince: string | null;
  next: Candidate | null;
  /** Lists the person appears on. */
  lists: {
    id: string;
    title: string;
    status: ListStatus;
    targetRank: string;
    decision: EntryDecision;
  }[];
}

export const PROMOTIONS_EVENTS = {
  executed: 'promotions.list.executed',
} as const;

export interface PromotionsExecutedEvent {
  listId: string;
  effectiveDate: string;
  promotions: { personId: string; rank: string }[];
}
