import type { CompensationSettings, Rounding, TrainingRate } from './compensation.js';

const MINUTE = 60_000;

/** Billable hours between two timestamps (started hour: 13:05–14:10 → 2 h). */
export function billableHours(from: string, to: string, rounding: Rounding): number {
  const minutes = Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / MINUTE);
  if (minutes === 0) return 0;
  switch (rounding) {
    case 'started-hour':
      return Math.ceil(minutes / 60);
    case 'started-half-hour':
      return Math.ceil(minutes / 30) / 2;
    case 'exact-minutes':
      return Math.round((minutes / 60) * 100) / 100;
  }
}

/** The rate valid on the date (latest `validFrom` not after it), or `null`. */
export function trainingRateOn(rates: readonly TrainingRate[], kind: TrainingRate['kind'], date: string): number | null {
  return rates.filter((r) => r.kind === kind && r.validFrom <= date).toSorted((a, b) => b.validFrom.localeCompare(a.validFrom))[0]?.amount ?? null;
}

export const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Share of an annual allowance for a holder in a year: by full and started months held,
 * or the full amount for the holder on 31 December.
 */
export function allowanceShare(amount: number, year: number, from: string, to: string | null, split: 'holder-at-year-end' | 'by-months'): number {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  if (from > end || (to !== null && to < start)) return 0;
  if (split === 'holder-at-year-end') return to === null || to >= end ? amount : 0;
  const first = from < start ? 1 : Number(from.slice(5, 7));
  const last = to === null || to > end ? 12 : Number(to.slice(5, 7));
  return round2((amount * (last - first + 1)) / 12);
}

/** Intervals that only touch at their ends do not overlap; periods over 24 h (duty officer) are ignored. */
const long = (x: { from: string; to: string }) => new Date(x.to).getTime() - new Date(x.from).getTime() > 24 * 3_600_000;

export function overlapping(a: { from: string; to: string }, b: { from: string; to: string }): boolean {
  if (long(a) || long(b)) return false;
  return new Date(a.from) < new Date(b.to) && new Date(b.from) < new Date(a.to);
}

/** Calendar date (`YYYY-MM-DD`) of a timestamp in Europe/Berlin. */
const berlinDay = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(iso));

/** Calendar days (Europe/Berlin) from the start to the end of an assignment, both counted. */
export function calendarDays(from: string, to: string): number {
  return Math.round((Date.parse(berlinDay(to)) - Date.parse(berlinDay(from))) / 86_400_000) + 1;
}

export type StatuteHint = 'refreshment' | 'multi-day' | 'capped';

/**
 * What the statute makes of the computed compensation of one person in an incident: at most `maxPerService`,
 * the refreshment allowance for long incidents (an amount, or a hint without one) and the multi-day hint.
 */
export function incidentPayout(
  p: { from: string; to: string; amount: number; duringWorkingHours: boolean },
  config: Pick<CompensationSettings, 'maxPerService' | 'refreshment' | 'multiDayAfterDays'>,
): { amount: number; refreshment: number | null; hints: StatuteHint[] } {
  const hints: StatuteHint[] = [];
  const amount = config.maxPerService !== null && p.amount > config.maxPerService ? config.maxPerService : p.amount;
  if (amount !== p.amount) hints.push('capped');
  const lasting = !p.duringWorkingHours && (new Date(p.to).getTime() - new Date(p.from).getTime()) / 3_600_000 > config.refreshment.afterHours;
  if (lasting && config.refreshment.amount === null) hints.push('refreshment');
  if (calendarDays(p.from, p.to) > config.multiDayAfterDays) hints.push('multi-day');
  return { amount, refreshment: lasting ? config.refreshment.amount : null, hints };
}
