import { z } from 'zod';
import { LocalizedText } from './i18n.js';

export const ListColumn = z.object({
  key: z.string(),
  label: LocalizedText,
  /** Relative width in PDF and Excel; default 1. */
  width: z.number().positive().optional(),
  align: z.enum(['left', 'right', 'center']).optional(),
});
export type ListColumn = z.infer<typeof ListColumn>;

/**
 * `person`: a person picked by name (search of the master data); `choice`: an entry picked from the choices the module
 * offers (e.g. sessions, payout runs, promotion lists), both loaded from
 * `GET /core/lists/<id>/parameters/<key>/options?q=…`. The value is the ID in both cases.
 */
export const ListParameterType = z.enum(['text', 'date', 'year', 'department', 'select', 'boolean', 'person', 'choice']);
export type ListParameterType = z.infer<typeof ListParameterType>;

/** A choice for a `person` or `choice` parameter; the label comes from the data (e.g. a session title). */
export const ListOption = z.object({ value: z.string(), label: z.string(), description: z.string().optional() });
export type ListOption = z.infer<typeof ListOption>;

export const ListParameter = z.object({
  key: z.string(),
  label: LocalizedText,
  type: ListParameterType,
  required: z.boolean().default(false),
  options: z.array(z.object({ value: z.string(), label: LocalizedText })).optional(),
});
export type ListParameter = z.input<typeof ListParameter>;

/** A list template as the UI sees it in the list overview. */
export const ListInfo = z.object({
  id: z.string(),
  module: z.string(),
  name: LocalizedText,
  description: LocalizedText.optional(),
  parameters: z.array(ListParameter),
  /** Adds an empty, wide column for signatures (attendance and signature lists). */
  signatureColumn: z.boolean(),
  orientation: z.enum(['portrait', 'landscape']),
  /** Where the user may run the list: brigade-wide or the listed departments (offered for department parameters). */
  departments: z.union([z.literal('brigade'), z.array(z.string())]),
  /** The list needs a session confirmed with the second factor (its permission has `stepUp`). */
  stepUp: z.boolean().default(false),
});
export type ListInfo = z.infer<typeof ListInfo>;

export type ListCell = string | number | boolean | null;

/** Content of a list for preview and export. Dates come as `YYYY-MM-DD` and are formatted per language. */
export const ListData = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  columns: z.array(ListColumn),
  rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))),
});
export type ListData = z.infer<typeof ListData>;

export const LIST_FORMATS = ['pdf', 'xlsx', 'csv'] as const;
export type ListFormat = (typeof LIST_FORMATS)[number];
