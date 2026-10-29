import { z } from 'zod';
import { Language, ThirdPartyErasureOutcome, ThirdPartyRef } from '@forga/core-contracts';

/** An access report (Art. 15) for a third party from the chosen places (`POST …/third-parties/access-reports`). */
export const ThirdPartyAccessReportCreate = z.object({
  /** Name of the person as in the letter. */
  name: z.string().trim().min(2).max(200),
  /** Postal address for the letter, lines separated by line breaks; empty = none. */
  address: z.string().trim().max(500).default(''),
  refs: z.array(ThirdPartyRef).min(1).max(200),
  language: Language.default('de'),
  /** Data subject request of the third party the report answers. */
  requestId: z.uuid().nullable().default(null),
});
export type ThirdPartyAccessReportCreate = z.input<typeof ThirdPartyAccessReportCreate>;

/** Erasure (Art. 17) of the data of a third party at the chosen places (`POST …/third-parties/erasure`). */
export const ThirdPartyErasureInput = z.object({
  refs: z.array(ThirdPartyRef).min(1).max(200),
  /** Why, e.g. "Löschantrag vom 12.10.2026"; in the audit log. */
  reason: z.string().trim().min(10).max(2000),
  /** Data subject request (erasure) of the third party. */
  requestId: z.uuid().nullable().default(null),
});
export type ThirdPartyErasureInput = z.input<typeof ThirdPartyErasureInput>;

export const ThirdPartyErasureResult = z.object({
  results: z.array(ThirdPartyRef.extend({ outcome: ThirdPartyErasureOutcome, code: z.string().nullable() })),
});
export type ThirdPartyErasureResult = z.infer<typeof ThirdPartyErasureResult>;
