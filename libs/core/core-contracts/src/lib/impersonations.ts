import { z } from 'zod';

/** "Anmeldungen als Sie": an impersonation of the own account, from the audit log. */
export const MyImpersonation = z.object({
  startedAt: z.string(),
  /** End of the impersonation; `null` while it runs or if it expired without ending (at most one hour). */
  endedAt: z.string().nullable(),
  administrator: z.string(),
  reason: z.string(),
});
export type MyImpersonation = z.infer<typeof MyImpersonation>;
