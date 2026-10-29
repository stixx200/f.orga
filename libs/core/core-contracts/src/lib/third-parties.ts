import { z } from 'zod';

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

/** A search hit (`GET /api/privacy/third-parties?q=`), only for `privacy.manage`. */
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

/**
 * What happened at each place: `anonymized` (name, address, phone … removed, the record stays), `deleted` (entry removed),
 * `kept` with an error code why (e.g. a cost notice is kept as accounting record until its retention period ends).
 */
export const ThirdPartyErasureOutcome = z.enum(['anonymized', 'deleted', 'kept']);
export type ThirdPartyErasureOutcome = z.infer<typeof ThirdPartyErasureOutcome>;
