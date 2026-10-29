import { z } from 'zod';
import { LocalizedText } from './i18n.js';

/**
 * Effects of consents (L9). The module `privacy` keeps the catalog and the consents given by persons; other modules ask
 * through `CONSENTS` whether a consent with an effect exists.
 */

/**
 * What a consent changes in f.orga. Modules ask with `CONSENTS.withEffect(effect, personIds)`; a consent of any catalog
 * entry with the effect counts (also of an older version or an inactive entry, until it is withdrawn).
 */
export const CONSENT_EFFECTS = {
  /** The phone list of the department shows the mobile number (otherwise "über Gruppenführer"). */
  'masterdata.phone-list-mobile': {
    module: 'masterdata',
    label: { de: 'Telefonliste zeigt die Handynummer', en: 'Phone list shows the mobile number' },
  },
  /** The list "Geburtstage" with purpose "Aushang" (posting) contains the person. */
  'masterdata.birthdays-posting': {
    module: 'masterdata',
    label: { de: 'Liste „Geburtstage“, Zweck Aushang', en: 'List “Birthdays”, purpose posting' },
  },
} as const satisfies Record<string, { module: string; label: LocalizedText }>;
export type ConsentEffect = keyof typeof CONSENT_EFFECTS;
export const ConsentEffect = z.enum(Object.keys(CONSENT_EFFECTS) as [ConsentEffect, ...ConsentEffect[]]);

/**
 * Effects of consents, read by modules (injection token `CONSENTS`, provided by the core and answered by the module
 * `privacy`). While the module is inactive there is no consent management: `has` is `false` and `withEffect` returns
 * every person, so lists behave as without consents.
 */
export interface ConsentLookup {
  /** The person has a valid (not withdrawn) consent of the catalog entry `key`. */
  has(personId: string, key: string): Promise<boolean>;
  /** Persons from `personIds` with a valid consent of an entry with the effect. */
  withEffect(effect: ConsentEffect, personIds: readonly string[]): Promise<Set<string>>;
}
export const CONSENTS = 'core.Consents';
