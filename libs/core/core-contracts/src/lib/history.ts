import { z } from 'zod';

export const HistoryAction = z.enum(['created', 'updated', 'deleted']);
export type HistoryAction = z.infer<typeof HistoryAction>;

export const FieldChange = z.object({
  old: z.unknown(),
  new: z.unknown(),
  /** Set when the values are masked because the reader lacks the permission (e.g. sensitive data). */
  hidden: z.boolean().optional(),
  /**
   * The old or new value was removed as wrong or unlawfully recorded (rectification, Art. 16): day of the removal
   * ("berichtigt, Wert entfernt am …"); the value itself is gone.
   */
  redactedOld: z.string().optional(),
  redactedNew: z.string().optional(),
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

/**
 * "Wert in der Historie unkenntlich machen" (`POST /api/core/history/entries/:id/redact`, `core.privacy.manage`): removes
 * the old or new value of a field from one history entry; the entry stays with the note "berichtigt, Wert entfernt am …".
 */
export const HistoryRedactionInput = z.object({
  field: z.string().min(1).max(200),
  side: z.enum(['old', 'new']),
  reason: z.string().trim().min(10).max(2000),
});
export type HistoryRedactionInput = z.infer<typeof HistoryRedactionInput>;
