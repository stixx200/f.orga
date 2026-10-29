import { z } from 'zod';

/**
 * Kind of installation (`FORGA_STAGE`): `production` holds real personal data; `test` is for demo data only (band on
 * every page, no transfer of real data); `development` is the developer's machine.
 */
export const ForgaStage = z.enum(['production', 'test', 'development']);
export type ForgaStage = z.infer<typeof ForgaStage>;

/** E-mails without person names (L18). Deadlines and notifications about health always go without names when on. */
export const SecuritySettings = z.object({
  /** Deadlines and notifications with a health reference (e.g. medical examination) only as counts. */
  mailHealthWithoutNames: z.boolean().default(true),
  /** Every deadline of the weekly e-mail only as counts per module. */
  mailAllWithoutNames: z.boolean().default(false),
  /** Users get an e-mail when an administrator logs in as them ("Anmelden als", L15). */
  notifyImpersonation: z.boolean().default(true),
  /** Sessions of accounts with privileged permissions (step-up, privileged) end after this many minutes without input. */
  idleMinutesPrivileged: z.number().int().min(5).max(24 * 60).default(60),
  /** Sessions of other accounts end after this many minutes without input. */
  idleMinutesOther: z.number().int().min(5).max(7 * 24 * 60).default(8 * 60),
  /** „Angemeldet bleiben“ (at most 14 days, no idle logout) is offered to accounts without privileged permissions. */
  allowRemember: z.boolean().default(true),
});
export type SecuritySettings = z.infer<typeof SecuritySettings>;

/** State shown under "Settings → Data protection → Security". */
export const SecurityStatus = z.object({
  stage: ForgaStage,
  /** The request reached f.orga over HTTPS (directly or via a trusted proxy, `FORGA_TRUST_PROXY`). */
  https: z.boolean(),
  /** The address of f.orga (setting or `FORGA_PUBLIC_URL`) is an `https://` address. */
  publicUrlHttps: z.boolean(),
  /** The session cookie is sent with `Secure`. */
  secureCookies: z.boolean(),
});
export type SecurityStatus = z.infer<typeof SecurityStatus>;

/** `GET /api/core/setup` (public): data of the sign-in page and the stage for the band of the test system. */
export interface SetupState {
  required: boolean;
  brigadeName: string | null;
  oidc: { label: { de: string; en: string } } | null;
  stage: ForgaStage;
  /** The sign-in page offers „Angemeldet bleiben“ (setting `security.allowRemember`). */
  rememberAllowed: boolean;
}
