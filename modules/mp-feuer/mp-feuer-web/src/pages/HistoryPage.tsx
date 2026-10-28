import { Button, Group, Text } from '@mantine/core';
import { useNavigate } from 'react-router';
import type { RunSummary } from '@forga/mp-feuer-contracts';
import { formatDateTime, useTranslation } from '@forga/web-sdk';
import { DataTable } from '@forga/web-ui';
import { useRuns } from '../api';
import { ModulePage } from '../components/ModulePage';
import { RunStatusBadge } from '../components/RunBits';

/** "Verlauf": every run with user, files and result. */
export function HistoryPage() {
  const { t, i18n } = useTranslation('mp-feuer');
  const navigate = useNavigate();
  const { data: runs = [], isLoading } = useRuns();
  const summary = (run: RunSummary) => {
    if (run.status === 'failed' && run.error === 'mp-feuer.interrupted') return t('history.interrupted', { part: run.progress?.part ?? 0, parts: run.progress?.parts ?? 0 });
    if (run.status === 'cancelled') return t('history.cancelled', { part: run.progress?.part ?? 0, parts: run.progress?.parts ?? 0 });
    if (run.status === 'checked' || run.status === 'prepared') return t('history.unmatched', { count: run.unmatched });
    return t('history.counts', { create: run.counts.create, update: run.counts.update, error: run.counts.error });
  };
  return (
    <ModulePage tab="history">
      <DataTable
        rows={runs}
        rowKey={(r) => r.id}
        empty={isLoading ? undefined : t('history.empty')}
        columns={[
          { key: 'createdAt', header: t('history.time'), render: (r) => formatDateTime(r.finishedAt ?? r.createdAt, i18n.language) },
          { key: 'createdBy', header: t('history.user') },
          { key: 'files', header: t('history.files'), render: (r) => <span title={r.files.join('\n')}>{t('history.archives', { count: r.files.length })}</span> },
          {
            key: 'result',
            header: t('history.result'),
            render: (r) => (
              <Group gap={6}>
                <RunStatusBadge run={r} />
                <Text size="xs" c="dimmed">{summary(r)}</Text>
              </Group>
            ),
          },
          { key: 'report', header: '', render: (r) => <Button size="xs" variant="default" onClick={() => navigate(`/mp-feuer/runs/${r.id}`)}>{t('history.report')}</Button> },
        ]}
      />
      <Text size="xs" c="dimmed">{t('history.hint')}</Text>
    </ModulePage>
  );
}
