import type { CostRounding, NoticeStatus, Payment, PersonnelKind, PersonnelRate, Position, VehicleRate } from './cost-recovery.js';

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

/** Statuses in which payments count: in effect, paid, or cancelled (then everything paid is refunded). */
const SETTLED_AGAINST: NoticeStatus[] = ['issued', 'handed-over', 'objection', 'paid', 'cancelled'];

/** The amount the debtor owes: the total, nothing after a cancellation. */
export const claimOf = (n: { status: NoticeStatus; positions: Pick<Position, 'amount'>[] }) => (n.status === 'cancelled' ? 0 : totalOf(n.positions));

/** Overpaid amount to refund: payments above the claim (on a cancelled notice all payments); 0 = none. */
export function refundDueOf(n: { status: NoticeStatus; positions: Pick<Position, 'amount'>[]; payments: Pick<Payment, 'amount' | 'reversal'>[] }): number {
  if (!SETTLED_AGAINST.includes(n.status)) return 0;
  return Math.max(0, round2(paidOf(n.payments) - claimOf(n)));
}

/**
 * Amount of a payment file in German or international notation: `1.234,50`, `1234,5`, `1.000` (thousands separator,
 * no decimals), `1234.50`, `1,234.50`; `null` when it is no number.
 */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/[€\s\u00a0]/g, '').replace(/EUR$/i, '');
  if (!/^-?[\d.,]+$/.test(cleaned)) return null;
  const comma = cleaned.lastIndexOf(',');
  const dot = cleaned.lastIndexOf('.');
  let normalized: string;
  if (comma > dot) normalized = cleaned.replace(/\./g, '').replace(',', '.');
  else if (dot > comma && /^-?\d{1,3}(\.\d{3})+$/.test(cleaned)) normalized = cleaned.replace(/\./g, '');
  else normalized = cleaned.replace(/,/g, '');
  if ((normalized.match(/\./g) ?? []).length > 1) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? round2(value) : null;
}

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
