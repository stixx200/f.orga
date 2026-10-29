import { z } from 'zod';
import { LocalizedText } from './i18n.js';
import { RetentionRule } from './retention.js';
import { SecuritySettings } from './stage.js';
import { ReminderSettings } from './tasks.js';

function isPublicUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return (url.protocol === 'https:' || (url.protocol === 'http:' && local)) && !url.search && !url.hash && !url.username;
  } catch {
    return false;
  }
}

/** Brigade details used in page headers, footers and printouts. */
export const BrigadeSettings = z.object({
  name: z.string().trim().min(1),
  street: z.string().trim().default(''),
  postalCode: z.string().trim().default(''),
  city: z.string().trim().default(''),
  phone: z.string().trim().default(''),
  fax: z.string().trim().default(''),
  website: z.string().trim().default(''),
  email: z.union([z.literal(''), z.email()]).default(''),
  /** Municipality the brigade belongs to, e.g. "Stadt Musterstadt". */
  municipality: z.string().trim().default(''),
  /** Inhabitants of the municipality (annual statistics, rank limits). */
  population: z.number().int().min(0).nullable().default(null),
  /**
   * Address of f.orga as users open it, e.g. `https://forga.feuerwehr-musterstadt.example`; used in e-mail links and as
   * OIDC redirect. HTTPS, plain HTTP only on the local machine (development).
   */
  publicUrl: z
    .string()
    .trim()
    .default('')
    .refine((value) => value === '' || isPublicUrl(value), { message: 'publicUrl must be an https URL' }),
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

/**
 * Data protection: retention period and action per data category (and subtype), keyed like `incidents.incidents:special`.
 * Categories without a stored rule use their default (nothing happens, except deleting the audit log after 2 years).
 */
export const PrivacySettings = z.object({
  retention: z.record(z.string(), RetentionRule).default({}),
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
  /**
   * How a not yet linked account is found: by verified e-mail address, or `username` = not automatically (the username
   * at the provider is neither unique nor verified; users link their account in the profile).
   */
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
  security: SecuritySettings,
} as const;

/** Fields that are write-only and never leave the server. */
export const SECRET_SETTING_FIELDS: Record<string, string[]> = {
  smtp: ['password'],
  oidc: ['clientSecret'],
  /** Backup passphrase, encrypted with the server key (module backup). */
  'backup.general': ['passphraseEncrypted'],
};

/**
 * Who may read a settings section. By default every logged-in user may (module UIs need e.g. the incident settings);
 * the managers of a section are the holders of `core.settings.manage` or `<module>.settings.manage`.
 */
export interface SettingsAccess {
  /** Only the managers may read the section, e.g. server addresses and accounts. */
  managersOnly?: boolean;
  /** Fields only the managers see, e.g. the secret part of a calendar feed address. */
  managerFields?: string[];
}

/**
 * One step of the setup checklist on the start page of administrators, e.g. `smtp` or `module:compensation`.
 * Module steps carry the label of the module's settings page.
 */
export const OnboardingItem = z.object({
  key: z.string(),
  done: z.boolean(),
  /** Page where the step is done. */
  to: z.string(),
  label: LocalizedText.optional(),
});
export type OnboardingItem = z.infer<typeof OnboardingItem>;

export const CORE_SETTINGS_ACCESS: Record<string, SettingsAccess> = {
  smtp: { managersOnly: true },
  oidc: { managersOnly: true },
  privacy: { managersOnly: true },
  reminders: { managersOnly: true },
  security: { managersOnly: true },
};
