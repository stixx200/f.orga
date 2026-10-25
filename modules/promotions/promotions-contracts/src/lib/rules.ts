import { z } from 'zod';
import { LocalizedText } from '@forga/core-contracts';

/**
 * Building blocks of a promotion rule. A rule is a tree of `and`/`or` with these conditions;
 * the rules are configuration, not code (lesson from FeuerON).
 */
export type Condition =
  | { type: 'and'; children: Condition[] }
  | { type: 'or'; children: Condition[] }
  /** Current rank is one of these. */
  | { type: 'rank'; ranks: string[] }
  /** At least so many years in the current rank (since the last promotion). */
  | { type: 'years-in-rank'; years: number }
  | { type: 'years-since-joining'; years: number }
  /** One of these qualifications (from passed courses). */
  | { type: 'qualification'; keys: string[] }
  | { type: 'probation-ended' }
  | { type: 'musician'; value: boolean }
  /** Population of the municipality (brigade settings) or, with `scope: 'department'`, of the district of the primary department. */
  | { type: 'population'; min: number | null; max: number | null; scope?: 'municipality' | 'department' }
  /** Holds one of these offices on the date (`current`), or has ever held one; optionally for at least `years`. */
  | { type: 'office'; keys: string[]; current: boolean; years?: number }
  /** Minimum time since the last promotion (general rule: 1 year). */
  | { type: 'min-interval'; years: number };

export const Condition: z.ZodType<Condition> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('and'), children: z.array(Condition) }),
    z.object({ type: z.literal('or'), children: z.array(Condition) }),
    z.object({
      type: z.literal('rank'),
      ranks: z.array(z.string().min(1)).min(1),
    }),
    z.object({
      type: z.literal('years-in-rank'),
      years: z.number().min(0).max(50),
    }),
    z.object({
      type: z.literal('years-since-joining'),
      years: z.number().min(0).max(50),
    }),
    z.object({
      type: z.literal('qualification'),
      keys: z.array(z.string().min(1)).min(1),
    }),
    z.object({ type: z.literal('probation-ended') }),
    z.object({ type: z.literal('musician'), value: z.boolean() }),
    z.object({
      type: z.literal('population'),
      min: z.number().int().nullable(),
      max: z.number().int().nullable(),
      scope: z.enum(['municipality', 'department']).optional(),
    }),
    z.object({
      type: z.literal('office'),
      keys: z.array(z.string().min(1)).min(1),
      current: z.boolean(),
      years: z.number().min(0).max(50).optional(),
    }),
    z.object({
      type: z.literal('min-interval'),
      years: z.number().min(0).max(10),
    }),
  ]),
);

export const PromotionRule = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  /** Rank reached by this rule. */
  rank: z.string().min(1),
  /** Shown in the list as the basis. */
  description: LocalizedText,
  condition: Condition,
  active: z.boolean().default(true),
});
export type PromotionRule = z.infer<typeof PromotionRule>;

export const PromotionSettings = z.object({
  rules: z.array(PromotionRule).default([]),
  /** Months after the reference date shown as "preview". */
  previewMonths: z.number().int().min(0).max(24).default(3),
  /** Statuses of members who can be promoted, e.g. also veterans where the statute allows it. */
  eligibleStatuses: z.array(z.enum(['active', 'probation', 'passive', 'youth', 'veterans'])).min(1).default(['active', 'probation']),
  /** Text of the certificates (German documents), `{name}` and `{rank}` are replaced. */
  certificateText: z.string().default('wird mit Wirkung vom {date} zum/zur {rank} befördert.'),
  /** Place and signer on the certificates. */
  certificatePlace: z.string().default(''),
  certificateSigner: z.string().default(''),
});
export type PromotionSettings = z.infer<typeof PromotionSettings>;

export const PROMOTIONS_SETTINGS = {
  'promotions.general': PromotionSettings,
} as const;

const and = (...children: Condition[]): Condition => ({
  type: 'and',
  children,
});
const or = (...children: Condition[]): Condition => ({ type: 'or', children });
const rank = (...ranks: string[]): Condition => ({ type: 'rank', ranks });
const years = (n: number): Condition => ({ type: 'years-in-rank', years: n });
const q = (...keys: string[]): Condition => ({ type: 'qualification', keys });
const musician: Condition = { type: 'musician', value: true };
const interval: Condition = { type: 'min-interval', years: 1 };
const rule = (key: string, target: string, [de, en]: [string, string], condition: Condition, active = true): PromotionRule => ({
  key,
  rank: target,
  description: { de, en },
  condition,
  active,
});

