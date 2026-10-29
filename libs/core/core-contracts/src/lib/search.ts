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
  /** The hit is about this person: hidden while the processing of the person is restricted (Art. 18). */
  personId: z.string().optional(),
});
export type SearchHit = z.infer<typeof SearchHit>;

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
