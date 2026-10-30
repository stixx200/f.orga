import { z } from 'zod';
import { LocalizedText } from './i18n.js';

export const ImportField = z.object({
  key: z.string(),
  label: LocalizedText,
  required: z.boolean(),
  /** Further column headings that are mapped to this field automatically. */
  aliases: z.array(z.string()),
});
export type ImportField = z.infer<typeof ImportField>;

export const ImportOption = z.object({
  key: z.string(),
  label: LocalizedText,
  default: z.boolean(),
});
export type ImportOption = z.infer<typeof ImportOption>;

export const ImportProfileInfo = z.object({
  id: z.string(),
  module: z.string(),
  name: LocalizedText,
  description: LocalizedText.optional(),
  fields: z.array(ImportField),
  options: z.array(ImportOption),
  /** Personal data of the members on the test system (`FORGA_STAGE=test`): not offered, the server refuses it. */
  lockedInTestStage: z.boolean().default(false),
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

/**
 * Step 1 from an address instead of a file: an iCalendar file (`https://`, `http://`, `webcal://`, `webcals://`).
 * Without `url` the address the user remembered is loaded again.
 */
export const ImportUrlRequest = z.object({
  url: z.string().trim().min(1).max(2048).optional(),
  /** Remember the address (encrypted, only for this user) for the next import. */
  remember: z.boolean().default(false),
});
export type ImportUrlRequest = z.input<typeof ImportUrlRequest>;

/** The calendar address the user remembered; the full address is never sent back, it may contain a secret token. */
export const ImportRememberedUrl = z.object({
  /** The server can remember addresses (`FORGA_SECRET_KEY` is set). */
  canRemember: z.boolean(),
  remembered: z
    .object({
      /** Scheme and host only, e.g. `https://calendar.example.org/…`. */
      display: z.string(),
      savedAt: z.string(),
    })
    .nullable(),
});
export type ImportRememberedUrl = z.infer<typeof ImportRememberedUrl>;

/**
 * Entries chosen for values of the file that match no entry: lookup kind (e.g. `qualification`, `function`)
 * → value as in the file → key of the chosen entry.
 */
export const ImportValueMappings = z.record(z.string(), z.record(z.string(), z.string().min(1)));
export type ImportValueMappings = z.infer<typeof ImportValueMappings>;

export const ImportRequest = z.object({
  profile: z.string(),
  mapping: ImportMapping,
  options: z.record(z.string(), z.boolean()).default({}),
  mappings: ImportValueMappings.default({}),
  /**
   * Made-up demo data (`npm run seed`): the only way to import persons into the test system. The UI never sends it;
   * the audit entry records it.
   */
  demoData: z.boolean().optional(),
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

/** A value of the file that matches no entry of a lookup, with the number of rows (or records) it occurs in. */
export const ImportUnmatched = z.object({ kind: z.string(), value: z.string(), count: z.number() });
export type ImportUnmatched = z.infer<typeof ImportUnmatched>;

export const ImportResult = z.object({
  dryRun: z.boolean(),
  counts: z.record(ImportRowAction, z.number()),
  rows: z.array(ImportRowResult),
  /** Distinct per kind and value; an entry can be chosen for each with `mappings`. */
  unmatched: z.array(ImportUnmatched),
});
export type ImportResult = z.infer<typeof ImportResult>;

/** Entries an unknown value can be mapped to, e.g. the qualifications of the catalog or the alarm keywords. */
export const ImportLookupInfo = z.object({
  kind: z.string(),
  name: LocalizedText,
  /** The user may create entries from the import. */
  creatable: z.boolean(),
  /** `slug`: keys like `chain-saw-course`; `text`: the key is the name itself (e.g. alarm keywords). */
  keyFormat: z.enum(['slug', 'text']),
  /**
   * Lookup whose entries are the category a new entry must belong to (sent as `categoryKey`), e.g. the category of
   * an equipment type. `null` when a new entry needs no category.
   */
  createCategoryKind: z.string().nullable(),
});
export type ImportLookupInfo = z.infer<typeof ImportLookupInfo>;

export const ImportLookupEntry = z.object({
  key: z.string(),
  name: LocalizedText,
  /** Parent entry when the lookup is a tree (equipment categories). Omitted for a flat list. */
  parentKey: z.string().nullable().optional(),
});
export type ImportLookupEntry = z.infer<typeof ImportLookupEntry>;

export const ImportLookupEntryInput = z.object({
  key: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(200),
  /** Category of the new entry, when the lookup's `createCategoryKind` is set (e.g. an equipment type). */
  categoryKey: z.string().trim().min(1).max(60).optional(),
});
export type ImportLookupEntryInput = z.input<typeof ImportLookupEntryInput>;

/**
 * Who runs an import: the table import of the core (`core`) or a module feeding rows into the profiles, e.g. a run of
 * the module `mp-feuer`. Profiles may depend on it, e.g. imported incident reports are managed by `mp-feuer`.
 */
export const ImportSource = z.object({ module: z.string(), runId: z.string().optional() });
export type ImportSource = z.infer<typeof ImportSource>;

/** State of the entry a remembered mapping points to; only `active` targets are applied. */
export const ImportMappingTargetState = z.enum(['active', 'inactive', 'deleted']);
export type ImportMappingTargetState = z.infer<typeof ImportMappingTargetState>;

/**
 * A remembered mapping: an import value (e.g. "TM 1") and the entry chosen for it in an earlier import (e.g. the
 * qualification `tm1`). Unique per kind and normalized value (case, umlauts and punctuation do not matter).
 */
export const RememberedMapping = z.object({
  id: z.string(),
  /** Lookup kind, e.g. `qualification`, `function`, `vehicle`, `alarm-keyword`, `session-type`. */
  kind: z.string(),
  /** Name of the lookup; `null` if no active module offers it any more. */
  kindName: LocalizedText.nullable(),
  /** The value as in the first import. */
  value: z.string(),
  /** Key of the chosen entry or of an extra target (e.g. `incidents:loss-of-earnings`). */
  key: z.string(),
  /** Name of the target; `null` if it was deleted. */
  targetName: LocalizedText.nullable(),
  targetState: ImportMappingTargetState,
  /** Import profile of the first apply (shown only; the mapping applies to all profiles of the kind). */
  profile: z.string(),
  profileName: LocalizedText.nullable(),
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string(),
});
export type RememberedMapping = z.infer<typeof RememberedMapping>;
