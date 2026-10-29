import { z } from 'zod';
import { Language } from './i18n.js';

/**
 * Data of third parties (L14 of the data protection concept): persons who are no `Person` of the master data, e.g.
 * persons involved in an incident (injured parties, causers, witnesses, callers) or debtors of cost notices. They have the
 * rights of Art. 14–18 GDPR as well; f.orga finds their data by name, address or licence plate.
 */

/** A place where data of a third party is stored, e.g. a person involved in an incident. */
export const ThirdPartyRef = z.object({
  /** Source of the module, e.g. `incidents.involved-parties`. */
  source: z.string().min(1).max(100),
  id: z.string().min(1).max(100),
});
export type ThirdPartyRef = z.infer<typeof ThirdPartyRef>;

/** A search hit (`GET /api/core/privacy/third-parties?q=`), only for `core.privacy.manage`. */
export const ThirdPartyHit = ThirdPartyRef.extend({
  /** Name as stored. */
  name: z.string(),
  /** Address (street, postal code, city) as stored; empty if none. */
  address: z.string(),
  /** Where the data is stored, e.g. "Einsatz 2026-104950 · TH1 Verkehrsunfall" or "Kostenbescheid KE-2026-014". */
  reference: z.string(),
  /** Role, e.g. "Verursacher", "Kostenschuldner". */
  role: z.string(),
  /** Day of the record (alarm, notice), `YYYY-MM-DD`; `null` for entries without a date (address book). */
  date: z.string().nullable(),
  /** Further data stored about the party, e.g. phone, licence plate (shown to tell persons with the same name apart). */
  details: z.string(),
});
export type ThirdPartyHit = z.infer<typeof ThirdPartyHit>;

/** An access report (Art. 15) for a third party from the chosen places (`POST …/third-parties/access-reports`). */
export const ThirdPartyAccessReportCreate = z.object({
  /** Name of the person as in the letter. */
  name: z.string().trim().min(2).max(200),
  /** Postal address for the letter, lines separated by line breaks; empty = none. */
  address: z.string().trim().max(500).default(''),
  refs: z.array(ThirdPartyRef).min(1).max(200),
  language: Language.default('de'),
  /** Data subject request of the third party the report answers. */
  requestId: z.uuid().nullable().default(null),
});
export type ThirdPartyAccessReportCreate = z.input<typeof ThirdPartyAccessReportCreate>;

/** Erasure (Art. 17) of the data of a third party at the chosen places (`POST …/third-parties/erasure`). */
export const ThirdPartyErasureInput = z.object({
  refs: z.array(ThirdPartyRef).min(1).max(200),
  /** Why, e.g. "Löschantrag vom 12.10.2026"; in the audit log. */
  reason: z.string().trim().min(10).max(2000),
  /** Data subject request (erasure) of the third party. */
  requestId: z.uuid().nullable().default(null),
});
export type ThirdPartyErasureInput = z.input<typeof ThirdPartyErasureInput>;

/**
 * What happened at each place: `anonymized` (name, address, phone … removed, the record stays), `deleted` (entry removed),
 * `kept` with an error code why (e.g. a cost notice is kept as accounting record until its retention period ends).
 */
export const ThirdPartyErasureOutcome = z.enum(['anonymized', 'deleted', 'kept']);
export type ThirdPartyErasureOutcome = z.infer<typeof ThirdPartyErasureOutcome>;

export const ThirdPartyErasureResult = z.object({
  results: z.array(ThirdPartyRef.extend({ outcome: ThirdPartyErasureOutcome, code: z.string().nullable() })),
});
export type ThirdPartyErasureResult = z.infer<typeof ThirdPartyErasureResult>;
