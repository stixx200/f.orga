import type { CostRounding, PersonnelKind, PersonnelRate, Position, VehicleRate } from './cost-recovery.js';

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

/** Positions whose amount differs from the calculated one need a reason. */
export const missingReasons = (positions: Position[]) => positions.filter((p) => p.computedAmount !== null && round2(p.amount) !== round2(p.computedAmount) && !p.reason.trim());
