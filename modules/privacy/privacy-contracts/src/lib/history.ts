import { z } from 'zod';

/**
 * "Wert in der Historie unkenntlich machen" (`POST /api/privacy/history/:id/redact`, `privacy.manage`): removes
 * the old or new value of a field from one history entry; the entry stays with the note "berichtigt, Wert entfernt am …".
 */
export const HistoryRedactionInput = z.object({
  field: z.string().min(1).max(200),
  side: z.enum(['old', 'new']),
  reason: z.string().trim().min(10).max(2000),
});
export type HistoryRedactionInput = z.infer<typeof HistoryRedactionInput>;
