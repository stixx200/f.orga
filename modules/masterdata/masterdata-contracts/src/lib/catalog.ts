import { z } from 'zod';
import { Aliases, LocalizedText } from '@forga/core-contracts';

/**
 * Catalogs maintained by the administrator. Entries are referenced by their stable `key`,
 * so renaming an entry never breaks references.
 */
/** `function`: tasks in an incident (e.g. attack team); `office`: offices held for a period (e.g. commander, youth warden). */
export const CatalogKind = z.enum(['function', 'qualification', 'vehicle-type', 'honor', 'exit-reason', 'rank', 'office']);
export type CatalogKind = z.infer<typeof CatalogKind>;

/** Extra fields per catalog kind. */
export const CatalogAttributes = {
  function: z.object({ abbreviation: z.string().default('') }),
  qualification: z.object({
    /** Validity of an acquired qualification in months; `null` = unlimited. */
    validityMonths: z.number().int().positive().nullable().default(null),
  }),
  'vehicle-type': z.object({
    /** Standard crew, e.g. `1/8`. */
    crew: z.string().default(''),
    seats: z.number().int().min(0).default(0),
    /** Default position of the annual statistics, e.g. `F70`. */
    statisticsCategory: z.string().nullable().default(null),
  }),
  honor: z.object({}),
  'exit-reason': z.object({}),
  office: z.object({}),
  rank: z.object({
    abbreviation: z.string().default(''),
    /** Position in the rank order, lowest first. */
    level: z.number().int().min(0).default(0),
  }),
} satisfies Record<CatalogKind, z.ZodObject>;

export const CatalogEntryInput = z.object({
  kind: CatalogKind,
  key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: LocalizedText,
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
  attributes: z.record(z.string(), z.unknown()).default({}),
  /** Other names imports match the entry by, e.g. "Masch." for "Maschinist". */
  aliases: Aliases,
});
export type CatalogEntryInput = z.input<typeof CatalogEntryInput>;

export const CatalogEntry = z.object({
  id: z.string(),
  kind: CatalogKind,
  key: z.string(),
  name: LocalizedText,
  sortOrder: z.number(),
  active: z.boolean(),
  attributes: z.record(z.string(), z.unknown()),
  aliases: z.array(z.string()),
  version: z.number(),
});
export type CatalogEntry = z.infer<typeof CatalogEntry>;

export const ApplyTemplateResult = z.object({ added: z.record(z.string(), z.number()) });
export type ApplyTemplateResult = z.infer<typeof ApplyTemplateResult>;
