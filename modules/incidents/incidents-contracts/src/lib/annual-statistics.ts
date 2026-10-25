import { z } from 'zod';

/**
 * Columns of the state template used by a volunteer fire brigade:
 * D = FF (operational), F = youth, G = veterans, H = music.
 */
export const StatisticsColumn = z.enum(['D', 'F', 'G', 'H']);
export type StatisticsColumn = z.infer<typeof StatisticsColumn>;

export const StatisticsSource = z.enum(['masterdata', 'incidents', 'training', 'manual']);
export type StatisticsSource = z.infer<typeof StatisticsSource>;

export const StatisticsValue = z.object({
  /** Question ID of the template, e.g. `F13`. */
  question: z.string(),
  column: StatisticsColumn,
  source: StatisticsSource,
  computed: z.number().int(),
  /** Manual value replacing the computed one, `null` = no correction. */
  corrected: z.number().int().nullable(),
  value: z.number().int(),
});
export type StatisticsValue = z.infer<typeof StatisticsValue>;

export const StatisticsCheck = z.object({
  code: z.string(),
  ok: z.boolean(),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type StatisticsCheck = z.infer<typeof StatisticsCheck>;

export const AnnualStatistics = z.object({
  year: z.number().int(),
  /** Reference date for personnel and vehicles (31 December). */
  referenceDate: z.string(),
  closedAt: z.string().nullable(),
  closedBy: z.string().nullable(),
  values: z.array(StatisticsValue),
  checks: z.array(StatisticsCheck),
});
export type AnnualStatistics = z.infer<typeof AnnualStatistics>;

/** Corrections keyed `<question>:<column>`, e.g. `F121:D`; `null` removes a correction. */
export const StatisticsCorrections = z.object({
  corrections: z.record(z.string().regex(/^F\d{1,3}:[DFGH]$/), z.number().int().min(0).nullable()),
});
export type StatisticsCorrections = z.infer<typeof StatisticsCorrections>;
