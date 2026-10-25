import type { CostRounding, Payment, PersonnelKind, PersonnelRate, Position, VehicleRate } from './cost-recovery.js';

const MINUTE = 60_000;

/** Billable hours of a period. `half-then-hour`: up to 30 minutes half an hour, beyond started hours (as some cost recovery statutes count). */
export function billableHours(from: string, to: string, rounding: CostRounding): number {
  const minutes = Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / MINUTE);
  if (minutes === 0) return 0;
  switch (rounding) {
    case 'started-half-hour':
      return Math.ceil(minutes / 30) / 2;
    case 'half-then-hour':
      return minutes <= 30 ? 0.5 : Math.ceil(minutes / 60);
    case 'started-hour':
      return Math.ceil(minutes / 60);
  }
}

const latest = <T extends { validFrom: string }>(rates: T[], date: string) => rates.filter((r) => r.validFrom <= date).toSorted((a, b) => b.validFrom.localeCompare(a.validFrom))[0];

export const vehicleRateOn = (rates: VehicleRate[], category: string, date: string) => latest(rates.filter((r) => r.category === category), date)?.amount ?? null;
export const personnelRateOn = (rates: PersonnelRate[], kind: PersonnelKind, date: string) => latest(rates.filter((r) => r.kind === kind), date)?.amount ?? null;

export const round2 = (value: number) => Math.round(value * 100) / 100;

/** Total of the positions. */
export const totalOf = (positions: Pick<Position, 'amount'>[]) => round2(positions.reduce((s, p) => s + p.amount, 0));

/** The amount a position should have: as calculated, or quantity × rate for positions added by hand. */
export const expectedAmount = (p: Pick<Position, 'computedAmount' | 'quantity' | 'rate'>) => (p.computedAmount !== null ? p.computedAmount : round2(p.quantity * p.rate));

/** Positions whose amount differs from the calculated one (or from quantity × rate) need a reason. */
export const missingReasons = <P extends Pick<Position, 'amount' | 'computedAmount' | 'quantity' | 'rate' | 'reason'>>(positions: P[]) =>
  positions.filter((p) => round2(p.amount) !== round2(expectedAmount(p)) && !p.reason.trim());

/** Sum of the payments not reversed. */
export const paidOf = (payments: Pick<Payment, 'amount' | 'reversal'>[]) => round2(payments.filter((p) => !p.reversal).reduce((s, p) => s + p.amount, 0));

/**
 * Removes repeated parts of a location text, e.g. "Hauptstraße 1, 12345 Musterstadt, Musterstadt" (district equal
 * to the city) becomes "Hauptstraße 1, 12345 Musterstadt".
 */
export function cleanLocation(location: string): string {
  const parts = location.split(',').map((p) => p.trim()).filter(Boolean);
  const kept: string[] = [];
  for (const part of parts) {
    const lower = part.toLocaleLowerCase('de');
    if (kept.some((k) => k.toLocaleLowerCase('de') === lower || k.toLocaleLowerCase('de').endsWith(` ${lower}`))) continue;
    kept.push(part);
  }
  return kept.join(', ');
}
