import type {
  Compensation,
  CompensationKind,
  CompensationRate,
  IncidentSettings,
  Rounding,
} from '@forga/incidents-contracts';

const MINUTE = 60_000;

/** Calendar date (`YYYY-MM-DD`) of a timestamp in Europe/Berlin. */
export function localDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(iso));
}

/**
 * Billable hours between two timestamps.
 * Started hour: 13:05–14:10 → 2 h. Started half hour: 13:05–14:10 → 1.5 h.
 */
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

/** The rate of the kind valid on the date (latest `validFrom` not after the date), or `null`. */
export function rateOn(rates: readonly CompensationRate[], kind: CompensationKind, date: string): number | null {
  const valid = rates.filter((r) => r.kind === kind && r.validFrom <= date).toSorted((a, b) => b.validFrom.localeCompare(a.validFrom));
  return valid[0]?.amount ?? null;
}

export interface CompensationInput {
  from: string;
  to: string;
  /** Guests from other brigades are never compensated. */
  guest: boolean;
  standby: boolean;
  duringWorkingHours: boolean;
  allowances: readonly string[];
  override: { amount: number; reason: string } | null;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Compensation of one person for one report:
 * started hours (at least `minimumHours`) × hourly rate, standby always `standbyHours`, plus allowances.
 * Guests get nothing, assignments during working hours only with `compensateDuringWorkingHours`.
 */
export function computeCompensation(input: CompensationInput, settings: IncidentSettings, kind: CompensationKind): Compensation {
  if (input.guest || (input.duringWorkingHours && !settings.compensateDuringWorkingHours)) {
    return { hours: 0, rate: null, allowances: 0, amount: 0, overridden: false };
  }
  const effectiveKind: CompensationKind = input.standby ? 'standby' : kind;
  const billable = billableHours(input.from, input.to, settings.rounding);
  const hours = input.standby ? settings.standbyHours : billable > 0 && settings.minimumHours ? Math.max(billable, settings.minimumHours) : billable;
  const rate = rateOn(settings.rates, effectiveKind, localDate(input.from));
  const allowances = settings.allowances
    .filter((a) => input.allowances.includes(a.key))
    .reduce((sum, a) => sum + a.amount, 0);
  const computed = round2(hours * (rate ?? 0) + allowances);
  if (input.override) {
    return { hours, rate, allowances, amount: round2(input.override.amount), overridden: true };
  }
  return { hours, rate, allowances, amount: computed, overridden: false };
}
