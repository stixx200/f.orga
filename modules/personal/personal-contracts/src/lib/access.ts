import { z } from 'zod';
import { LocalizedText } from '@forga/core-contracts';

/** Prefix of a personal access key, so it is not confused with an info-terminal key (`fit_`). */
export const ACCESS_KEY_PREFIX = 'fpa_';

/** Cookie of the personal view. Scoped to the kiosk API, so it is not sent with the administration. */
export const PERSONAL_COOKIE = 'forga_personal';

export const KIOSK_API_PATH = '/api/personal/kiosk';

const Named = z.object({ key: z.string(), name: LocalizedText });

export const PersonalView = z.object({
  id: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  status: z.string(),
  street: z.string(),
  postalCode: z.string(),
  city: z.string(),
  phonePrivate: z.string(),
  phoneMobile: z.string(),
  phoneWork: z.string(),
  email: z.string(),
  joinedOn: z.string().nullable(),
  memberships: z.array(z.object({ departmentId: z.uuid(), name: z.string(), primary: z.boolean() })),
  rank: Named.nullable(),
  qualifications: z.array(Named.extend({ acquiredOn: z.string(), validUntil: z.string().nullable() })),
  offices: z.array(Named.extend({ from: z.string(), to: z.string().nullable() })),
  /** `null` when the respiratory-protection module is not installed. */
  respiratory: z
    .object({
      color: z.enum(['green', 'yellow', 'red', 'grey']),
      nextDue: z.string().nullable(),
      evidence: z.array(z.object({ kind: z.string(), date: z.string(), validUntil: z.string().nullable(), passed: z.boolean().nullable() })),
    })
    .nullable(),
});
export type PersonalView = z.infer<typeof PersonalView>;

export const PersonalLink = z.object({
  id: z.uuid(),
  personId: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  keyPrefix: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
  active: z.boolean(),
});
export type PersonalLink = z.infer<typeof PersonalLink>;

/** Returned once, when a link is created. The key is not stored in clear text. */
export const PersonalLinkCreated = z.object({
  link: PersonalLink,
  url: z.string(),
  key: z.string(),
});
export type PersonalLinkCreated = z.infer<typeof PersonalLinkCreated>;

export const ShownLink = z.object({ url: z.string(), key: z.string() });
export type ShownLink = z.infer<typeof ShownLink>;

export const KioskSessionInput = z.object({ key: z.string().min(1).max(200) });
export type KioskSessionInput = z.infer<typeof KioskSessionInput>;
