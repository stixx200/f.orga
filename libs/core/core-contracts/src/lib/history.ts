import { z } from 'zod';

export const HistoryAction = z.enum(['created', 'updated', 'deleted']);
export type HistoryAction = z.infer<typeof HistoryAction>;

export const FieldChange = z.object({
  old: z.unknown(),
  new: z.unknown(),
  /** Set when the values are masked because the reader lacks the permission (e.g. sensitive data). */
  hidden: z.boolean().optional(),
});
export type FieldChange = z.infer<typeof FieldChange>;

export const HistoryEntry = z.object({
  id: z.string(),
  /** `<schema>.<table>`, e.g. `masterdata.department`. */
  entity: z.string(),
  entityId: z.string(),
  /** Set for entries of child records, e.g. `masterdata.person` for a membership. */
  parentEntity: z.string().nullable(),
  parentId: z.string().nullable(),
  action: HistoryAction,
  changes: z.record(z.string(), FieldChange),
  userId: z.string().nullable(),
  timestamp: z.string(),
});
export type HistoryEntry = z.infer<typeof HistoryEntry>;
