import { Button, Group, Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Notice, NoticeStatus } from '@forga/cost-recovery-contracts';
import { can, formatDate, formatMoney, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, notifySuccess, PageHeader, useAction } from '@forga/web-ui';
import { download, keys, type ListFilter, useCostSettings, useNotices, useOffenseName, WRITE } from '../api';
import { NoticeStatusBadge } from '../parts';

const STATUSES: NoticeStatus[] = ['draft', 'review', 'issued', 'handed-over', 'paid', 'objection', 'cancelled', 'amended', 'discarded'];

/** Notices with search, status and overdue filter; handover to the treasury of the filtered notices. */
export function NoticesPage() {
  const { t, i18n } = useTranslation('cost-recovery');
  const navigate = useNavigate();
  const session = useSession().data;
  const offense = useOffenseName();
  const { data: settings } = useCostSettings();
  const [thisYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState<string | null>(String(thisYear));
  const [status, setStatus] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [overdue, setOverdue] = useState(false);
  const [refund, setRefund] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const filter: ListFilter = { year: year ? Number(year) : undefined, status: status ?? undefined, q: q.trim() || undefined, overdue: overdue ? 'true' : undefined, refund: refund ? 'true' : undefined };
  const { data = [], isLoading } = useNotices(filter);
  const format = t(`settings.handoverFormats.${settings?.handover?.format ?? 'xlsx'}`);
  const exportFile = useAction(() => download('GET', 'cost-recovery/export', filter));
  const handOver = useAction(() => download('POST', 'cost-recovery/export/hand-over', { ...filter, status: undefined }), {
    invalidate: [keys.all],
    onSuccess: (response) => {
      setConfirm(false);
      notifySuccess(t('notices.handedOver', { count: Number(response.headers.get('X-Handed-Over') ?? 0), changes: Number(response.headers.get('X-Changes') ?? 0) }));
    },
  });
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('notices.title') }]}
        title={t('notices.title')}
        actions={
          <Group gap="sm">
            <Button variant="default" loading={exportFile.isPending} onClick={() => exportFile.mutate(undefined)}>{t('notices.export', { format })}</Button>
            {can(session, WRITE) && <Button onClick={() => setConfirm(true)}>{t('notices.exportAndHandOver')}</Button>}
          </Group>
        }
      />
      <Group align="end">
        <TextInput label={t('notices.search')} placeholder={t('notices.searchHint')} leftSection={<IconSearch size={16} />} value={q} onChange={(e) => setQ(e.currentTarget.value)} w={280} />
        <Select label={t('notices.year')} placeholder={t('notices.all')} data={[0, 1, 2, 3].map((n) => String(thisYear - n))} value={year} onChange={setYear} clearable w={120} />
        <Select label={t('fields.status')} placeholder={t('notices.all')} data={STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) }))} value={status} onChange={setStatus} clearable />
        <Switch label={t('notices.onlyOverdue')} checked={overdue} onChange={(e) => setOverdue(e.currentTarget.checked)} mb={8} />
        <Switch label={t('notices.onlyRefund')} checked={refund} onChange={(e) => setRefund(e.currentTarget.checked)} mb={8} />
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
          { key: 'open', header: t('fields.balance'), align: 'right', render: (n) => (n.issuedAt ? <Text size="sm" c={n.balance < 0 ? 'red.8' : undefined}>{formatMoney(n.balance, i18n.language)}</Text> : '') },
          { key: 'due', header: t('fields.dueOn'), render: (n) => formatDate(n.dueOn, i18n.language) },
          { key: 'status', header: t('fields.status'), render: (n) => <NoticeStatusBadge status={n.status} overdue={n.overdue} refund={n.refundDue > 0} /> },
        ]}
      />
      <ConfirmDialog
        opened={confirm}
        onClose={() => setConfirm(false)}
        title={t('notices.exportAndHandOver')}
        description={t('notices.handOverHint', { format })}
        confirmLabel={t('notices.exportAndHandOver')}
        loading={handOver.isPending}
        onConfirm={() => handOver.mutate(undefined)}
      />
    </Stack>
  );
}
