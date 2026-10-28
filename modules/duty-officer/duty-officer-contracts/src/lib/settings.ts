import { z } from 'zod';
import { LocalizedText } from '@forga/core-contracts';

/** Kind of duty officer service from the duty roster with its rate per day. */
export const DutyKind = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: LocalizedText,
  /** Which days of a duty period are paid: only full 24 hours, or every started day. */
  unit: z.enum(['full-day', 'started-day']).default('full-day'),
  rates: z.array(z.object({ amountPerDay: z.number().min(0), validFrom: z.iso.date() })).default([]),
});
export type DutyKind = z.infer<typeof DutyKind>;

/**
 * Example duty kind of a compensation statute (duty officer 10 € per full day). It is not applied by default: the
 * settings offer it as a template, so nobody is compensated with sample values by accident.
 */
export const DUTY_KIND_TEMPLATE: DutyKind[] = [
  {
    key: 'duty-officer',
    name: { de: 'Einsatzleiter vom Dienst (EvD)', en: 'Duty officer' },
    unit: 'full-day',
    rates: [{ amountPerDay: 10, validFrom: '2026-01-01' }],
  },
];

/** Settings section `duty-officer.general`. */
export const DutyOfficerSettings = z.object({
  /** Every incident created in f.orga (not imported) gets an EvD report; it can be switched off per incident. */
  reportRequired: z.boolean().default(true),
  /** Special services of the duty roster; empty until the template or own kinds are saved. */
  dutyKinds: z.array(DutyKind).default([]),
});
export type DutyOfficerSettings = z.infer<typeof DutyOfficerSettings>;

export const DUTY_OFFICER_SETTINGS = {
  'duty-officer.general': DutyOfficerSettings,
} as const;

/** Calendar date (`YYYY-MM-DD`) of a timestamp in Europe/Berlin. */
function localDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(iso));
}

/** Full days (24 h) of a duty period. */
export function fullDays(from: string, to: string): number {
  return Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));
}

/** Started days of a duty period (25 hours are two days). */
export function startedDays(from: string, to: string): number {
  return Math.max(0, Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000));
}

/** Compensation of a duty period: full or started days (per duty kind) × rate per day valid on the first day. */
export function dutyCompensation(duty: { from: string; to: string; kind: string }, kinds: readonly DutyKind[]): { days: number; rate: number | null; amount: number } {
  const kind = kinds.find((k) => k.key === duty.kind);
  const days = kind?.unit === 'started-day' ? startedDays(duty.from, duty.to) : fullDays(duty.from, duty.to);
  const rates = kind?.rates ?? [];
  const date = localDate(duty.from);
  const rate = rates.filter((r) => r.validFrom <= date).toSorted((a, b) => b.validFrom.localeCompare(a.validFrom))[0]?.amountPerDay ?? null;
  return { days, rate, amount: Math.round(days * (rate ?? 0) * 100) / 100 };
}
