import { z } from 'zod';
import { LocalizedText } from './i18n.js';

/**
 * What modules contribute to the register of processing activities of the module `privacy` (Art. 30 GDPR): technical
 * recipients and processors (`ProcessorRegistry`) and technical measures (`TechnicalMeasureRegistry`).
 */

/**
 * Where a recipient comes from: `module` (manifest), `municipality` (entered for the activity), `general` (entered for
 * all activities), `token` (an API token with permissions of the module), `processor` (SMTP server, OIDC provider).
 */
export const RecipientSource = z.enum(['module', 'municipality', 'general', 'token', 'processor']);
export type RecipientSource = z.infer<typeof RecipientSource>;

export const RegisterRecipientView = z.object({
  /** Stable reference, e.g. `module:incidents.reports:0`, `token:<id>` or the ID entered by the municipality. */
  id: z.string(),
  name: LocalizedText,
  note: z.string(),
  source: RecipientSource,
});
export type RegisterRecipientView = z.infer<typeof RegisterRecipientView>;

/** `ok`: in place; `warning`: missing or weak (e.g. HTTPS: no); `info`: description only. */
export const MeasureTone = z.enum(['ok', 'warning', 'info']);
export type MeasureTone = z.infer<typeof MeasureTone>;

/** A technical measure with the current state of f.orga, e.g. „Zweiter Faktor: bei sensiblen Daten (Step-up)“. */
export const TechnicalMeasure = z.object({
  key: z.string(),
  title: LocalizedText,
  value: LocalizedText,
  tone: MeasureTone,
});
export type TechnicalMeasure = z.infer<typeof TechnicalMeasure>;
