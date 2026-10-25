import { ExaminationResult } from '@forga/respiratory-protection-contracts';

/**
 * Result of the certificate in the wording of DGUV G 26 (German or English, also the keys); `undefined` = not recognised.
 * Only a text with "keine"/"no" counts as without concerns; "befristete gesundheitliche Bedenken" are concerns.
 */
export function parseResult(value: string): ExaminationResult | null | undefined {
  const text = value.trim().toLowerCase();
  if (!text) return null;
  if ((ExaminationResult.options as readonly string[]).includes(text)) return text as ExaminationResult;
  if (/\b(keine|no)\b/.test(text)) {
    if (/voraussetzung|condition/.test(text)) return 'no-concerns-conditional';
    if (/befrist|limited/.test(text)) return 'no-concerns-limited';
    return 'no-concerns';
  }
  if (/bedenken|concerns/.test(text)) return 'concerns';
  return undefined;
}
