import { z } from 'zod';
import { LocalizedText } from './i18n.js';
import { ReminderSettings } from './tasks.js';

/** Brigade details used in page headers, footers and printouts. */
export const BrigadeSettings = z.object({
  name: z.string().trim().min(1),
  street: z.string().trim().default(''),
  postalCode: z.string().trim().default(''),
  city: z.string().trim().default(''),
  phone: z.string().trim().default(''),
  fax: z.string().trim().default(''),
  website: z.string().trim().default(''),
  email: z.string().trim().default(''),
  /** Municipality the brigade belongs to, e.g. "Stadt Musterstadt". */
  municipality: z.string().trim().default(''),
  /** Inhabitants of the municipality (annual statistics, rank limits). */
  population: z.number().int().min(0).nullable().default(null),
  /** Address of f.orga as users open it, e.g. `https://forga.feuerwehr-musterstadt.example`; used in e-mail links. */
  publicUrl: z.string().trim().default(''),
});
export type BrigadeSettings = z.infer<typeof BrigadeSettings>;

export const SmtpSettings = z.object({
  host: z.string().trim().default(''),
  port: z.number().int().min(1).max(65535).default(587),
  starttls: z.boolean().default(true),
  username: z.string().default(''),
  /** Never returned by the API; leave empty to keep the stored password. */
  password: z.string().optional(),
  sender: z.string().trim().default(''),
});
export type SmtpSettings = z.infer<typeof SmtpSettings>;

/** Data protection: anonymising former members and keeping the audit log. */
export const PrivacySettings = z.object({
  /** Persons who left are anonymised this many years after leaving; `null` = never. */
  anonymizeLeftAfterYears: z.number().int().min(1).max(50).nullable().default(10),
  /** Audit entries older than this are deleted. */
  auditRetentionMonths: z.number().int().min(6).max(240).default(24),
});
export type PrivacySettings = z.infer<typeof PrivacySettings>;

/** Settings sections of the core with their schema. Modules add their own sections. */
/**
 * Sign-in with an OpenID Connect provider (e.g. Microsoft 365 or Keycloak of the municipality).
 * Users must exist in f.orga; on the first sign-in they are found by e-mail or username and linked.
 * Roles and permissions always stay in f.orga.
 */
export const OidcSettings = z.object({
  enabled: z.boolean().default(false),
  /** Issuer URL, e.g. `https://login.microsoftonline.com/<tenant>/v2.0`. */
  issuer: z.string().trim().default(''),
  clientId: z.string().trim().default(''),
  /** Never returned by the API; leave empty to keep the stored secret. */
  clientSecret: z.string().optional(),
  scopes: z.string().trim().default('openid email profile'),
  /** How a not yet linked account is found: verified e-mail or the `preferred_username` claim. */
  matchBy: z.enum(['email', 'username']).default('email'),
  buttonLabel: LocalizedText.default({ de: 'Mit Konto der Gemeinde anmelden', en: 'Sign in with the municipal account' }),
});
export type OidcSettings = z.infer<typeof OidcSettings>;

export const CORE_SETTINGS = {
  brigade: BrigadeSettings,
  smtp: SmtpSettings,
  reminders: ReminderSettings,
  privacy: PrivacySettings,
  oidc: OidcSettings,
} as const;

/** Fields that are write-only and never leave the server. */
export const SECRET_SETTING_FIELDS: Record<string, string[]> = { smtp: ['password'], oidc: ['clientSecret'] };