/**
 * VwV Feuerwehrbekleidung und Dienstgrade of 27.09.2022, Anlage 2, I.1 (volunteers).
 * Music courses (`music-basic`, `music-d2` … `music-c2`) are referenced by qualification keys;
 * they count once the qualification catalog contains them.
 */
export const VWV_2022_RULES: PromotionRule[] = [
  rule(
    'fm',
    'fm',
    ['Probezeit beendet und Truppmann Teil 1 (Musiker: Grundausbildung Musik)', 'Probation ended and basic training part 1 (musicians: basic music training)'],
    and(rank('probation'), { type: 'probation-ended' }, or(q('truppmann-1'), and(musician, q('music-basic')))),
  ),
  rule(
    'ofm',
    'ofm',
    [
      '10 Jahre FM, oder 3 Jahre FM mit Truppmann Teil 2 und Maschinist, Atemschutz oder Sprechfunker, oder 3 Jahre FM als Musiker mit D2',
      '10 years FM, or 3 years FM with basic training part 2 and pump operator, breathing apparatus or radio operator, or 3 years FM as musician with D2',
    ],
    and(rank('fm'), interval, or(years(10), and(years(3), q('truppmann-2'), q('machinist', 'breathing-apparatus', 'radio-operator')), and(years(3), musician, q('music-d2')))),
  ),
  rule(
    'hfm',
    'hfm',
    ['10 Jahre OFM, oder 5 Jahre OFM mit Truppführer, oder 5 Jahre OFM als Musiker mit D3', '10 years OFM, or 5 years OFM with squad leader, or 5 years OFM as musician with D3'],
    and(rank('ofm'), interval, or(years(10), and(years(5), q('squad-leader')), and(years(5), musician, q('music-d3')))),
  ),
  rule(
    'lm',
    'lm',
    ['Gruppenführer (auch als Sprung), oder Musiker mit C1', 'Group leader (also skipping ranks), or musician with C1'],
    and(rank('fm', 'ofm', 'hfm'), interval, or(q('group-leader'), and(musician, q('music-c1')))),
  ),
  rule(
    'olm',
    'olm',
    [
      '10 Jahre LM, oder 5 Jahre LM mit Ausbilder oder Jugendgruppenleiter, oder 5 Jahre LM als Musiker mit C2',
      '10 years LM, or 5 years LM with instructor or youth group leader, or 5 years LM as musician with C2',
    ],
    and(rank('lm'), interval, or(years(10), and(years(5), q('instructor', 'youth-group-leader')), and(years(5), musician, q('music-c2')))),
  ),
  rule('hlm', 'hlm', ['5 Jahre OLM', '5 years OLM'], and(rank('olm'), interval, years(5))),
  rule('bm', 'bm', ['Zugführer (auch als Sprung)', 'Platoon leader (also skipping ranks)'], and(rank('fm', 'ofm', 'hfm', 'lm', 'olm', 'hlm'), interval, q('platoon-leader'))),
  rule('obm', 'obm', ['10 Jahre BM, oder 5 Jahre BM mit Verbandsführer', '10 years BM, or 5 years BM with unit leader'], and(rank('bm'), interval, or(years(10), and(years(5), q('unit-leader'))))),
  rule(
    'hbm',
    'hbm',
    ['10 Jahre OBM, nur in Gemeinden über 15.000 Einwohnern (Höchstdienstgrad mindestens LHBM)', '10 years OBM, only in municipalities above 15,000 inhabitants'],
    and(rank('obm'), interval, years(10), {
      type: 'population',
      min: 15001,
      max: null,
    }),
  ),
  rule(
    'lhbm',
    'lhbm',
    ['Nur Kommandant einer Gemeinde über 15.000 Einwohnern', 'Only the commander of a municipality above 15,000 inhabitants'],
    and(rank('hbm'), interval, { type: 'office', keys: ['commander'], current: true }, { type: 'population', min: 15001, max: null }),
  ),
];
