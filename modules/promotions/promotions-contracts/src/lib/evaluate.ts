import type { Condition, PromotionRule } from './rules.js';

export interface CareerFacts {
  /** Current rank; persons in probation without rank count as `probation`. */
  rank: string | null;
  /** Date of the last rank change; `null` if unknown. */
  rankSince: string | null;
  joinedOn: string | null;
  probationEndsOn: string | null;
  musician: boolean;
  /** Qualification key → date acquired. */
  qualifications: ReadonlyMap<string, string>;
  /** Offices held, also past ones. */
  offices?: readonly { office: string; from: string; to: string | null }[];
  /** Periods that do not count as service time (dormant membership, service in another brigade). */
  restPeriods?: readonly { from: string; to: string | null }[];
}

const DAY = 86_400_000;
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/**
 * End of a service time of `years` from `from`, extended by the rest periods within it; `null` while a rest period
 * without end lies within (the time does not run, so the date is not foreseeable).
 */
export function serviceEnd(from: string, years: number, restPeriods: readonly { from: string; to: string | null }[] = []): string | null {
  let end = addYears(from, years);
  // Each extension can reach further rest periods, so repeat until the date is stable.
  for (let i = 0; i <= restPeriods.length; i++) {
    let days = 0;
    for (const r of restPeriods) {
      if (r.from >= end || (r.to && r.to < from)) continue;
      if (!r.to) return null;
      const start = r.from < from ? from : r.from;
      days += (Date.parse(r.to) - Date.parse(start)) / DAY + 1;
    }
    const next = addDays(addYears(from, years), days);
    if (next === end) break;
    end = next;
  }
  return end;
}

export interface Context {
  /** Inhabitants of the municipality. */
  population: number | null;
  /** Inhabitants of the district of the person's primary department; `null` = those of the municipality. */
  departmentPopulation?: number | null;
}

/** Why a condition is (not) met; the UI phrases it from `condition`. */
export interface Explanation {
  condition: Condition;
  met: boolean;
  /** Date from which it is met, `null` if not foreseeable (e.g. a missing course). */
  metOn: string | null;
  children?: Explanation[];
}

