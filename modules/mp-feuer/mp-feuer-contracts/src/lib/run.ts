import { z } from 'zod';
import { ImportMessage, ImportOption, ImportRowAction, ImportUnmatched, ImportValueMappings, LocalizedText } from '@forga/core-contracts';

/** Rows per part of a dataset; rows of one incident or one session are never split. */
export const MP_FEUER_PART_SIZE = 2000;

/**
 * `prepared`: read, not checked; `dry-running`/`checked`: dry run running/done; `applying`: taking over; `applied`,
 * `cancelled` (after a part, on request) and `failed` (error or restart of the server: "interrupted") are final.
 */
export const RunStatus = z.enum(['prepared', 'dry-running', 'checked', 'applying', 'applied', 'cancelled', 'failed']);
export type RunStatus = z.infer<typeof RunStatus>;

export const RUNNING: readonly RunStatus[] = ['dry-running', 'applying'];
export const FINAL: readonly RunStatus[] = ['applied', 'cancelled', 'failed'];

export const ImportCounts = z.record(ImportRowAction, z.number());
export type ImportCounts = z.infer<typeof ImportCounts>;

/** What an archive holds, for the overview of the files. */
export const ArchiveContent = z.object({ persons: z.number(), incidents: z.number(), sessions: z.number() });
export type ArchiveContent = z.infer<typeof ArchiveContent>;

/** One transfer file (`MPTRA_<number>_<time>_<unit>.zip`) of a run with its assignment. */
export const RunArchive = z.object({
  /** Archive number of MP-Feuer, e.g. `01`; the assignment is remembered per number. */
  key: z.string(),
  fileName: z.string(),
  /** Unit named in the file name, e.g. "Abt. Musterstadt". */
  label: z.string(),
  content: ArchiveContent,
  /** Name of the department in f.orga; `null` = as named in the file. */
  department: z.string().nullable(),
  /** Key of a brigade-wide unit the incident reports of the archive belong to, e.g. `duty-officer`. */
  unit: z.string().nullable(),
  skip: z.boolean(),
  /** The assignment comes from an earlier transfer (not suggested by the name). */
  remembered: z.boolean(),
  /** Older files with the same number in the upload; the newest file counts. */
  superseded: z.array(z.string()),
});
export type RunArchive = z.infer<typeof RunArchive>;

/** Rows an import profile gets from the archives. */
export const RunDataset = z.object({
  profile: z.string(),
  name: LocalizedText,
  /** Position: persons first, then what refers to them. */
  order: z.number(),
  rowCount: z.number(),
  enabled: z.boolean(),
  options: z.record(z.string(), z.boolean()),
  /** Options offered for the dataset. */
  optionInfo: z.array(ImportOption),
  /** Only rows from this date on (`YYYY-MM-DD`), e.g. incidents since 01.01.2025; `null`: all. */
  from: z.iso.date().nullable(),
  /** Whether the dataset can be limited by date (`from`). */
  fromAvailable: z.boolean(),
  /** Without the permission of the profile or with its module switched off. */
  locked: z.boolean(),
  /** Of the last dry run or apply. */
  counts: ImportCounts.nullable(),
  /** Distinct values of the last dry run or apply that match no entry. */
  unmatched: z.number(),
  parts: z.number(),
  partsDone: z.number(),
  /** Duration of the last dry run or apply in milliseconds. */
  durationMs: z.number().nullable(),
});
export type RunDataset = z.infer<typeof RunDataset>;

/** Brigade-wide units the incident reports of an archive can belong to; `null` without the incidents module. */
export const RunUnits = z.object({ entries: z.array(z.object({ key: z.string(), name: LocalizedText })) });
export type RunUnits = z.infer<typeof RunUnits>;

export const RunProgress = z.object({
  /** Profile of the dataset in progress. */
  dataset: z.string().nullable(),
  part: z.number(),
  parts: z.number(),
  rowsDone: z.number(),
  rows: z.number(),
});
export type RunProgress = z.infer<typeof RunProgress>;

