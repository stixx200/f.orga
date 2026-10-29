import { z } from 'zod';
import { ErasureArea } from '@forga/core-contracts';

/** What `POST /api/privacy/requests/:id/erasure` did, also stored at the request. */
export const ErasureExecution = z.object({
  executedAt: z.string(),
  /** Number of areas (not records) per outcome. */
  deleted: z.number().int(),
  anonymized: z.number().int(),
  kept: z.number().int(),
  /** End of the restriction set for the kept areas; `null` without end or without kept areas. */
  restrictedUntil: z.string().nullable(),
});
export type ErasureExecution = z.infer<typeof ErasureExecution>;

/** The erasure check of a request on erasure (`GET /api/privacy/requests/:id/erasure`). */
export const ErasureCheck = z.object({
  /** "Vorname Nachname", typed to confirm the execution. */
  personName: z.string(),
  areas: z.array(ErasureArea),
  /** End of the restriction the execution would set for the kept areas (latest `keepUntil`, `null` if one has none). */
  restrictUntil: z.string().nullable(),
  /** Set once the erasure has been executed. */
  executed: ErasureExecution.nullable(),
});
export type ErasureCheck = z.infer<typeof ErasureCheck>;

/** Executes the erasure; the person's name is typed as confirmation. */
export const ErasureConfirmation = z.object({
  confirmName: z.string().trim().min(1),
});
export type ErasureConfirmation = z.infer<typeof ErasureConfirmation>;
