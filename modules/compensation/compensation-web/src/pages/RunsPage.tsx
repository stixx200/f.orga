import { Button, Group, Stack, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Run, RunDetail } from '@forga/compensation-contracts';
import { formatDate, formatMoney, send, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, Notice, PageHeader, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, useRuns } from '../api';
import { RunStatusBadge } from '../parts';

/** Previous month as default period. */
const previousMonth = () => {
  const now = new Date();
  const first = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
  const last = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
};

function CreateDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('compensation');
  const { t: common } = useTranslation('common');
  const navigate = useNavigate();
  const [period, setPeriod] = useState(previousMonth);
  const create = useAction(() => send<RunDetail>('POST', 'compensation/runs', period), { invalidate: [keys.all], onSuccess: (run) => navigate(`/compensation/runs/${run.id}`) });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('runs.new')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={create.isPending} onClick={() => create.mutate(undefined)}>{t('runs.create')}</Button>
        </Group>
      }
    >
      <Text size="sm" c="dimmed">{t('runs.createHint')}</Text>
      <Group grow>
        <DateInput label={t('runs.from')} value={period.from} onChange={(v) => v && setPeriod({ ...period, from: v })} valueFormat="DD.MM.YYYY" />
        <DateInput label={t('runs.to')} value={period.to} onChange={(v) => v && setPeriod({ ...period, to: v })} valueFormat="DD.MM.YYYY" />
      </Group>
    </ResponsiveDialog>
  );
}

/**
 * Reports released and sessions closed before the module was installed: their release is published again,
 * so their items arise (only with the brigade-wide permissions of the other modules).
 */
function TakeOver() {
  const { t } = useTranslation('compensation');
  const session = useSession().data;
  const [year] = useState(() => new Date().getFullYear());
  const [result, setResult] = useState<string | null>(null);
  const period = { from: `${year}-01-01`, to: `${year}-12-31` };
  const incidents = useAction(() => send<{ reports: number }>('POST', 'incidents/reports/republish', period), { invalidate: [keys.all], onSuccess: (r) => setResult(t('takeOver.reports', { count: r.reports })) });
  const training = useAction(() => send<{ sessions: number }>('POST', 'training/sessions/republish', period), { invalidate: [keys.all], onSuccess: (r) => setResult(t('takeOver.sessions', { count: r.sessions })) });
  const mayIncidents = session?.permissions['incidents.reports.release'] === 'brigade';
  const mayTraining = session?.permissions['training.close'] === 'brigade';
  if (!mayIncidents && !mayTraining) return null;
  return (
    <Panel title={t('takeOver.title')}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{t('takeOver.hint', { year })}</Text>
        <Group>
          {mayIncidents && <Button variant="default" loading={incidents.isPending} onClick={() => incidents.mutate(undefined)}>{t('takeOver.incidents')}</Button>}
          {mayTraining && <Button variant="default" loading={training.isPending} onClick={() => training.mutate(undefined)}>{t('takeOver.training')}</Button>}
        </Group>
        {result && <Notice kind="done">{result}</Notice>}
      </Stack>
    </Panel>
  );
}

/** Payout runs with period, status and total. */
export function RunsPage() {
  const { t, i18n } = useTranslation('compensation');
  const navigate = useNavigate();
  const { data = [], isLoading } = useRuns();
  const [creating, setCreating] = useState(false);
  const draft = data.find((r) => r.status === 'draft');
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('runs.title') }]}
        title={t('runs.title')}
        subtitle={t('runs.subtitle')}
        actions={draft ? <Button variant="default" onClick={() => navigate(`/compensation/runs/${draft.id}`)}>{t('runs.openDraft')}</Button> : <Button onClick={() => setCreating(true)}>{t('runs.new')}</Button>}
      />
      <DataTable<Run>
        rows={data}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/compensation/runs/${r.id}`)}
        empty={isLoading ? t('loading') : t('runs.empty')}
        columns={[
          { key: 'number', header: t('runs.number'), render: (r) => <Text fw={700} size="sm" c="brand">{r.number}</Text> },
          { key: 'period', header: t('runs.period'), render: (r) => `${formatDate(r.from, i18n.language)} – ${formatDate(r.to, i18n.language)}` },
          { key: 'items', header: t('runs.items'), align: 'right', render: (r) => r.itemCount },
          { key: 'total', header: t('runs.total'), align: 'right', render: (r) => formatMoney(r.total, i18n.language) },
          { key: 'status', header: t('runs.status'), render: (r) => <RunStatusBadge status={r.status} /> },
        ]}
      />
      <TakeOver />
      {creating && <CreateDialog onClose={() => setCreating(false)} />}
    </Stack>
  );
}
