import { z } from 'zod';
import { DriverLicenseSettings } from './driver-license.js';
import { PersonFieldSettings } from './person-fields.js';

/** Allowed range of the ages in the membership rules (years); keeps out typos such as negative values or 170 instead of 17. */
export const MEMBERSHIP_AGE_BOUNDS = {
  minimumAgeYouth: [6, 18],
  minimumAgeOperational: [10, 30],
  minimumAgeIncidents: [10, 30],
  ageLimitOperational: [40, 99],
  veteransApplicationAge: [30, 99],
  youthEndAge: [10, 30],
} as const satisfies Record<string, readonly [number, number]>;

const age = (key: keyof typeof MEMBERSHIP_AGE_BOUNDS, fallback: number) =>
  z.number().int().min(MEMBERSHIP_AGE_BOUNDS[key][0]).max(MEMBERSHIP_AGE_BOUNDS[key][1]).default(fallback);

/**
 * Membership rules from the brigade statute (Feuerwehrsatzung). The ages are common example values; the deciding body
 * and the probation qualifications are empty until the brigade enters them or applies a template (`BW_MEMBERSHIP_TEMPLATE`).
 */
export const MembershipSettings = z.object({
  probationMonths: z.number().int().min(0).max(60).default(12),
  /** Who decides on admission, shown in the UI, e.g. "Feuerwehrausschuss"; empty = not named. */
  admissionDecidedBy: z.string().default(''),
  /** Minimum age on joining a youth department (children's departments are not checked). */
  minimumAgeYouth: age('minimumAgeYouth', 10),
  minimumAgeOperational: age('minimumAgeOperational', 17),
  minimumAgeIncidents: age('minimumAgeIncidents', 18),
  ageLimitOperational: age('ageLimitOperational', 65),
  veteransApplicationAge: age('veteransApplicationAge', 55),
  youthEndAge: age('youthEndAge', 18),
  /** Qualifications to acquire during the probation (catalog keys), e.g. basic training part 1; empty = none. */
  probationQualifications: z.array(z.string()).default([]),
  /** Years of service listed as anniversaries. */
  jubileeYears: z.array(z.number().int().min(1).max(100)).default([10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70]),
  /** Deputies per department commander. */
  maxDeputies: z.number().int().min(0).max(10).default(3),
});
export type MembershipSettings = z.infer<typeof MembershipSettings>;

/**
 * Template values for a brigade in Baden-Württemberg (common example values, not legally verified):
 * every brigade compares them with its own statute (Feuerwehrsatzung) before saving them.
 */
export const BW_MEMBERSHIP_TEMPLATE = {
  probationMonths: 12,
  admissionDecidedBy: 'Feuerwehrausschuss',
  minimumAgeYouth: 10,
  minimumAgeOperational: 17,
  minimumAgeIncidents: 18,
  ageLimitOperational: 65,
  youthEndAge: 18,
  probationQualifications: ['truppmann-1'],
} as const satisfies Partial<z.input<typeof MembershipSettings>>;

/**
 * End of a probation of `months` starting on `date` (`YYYY-MM-DD`): the day before the anniversary, the anniversary
 * clamped to the end of the month (12 months from 15.03.2026 → 14.03.2027; 6 months from 31.08. → 27.02.).
 */
export function probationEnd(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month + months, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + months, Math.min(day, lastDay) - 1)).toISOString().slice(0, 10);
}

/** Texts of honor certificates (German documents); `{honor}`, `{name}` and `{date}` are replaced. */
export const CertificateSettings = z.object({
  honorText: z.string().default('wird in Anerkennung der Verdienste um das Feuerwehrwesen ausgezeichnet mit\n{honor}'),
  /** Place on the certificate; empty = city of the brigade. */
  place: z.string().default(''),
  signer: z.string().default(''),
});
export type CertificateSettings = z.infer<typeof CertificateSettings>;

export const MASTERDATA_SETTINGS = {
  'masterdata.membership': MembershipSettings,
  'masterdata.certificates': CertificateSettings,
  'masterdata.driverLicense': DriverLicenseSettings,
  'masterdata.personFields': PersonFieldSettings,
} as const;
