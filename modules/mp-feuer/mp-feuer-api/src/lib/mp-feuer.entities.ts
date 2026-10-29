import { defineEntity, p } from '@mikro-orm/core';
import { v7 as uuidv7 } from 'uuid';
import { mappingProperties } from '@forga/core-api';
import type { ImportRowResult, ImportUnmatched, ImportValueMappings } from '@forga/core-contracts';
import type { ImportCounts, RunArchive, RunProgress, RunStatus } from '@forga/mp-feuer-contracts';
import type { TransferRow } from './archive/transfer-archive.js';

/**
 * A data transfer: the uploaded transfer files with their assignment, status and progress. Kept for the history;
 * progress and counts are written without history while the run works.
 */
export const RunSchema = defineEntity({
  name: 'MpFeuerRunEntity',
  schema: 'mp_feuer',
  tableName: 'run',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    userId: p.string(),
    /** Display name of the user who uploaded the files. */
    createdBy: p.string(),
    status: p.string().$type<RunStatus>(),
    phase: p.string().$type<'dry-run' | 'apply'>().nullable(),
    files: p.json<string[]>(),
    archives: p.json<RunArchive[]>(),
    mappings: p.json<ImportValueMappings>(),
    unmatched: p.json<ImportUnmatched[]>(),
    progress: p.json<RunProgress>().nullable(),
    /** Error code of a failed run, e.g. `mp-feuer.interrupted`. */
    error: p.string().nullable(),
    cancelRequested: p.boolean().default(false),
    /**
     * `running` while the run works, else `null`: unique, so at most one run works at a time, also with several
     * server instances on the same database.
     */
    lock: p.string().nullable().unique(),
    /** Selection and mappings of the last dry run; applying needs the same. */
    checkedSignature: p.text().nullable(),
    /** Mappings of the run kept in the module's list. */
    rememberedCount: p.integer().default(0),
    createdAt: p.datetime(),
    startedAt: p.datetime().nullable(),
    finishedAt: p.datetime().nullable(),
    checkedAt: p.datetime().nullable(),
  },
});
export class MpFeuerRunEntity extends RunSchema.class {}
RunSchema.setClass(MpFeuerRunEntity);

/**
 * The rows an import profile gets from the archives of a run. The rows are removed after the apply, at the latest
 * after 7 days (retention run); counts and the rows with messages stay for the report.
 */
export const RunDatasetSchema = defineEntity({
  name: 'MpFeuerRunDatasetEntity',
  schema: 'mp_feuer',
  tableName: 'run_dataset',
  properties: {
    id: p.uuid().primary().onCreate(() => uuidv7()),
    run: () => p.manyToOne(MpFeuerRunEntity).deleteRule('cascade'),
    profile: p.string(),
    position: p.integer(),
    rowCount: p.integer(),
    /** `null` once removed. */
    rows: p.json<TransferRow[]>().nullable().lazy(),
    enabled: p.boolean(),
    options: p.json<Record<string, boolean>>(),
    /** Only rows from this date on (`YYYY-MM-DD`). */
    from: p.string().nullable(),
    locked: p.boolean(),
    counts: p.json<ImportCounts>().nullable(),
    /** Rows of the last dry run or apply with messages or errors, with the archive key. */
    results: p.json<(ImportRowResult & { archive: string })[]>().lazy(),
    /** Distinct values of the last dry run or apply that match no entry. */
    unmatched: p.integer().default(0),
    parts: p.integer().default(0),
    partsDone: p.integer().default(0),
    durationMs: p.integer().nullable(),
  },
});
export class MpFeuerRunDatasetEntity extends RunDatasetSchema.class {}
RunDatasetSchema.setClass(MpFeuerRunDatasetEntity);

/** Mappings chosen in data transfers of MP-Feuer, applied again by the next runs; independent of the table import. */
export const MappingSchema = defineEntity({
  name: 'MpFeuerMappingEntity',
  schema: 'mp_feuer',
  tableName: 'mapping',
  uniques: [{ properties: ['kind', 'normalized'] }],
  properties: mappingProperties(),
});
export class MpFeuerMappingEntity extends MappingSchema.class {}
MappingSchema.setClass(MpFeuerMappingEntity);
