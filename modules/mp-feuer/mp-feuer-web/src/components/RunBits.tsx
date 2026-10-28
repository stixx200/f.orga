import { Group } from '@mantine/core';
import type { ImportCounts, RunStatus, RunSummary } from '@forga/mp-feuer-contracts';
import { useTranslation } from '@forga/web-sdk';
import { StatusBadge, type Tone } from '@forga/web-ui';

const TONES: Record<RunStatus, Tone> = {
  prepared: 'neutral',
  'dry-running': 'highlight',
  checked: 'neutral',
  applying: 'highlight',
  applied: 'done',
  cancelled: 'warning',
  failed: 'error',
};

/** Status of a run: "Probelauf", "übernommen", "abgebrochen", "unterbrochen" … */
export function RunStatusBadge({ run }: { run: Pick<RunSummary, 'status' | 'error'> }) {
  const { t } = useTranslation('mp-feuer');
  const interrupted = run.status === 'failed' && run.error === 'mp-feuer.interrupted';
  return <StatusBadge tone={TONES[run.status]}>{t(interrupted ? 'status.interrupted' : `status.${run.status}`)}</StatusBadge>;
}

/** Counts of a dataset or run as badges; `unmatched` links to the mapping step. */
export function CountBadges({ counts, unmatched = 0, onUnmatched }: { counts: Partial<ImportCounts> | null; unmatched?: number; onUnmatched?: () => void }) {
  const { t } = useTranslation('mp-feuer');
  if (!counts) return <span>–</span>;
  return (
    <Group gap={6}>
      <StatusBadge tone="done">{t('counts.create', { count: counts.create ?? 0 })}</StatusBadge>
      <StatusBadge tone="primary">{t('counts.update', { count: counts.update ?? 0 })}</StatusBadge>
      <StatusBadge>{t('counts.unchanged', { count: counts.unchanged ?? 0 })}</StatusBadge>
      {(counts.error ?? 0) > 0 && <StatusBadge tone="error">{t('counts.error', { count: counts.error })}</StatusBadge>}
      {unmatched > 0 && (
        <span role={onUnmatched ? 'button' : undefined} tabIndex={onUnmatched ? 0 : undefined} style={{ cursor: onUnmatched ? 'pointer' : undefined }} onClick={onUnmatched} onKeyDown={(e) => e.key === 'Enter' && onUnmatched?.()}>
          <StatusBadge tone="warning">{t('counts.unmatched', { count: unmatched })}</StatusBadge>
        </span>
      )}
    </Group>
  );
}

export const sumCounts = (list: (Partial<ImportCounts> | null)[]): ImportCounts =>
  list.reduce<ImportCounts>((sum, c) => ({ create: sum.create + (c?.create ?? 0), update: sum.update + (c?.update ?? 0), unchanged: sum.unchanged + (c?.unchanged ?? 0), error: sum.error + (c?.error ?? 0) }), {
    create: 0,
    update: 0,
    unchanged: 0,
    error: 0,
  });

/** Seconds of a duration in milliseconds, e.g. "41 s". */
export const seconds = (ms: number | null | undefined) => `${Math.max(0, Math.round((ms ?? 0) / 1000))} s`;