/** Adds (possibly fractional) years to a date; the 29th of February becomes the 28th. */
export function addYears(date: string, years: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const whole = Math.floor(years);
  const months = Math.round((years - whole) * 12);
  const target = new Date(Date.UTC(y + whole, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

const latest = (dates: string[]) => dates.toSorted().at(-1) ?? null;
const earliest = (dates: string[]) => dates.toSorted()[0] ?? null;

/** Evaluates a condition on a date. Time-based conditions also say from when they are met. */
export function explain(condition: Condition, facts: CareerFacts, context: Context, on: string): Explanation {
  const timed = (from: string | null, years: number): Explanation => {
    const metOn = from ? serviceEnd(from, years, facts.restPeriods) : null;
    return { condition, met: metOn !== null && metOn <= on, metOn };
  };
  switch (condition.type) {
    case 'and': {
      const children = condition.children.map((c) => explain(c, facts, context, on));
      const dates = children.map((c) => (c.met ? on : c.metOn));
      return {
        condition,
        met: children.every((c) => c.met),
        metOn: dates.includes(null) ? null : latest(dates as string[]),
        children,
      };
    }
    case 'or': {
      const children = condition.children.map((c) => explain(c, facts, context, on));
      return {
        condition,
        met: children.some((c) => c.met),
        metOn: earliest(children.flatMap((c) => (c.met ? [on] : c.metOn ? [c.metOn] : []))),
        children,
      };
    }
    case 'rank':
      return {
        condition,
        met: facts.rank !== null && condition.ranks.includes(facts.rank),
        metOn: null,
      };
    case 'years-in-rank':
    case 'min-interval':
      return timed(facts.rankSince, condition.years);
    case 'years-since-joining':
      return timed(facts.joinedOn, condition.years);
    case 'qualification': {
      const metOn = earliest(
        condition.keys.flatMap((k) => {
          const d = facts.qualifications.get(k);
          return d ? [d] : [];
        }),
      );
      return { condition, met: metOn !== null && metOn <= on, metOn };
    }
    case 'probation-ended':
      // Without a probation end (e.g. imported members), the probation counts as ended.
      return {
        condition,
        met: (facts.probationEndsOn ?? '') <= on,
        metOn: facts.probationEndsOn,
      };
    case 'musician':
      return {
        condition,
        met: facts.musician === condition.value,
        metOn: null,
      };
    case 'office': {
      // Earliest date from which a holding meets the condition (held on the date, or ever; at least `years` long).
      const dates = (facts.offices ?? [])
        .filter((o) => condition.keys.includes(o.office))
        .flatMap((o) => {
          const metOn = condition.years ? addYears(o.from, condition.years) : o.from;
          if (o.to && o.to < metOn) return [];
          if (condition.current && o.to && o.to < on) return [];
          return [metOn];
        });
      const metOn = earliest(dates);
      return { condition, met: metOn !== null && metOn <= on, metOn };
    }
    case 'population': {
      const p = condition.scope === 'department' ? (context.departmentPopulation ?? context.population) : context.population;
      return {
        condition,
        met: p !== null && (condition.min === null || p >= condition.min) && (condition.max === null || p <= condition.max),
        metOn: null,
      };
    }
  }
}

export type CandidateState = 'fulfilled' | 'preview' | 'missing';

export interface Evaluation {
  rule: PromotionRule;
  state: CandidateState;
  /** From when all conditions are met; `null` if not foreseeable. */
  metOn: string | null;
  explanation: Explanation;
  /** Unmet leaf conditions; for an "or" those of the alternative met first. */
  missing: Explanation[];
}

export function missingLeaves(e: Explanation): Explanation[] {
  if (e.met) return [];
  if (!e.children) return [e];
  if (e.condition.type === 'or') {
    const best = e.children.filter((c) => c.metOn).toSorted((a, b) => String(a.metOn).localeCompare(String(b.metOn)))[0] ?? e.children[0];
    return best ? missingLeaves(best) : [];
  }
  return e.children.flatMap(missingLeaves);
}

/** Whether the rule starts from the rank: every `rank` condition on the "and" path must accept it. */
export function startsFrom(condition: Condition, rank: string | null): boolean {
  switch (condition.type) {
    case 'rank':
      return rank !== null && condition.ranks.includes(rank);
    case 'and':
      return condition.children.every((c) => startsFrom(c, rank));
    case 'or':
      return condition.children.some((c) => startsFrom(c, rank));
    default:
      return true;
  }
}

export function evaluateRule(rule: PromotionRule, facts: CareerFacts, context: Context, on: string, previewUntil: string): Evaluation {
  const explanation = explain(rule.condition, facts, context, on);
  const state: CandidateState = explanation.met
    ? 'fulfilled'
    : explanation.metOn && explanation.metOn <= previewUntil && explain(rule.condition, facts, context, previewUntil).met
      ? 'preview'
      : 'missing';
  return {
    rule,
    state,
    metOn: explanation.met ? on : explanation.metOn,
    explanation,
    missing: missingLeaves(explanation),
  };
}

/**
 * The next promotion of a person on the reference date: among the active rules starting from the current rank,
 * fulfilled before preview before missing. A fulfilled or preview one with the highest target rank (e.g. skipping to LM
 * as group leader); a missing one met first, then with the lowest target rank (the next step).
 * Rules leading to a rank not above the current one are ignored.
 */
export function evaluatePerson(facts: CareerFacts, rules: PromotionRule[], context: Context, on: string, previewUntil: string, rankOrder: readonly string[]): Evaluation | null {
  const current = facts.rank === null ? -1 : rankOrder.indexOf(facts.rank);
  const weight = { fulfilled: 0, preview: 1, missing: 2 } as const;
  const candidates = rules.filter((r) => r.active && rankOrder.indexOf(r.rank) > current && startsFrom(r.condition, facts.rank)).map((r) => evaluateRule(r, facts, context, on, previewUntil));
  const level = (e: Evaluation) => rankOrder.indexOf(e.rule.rank);
  const byDate = (a: Evaluation, b: Evaluation) => (a.metOn ?? '9999').localeCompare(b.metOn ?? '9999');
  return candidates.toSorted((a, b) => weight[a.state] - weight[b.state] || (a.state === 'missing' ? byDate(a, b) || level(a) - level(b) : level(b) - level(a)))[0] ?? null;
}
