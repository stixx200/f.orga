import { z } from 'zod';
import { LocalizedText } from './i18n.js';

export const ImportField = z.object({
  key: z.string(),
  label: LocalizedText,
  required: z.boolean(),
  /** Column headings that are mapped to this field automatically (e.g. MP-Feuer exports). */
  aliases: z.array(z.string()),
});
export type ImportField = z.infer<typeof ImportField>;

export const ImportOption = z.object({ key: z.string(), label: LocalizedText, default: z.boolean() });
export type ImportOption = z.infer<typeof ImportOption>;

export const ImportProfileInfo = z.object({
  id: z.string(),
  module: z.string(),
  name: LocalizedText,
  description: LocalizedText.optional(),
  fields: z.array(ImportField),
  options: z.array(ImportOption),
  /** The profile also reads data transfers (MP-Feuer transfer archives). */
  transfer: z.boolean(),
});
export type ImportProfileInfo = z.infer<typeof ImportProfileInfo>;

/** Field key → column heading of the file (or `null` = not imported). */
export const ImportMapping = z.record(z.string(), z.string().nullable());
export type ImportMapping = z.infer<typeof ImportMapping>;

export const ImportUpload = z.object({
  id: z.string(),
  fileName: z.string(),
  headers: z.array(z.string()),
  rowCount: z.number(),
  /** First rows for the preview of the mapping. */
  sample: z.array(z.array(z.string())),
  /** Suggested mapping per profile, based on the column headings. */
  suggestions: z.record(z.string(), ImportMapping),
});
export type ImportUpload = z.infer<typeof ImportUpload>;

export const ImportRequest = z.object({
  profile: z.string(),
  mapping: ImportMapping,
  options: z.record(z.string(), z.boolean()).default({}),
});
export type ImportRequest = z.input<typeof ImportRequest>;

export const ImportRowAction = z.enum(['create', 'update', 'unchanged', 'error']);
export type ImportRowAction = z.infer<typeof ImportRowAction>;

export const ImportMessage = z.object({
  code: z.string(),
  params: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
});
export type ImportMessage = z.infer<typeof ImportMessage>;

export const ImportRowResult = z.object({
  /** 1-based row number in the file, counting the heading row. */
  row: z.number(),
  action: ImportRowAction,
  /** Human-readable identification, e.g. "Keller, Jonas". */
  label: z.string(),
  messages: z.array(ImportMessage),
});
export type ImportRowResult = z.infer<typeof ImportRowResult>;

export const ImportResult = z.object({
  dryRun: z.boolean(),
  counts: z.record(ImportRowAction, z.number()),
  rows: z.array(ImportRowResult),
});
export type ImportResult = z.infer<typeof ImportResult>;

/** One archive of a data transfer, e.g. an MP-Feuer transfer file of a department. */
export const TransferArchiveInfo = z.object({
  key: z.string(),
  fileName: z.string(),
  /** Unit named in the archive, e.g. "Abt. Musterstadt". */
  label: z.string(),
});
export type TransferArchiveInfo = z.infer<typeof TransferArchiveInfo>;

/** Rows an import profile reads from the archives. */
export const TransferDataset = z.object({ profile: z.string(), rowCount: z.number() });
export type TransferDataset = z.infer<typeof TransferDataset>;

export const TransferUpload = z.object({
  id: z.string(),
  archives: z.array(TransferArchiveInfo),
  /** In the order they must be imported (persons before their incidents). */
  datasets: z.array(TransferDataset),
});
export type TransferUpload = z.infer<typeof TransferUpload>;

export const TransferRequest = z.object({
  profile: z.string(),
  /** Archive key → name of the department the archive belongs to (`null` = use the label of the archive). */
  departments: z.record(z.string(), z.string().nullable()).default({}),
  options: z.record(z.string(), z.boolean()).default({}),
});
export type TransferRequest = z.input<typeof TransferRequest>;
