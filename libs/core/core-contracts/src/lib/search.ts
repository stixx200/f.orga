import { z } from 'zod';
import { LocalizedText } from './i18n.js';

/** A hit of the global search (`GET /api/core/search?q=`). */
export const SearchHit = z.object({
  id: z.string(),
  /** Group heading, e.g. "Personen". */
  group: LocalizedText,
  title: z.string(),
  description: z.string().optional(),
  /** Route in the shell, e.g. `/masterdata/persons/<id>`. */
  to: z.string(),
});
export type SearchHit = z.infer<typeof SearchHit>;

/** Result of applying the retention rules (`POST /api/core/retention/run`). */
export const RetentionResult = z.object({
  dryRun: z.boolean(),
  /** Count per rule, e.g. `{ 'core.audit': 120, 'masterdata.persons': 3 }`. */
  counts: z.record(z.string(), z.number()),
});
export type RetentionResult = z.infer<typeof RetentionResult>;
