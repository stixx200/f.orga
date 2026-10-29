import { z } from 'zod';
import { LocalizedText } from './i18n.js';

/**
 * Result of the erasure check (Art. 17 GDPR) for one data area: `delete` the data, `anonymize` it (the record stays
 * without what identifies the person, e.g. for statistics), or `keep` it restricted (Art. 18) while a retention period
 * of the retention plan runs (Art. 17(3)).
 */
export const ErasureOutcome = z.enum(['delete', 'anonymize', 'keep']);
export type ErasureOutcome = z.infer<typeof ErasureOutcome>;

/** One row of the erasure check, as a module reports it (`PersonDataHandler.erasure`) and the request page shows it. */
export const ErasureArea = z.object({
  /** `<module-id>.<area>`, e.g. `respiratory-protection.evidence`. */
  key: z.string(),
  module: z.string(),
  /** Area („Bereich“), e.g. "Atemschutz". */
  title: LocalizedText,
  /** What is stored („Daten“), e.g. "4 Nachweise, 1 Eignungsuntersuchung". */
  data: LocalizedText,
  /** Number of records concerned (counted in the audit entry). */
  count: z.number().int().nonnegative(),
  outcome: ErasureOutcome,
  /** `keep`: end of the retention period; `null` while it has not started (e.g. still a member) or no period is set. */
  keepUntil: z.string().nullable(),
  /** Why: the retention period ("Personalstammrolle: 15 Jahre nach Austritt") or what stays ("Statistik bleibt"). */
  reason: LocalizedText.nullable(),
});
export type ErasureArea = z.infer<typeof ErasureArea>;