export const MpFeuerRun = z.object({
  id: z.string(),
  status: RunStatus,
  /** What runs or ran last. */
  phase: z.enum(['dry-run', 'apply']).nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  checkedAt: z.string().nullable(),
  archives: z.array(RunArchive),
  datasets: z.array(RunDataset),
  units: RunUnits.nullable(),
  mappings: ImportValueMappings,
  progress: RunProgress.nullable(),
  /** Values of the last dry run or apply that match no entry. */
  unmatched: z.array(ImportUnmatched),
  /** Error code of a failed run, e.g. `mp-feuer.interrupted`. */
  error: z.string().nullable(),
  cancelRequested: z.boolean(),
  /** Selection or mappings changed since the last dry run: check again before applying. */
  dryRunOutdated: z.boolean(),
});
export type MpFeuerRun = z.infer<typeof MpFeuerRun>;

/** A run in the history. */
export const RunSummary = z.object({
  id: z.string(),
  status: RunStatus,
  phase: z.enum(['dry-run', 'apply']).nullable(),
  createdBy: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  files: z.array(z.string()),
  counts: ImportCounts,
  unmatched: z.number(),
  error: z.string().nullable(),
  /** Dataset and part a cancelled or interrupted run stopped after. */
  progress: RunProgress.nullable(),
});
export type RunSummary = z.infer<typeof RunSummary>;

/** Choices for a run: per archive, per dataset and for unknown names. Omitted parts stay as they are. */
export const RunSelection = z.object({
  archives: z
    .record(z.string(), z.object({ department: z.string().nullable(), unit: z.string().min(1).nullable().default(null), skip: z.boolean().default(false) }))
    .optional(),
  datasets: z
    .record(z.string(), z.object({ enabled: z.boolean(), options: z.record(z.string(), z.boolean()).default({}), from: z.iso.date().nullable().optional() }))
    .optional(),
  mappings: ImportValueMappings.optional(),
});
export type RunSelection = z.input<typeof RunSelection>;

/** An example row of a message in the report. */
export const ReportExample = z.object({ dataset: z.string(), archive: z.string(), row: z.number(), label: z.string() });

/** Messages of the result grouped by code and value. */
export const ReportMessageGroup = z.object({
  code: z.string(),
  /** The value the message is about (e.g. a name), if any. */
  value: z.string().nullable(),
  params: ImportMessage.shape.params,
  /** The rows were not taken over. */
  error: z.boolean(),
  count: z.number(),
  examples: z.array(ReportExample),
});
export type ReportMessageGroup = z.infer<typeof ReportMessageGroup>;

export const RunReport = z.object({
  run: RunSummary,
  datasets: z.array(z.object({ profile: z.string(), name: LocalizedText, counts: ImportCounts.nullable(), durationMs: z.number().nullable() })),
  messages: z.array(ReportMessageGroup),
  /** Mappings of the run kept in the module's list. */
  remembered: z.number(),
});
export type RunReport = z.infer<typeof RunReport>;

/**
 * The selection of the last transfer (settings section `mp-feuer.remembered`), saved with each apply and offered again
 * with the next upload, so the weekly routine needs no new choices.
 */
export const MpFeuerRemembered = z.object({
  archives: z
    .record(z.string(), z.object({ label: z.string(), department: z.string().nullable(), unit: z.string().nullable(), skip: z.boolean(), at: z.string() }))
    .default({}),
  datasets: z.record(z.string(), z.object({ enabled: z.boolean(), options: z.record(z.string(), z.boolean()), from: z.iso.date().nullable().default(null) })).default({}),
});
export type MpFeuerRemembered = z.infer<typeof MpFeuerRemembered>;

export const MP_FEUER_SETTINGS = { 'mp-feuer.remembered': MpFeuerRemembered } as const;

/** A planned or available export to MP-Feuer (its table import with templates). */
export const MpFeuerExportInfo = z.object({
  id: z.string(),
  name: LocalizedText,
  permissions: z.array(z.string()),
});
export type MpFeuerExportInfo = z.infer<typeof MpFeuerExportInfo>;
