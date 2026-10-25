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

/** Runs the retention rules; a dry run may try other values than the stored ones, e.g. before saving them. */
export const RetentionRun = z.object({
  dryRun: z.boolean().default(true),
  /** Only for dry runs: overrides of the stored privacy settings. */
  settings: z
    .object({
      anonymizeLeftAfterYears: z.number().int().min(1).max(50).nullable().optional(),
      auditRetentionMonths: z.number().int().min(6).max(240).optional(),
    })
    .optional(),
});
export type RetentionRun = z.input<typeof RetentionRun>;

/**
 * Barcode or RFID chip of a physical item (equipment, hose, breathing apparatus, clothing). Empty input means none;
 * stored codes are unique per module.
 */
export const ItemCode = z
  .string()
  .trim()
  .max(100)
  .nullish()
  .transform((value) => value || null);

/**
 * RFID readers write the chip ID with or without separators and in either case (`04:a2:1f…`, `04A21F…`); the stored
 * and the scanned value are compared in this form.
 */
export function normalizeRfid(value: string): string {
  return value.replace(/[\s:-]/g, '').toUpperCase();
}

/** RFID chip ID of an item, stored normalized. */
export const RfidCode = ItemCode.transform((value) => (value ? normalizeRfid(value) : null));
