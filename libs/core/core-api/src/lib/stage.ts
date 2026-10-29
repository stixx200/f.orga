import { type ForgaStage, ForgaStage as StageSchema } from '@forga/core-contracts';

/**
 * Kind of this installation from `FORGA_STAGE` (`production`, `test`, `development`; unset = `development`). The Docker
 * image sets `production`; the test system of `docker/compose.stages.yml` sets `test`. Read on every call, so tests
 * can switch it. An unknown value stops the start (see `assertStage`).
 */
export function forgaStage(value = process.env['FORGA_STAGE']): ForgaStage {
  const parsed = StageSchema.safeParse((value ?? '').trim() || 'development');
  return parsed.success ? parsed.data : 'development';
}

/** Fails on an unknown `FORGA_STAGE`, so a typo does not turn a production system into a development one. */
export function assertStage(value = process.env['FORGA_STAGE']): void {
  const trimmed = (value ?? '').trim();
  if (trimmed && !StageSchema.safeParse(trimmed).success) {
    throw new Error(`FORGA_STAGE must be one of ${StageSchema.options.join(', ')}, not "${trimmed}".`);
  }
}

/** Test system: real personal data must not get in (decision 4 of the data protection concept). */
export const isTestStage = (): boolean => forgaStage() === 'test';
