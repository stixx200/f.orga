import { Button, Group, Select, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Notice, NoticeStatus } from '@forga/cost-recovery-contracts';
import { apiUrl, formatDate, formatMoney, useTranslation } from '@forga/web-sdk';
import { DataTable, PageHeader } from '@forga/web-ui';
import { useNotices, useOffenseName } from '../api';
import { NoticeStatusBadge } from '../parts';

const STATUSES: NoticeStatus[] = ['draft', 'review', 'issued', 'handed-over', 'paid', 'objection', 'cancelled', 'amended'];

/** Notices with status, debtors and amount; treasury export of issued notices. */
export function NoticesPage() {
  const { t, i18n } = useTranslation('cost-recovery');
  const navigate = useNavigate();
  const offense = useOffenseName();
  const [thisYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState(String(thisYear));
  const [status, setStatus] = useState<string | null>(null);
  const { data = [], isLoading } = useNotices({ year: Number(year), status: status ?? undefined });
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('notices.title') }]}
        title={t('notices.title')}
        actions={<Button component="a" href={apiUrl('cost-recovery/export')} variant="default">{t('notices.export')}</Button>}
      />
      <Group>
        <Select label={t('notices.year')} data={[0, 1, 2, 3].map((n) => String(thisYear - n))} value={year} onChange={(v) => v && setYear(v)} allowDeselect={false} w={120} />
        <Select label={t('fields.status')} placeholder={t('notices.all')} data={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} value={status} onChange={setStatus} clearable />
      </Group>
      <DataTable<Notice>
        rows={data}
        rowKey={(n) => n.id}
        onRowClick={(n) => navigate(`/cost-recovery/notices/${n.id}`)}
        empty={isLoading ? t('loading') : t('notices.empty')}
        columns={[
          { key: 'number', header: t('fields.number'), render: (n) => <Text size="sm" fw={700} c="brand">{n.number}</Text> },
          { key: 'incident', header: t('fields.incident'), render: (n) => <><Text size="sm">{n.alarmKeyword} · {n.dispatchNumber}</Text><Text size="xs" c="dimmed">{formatDate(n.alarmedAt, i18n.language)} · {offense(n.offenseKey)}</Text></> },
          { key: 'debtors', header: t('fields.debtors'), render: (n) => n.debtors.map((d) => d.name).join('; ') },
          { key: 'total', header: t('fields.total'), align: 'right', render: (n) => formatMoney(n.total, i18n.language) },
          { key: 'due', header: t('fields.dueOn'), render: (n) => formatDate(n.dueOn, i18n.language) },
          { key: 'status', header: t('fields.status'), render: (n) => <NoticeStatusBadge status={n.status} /> },
        ]}
      />
    </Stack>
  );
}
