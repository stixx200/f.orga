import { Button, Group, Menu, NumberInput, Stack, Tabs, Text } from '@mantine/core';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { Item, PersonTotal, Problem, RunDetail } from '@forga/compensation-contracts';
import { ApiError, apiUrl, formatDate, formatDateTime, formatMoney, send, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, EmptyState, Notice, PageHeader, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, useDepartments, usePersonName, useRun } from '../api';
import { Amount, ItemLabel, RunStatusBadge } from '../parts';

function AmountDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const { t } = useTranslation('compensation');
  const { t: common } = useTranslation('common');
  const [amount, setAmount] = useState<number | ''>(item.amount ?? '');
  const save = useAction(() => send('PUT', `compensation/items/${item.id}/amount`, { amount: Number(amount), reason: '' }), { success: t('items.saved'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('items.enterAmount')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={amount === ''} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <Text size="sm">{item.label}</Text>
      <NumberInput label={t('items.amount')} value={amount} onChange={(v) => setAmount(v === '' ? '' : Number(v))} min={0} decimalScale={2} fixedDecimalScale suffix=" €" data-autofocus />
    </ResponsiveDialog>
  );
}

type Action = 'close' | 'hand-over' | 'paid' | 'delete';

/** One payout run: persons, departments, items and notes; close, hand over, paid, exports. */
export function RunPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('compensation');
  const navigate = useNavigate();
  const name = usePersonName();
  const { data: departments = [] } = useDepartments();
  const { data: run, isLoading } = useRun(id);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [amountFor, setAmountFor] = useState<Item | null>(null);
  const done = { invalidate: [keys.all], onSuccess: () => setConfirm(null) };
  const refresh = useAction(() => send('POST', `compensation/runs/${id}/refresh`), { invalidate: [keys.all], success: t('run.refreshed') });
  // Downloaded with fetch, so a missing payer account or IBAN shows as a message instead of an error page.
  const sepa = useAction(async () => {
    const response = await fetch(apiUrl(`compensation/runs/${id}/transfer.xml`), { credentials: 'include' });
    if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => undefined));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(await response.blob());
    link.download = `SEPA_${run?.number ?? id}.xml`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  const close = useAction(() => send('POST', `compensation/runs/${id}/close`), { ...done, success: t('run.closedNotice') });
  const handOver = useAction(() => send('POST', `compensation/runs/${id}/hand-over`), done);
  const paid = useAction(() => send('POST', `compensation/runs/${id}/paid`), done);
  const remove = useAction(() => send('DELETE', `compensation/runs/${id}`), { invalidate: [keys.all], onSuccess: () => navigate('/compensation/runs') });
  if (!run) return isLoading ? null : <EmptyState title={t('run.notFound')} />;

  const department = (departmentId: string | null) => (departmentId ? (departments.find((d) => d.id === departmentId)?.name ?? '') : t('run.noDepartment'));
  const blocking = run.problems.filter((p) => p.blocking).length;
  const draft = run.status === 'draft';
  const action = { close, 'hand-over': handOver, paid, delete: remove }[confirm ?? 'close'];

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('runs.title'), to: '/compensation/runs' }, { label: run.number }]}
        title={`${t('run.title')} ${run.number}`}
        badges={<RunStatusBadge status={run.status} />}
        subtitle={`${formatDate(run.from, i18n.language)} – ${formatDate(run.to, i18n.language)} · ${run.itemCount} ${t('runs.items')} · ${formatMoney(run.total, i18n.language)}`}
        actions={
          <Group gap="sm">
            <Button component="a" href={apiUrl(`compensation/runs/${id}/export.xlsx`, { lang: i18n.language })} variant="default">Excel</Button>
            <Menu position="bottom-end">
              <Menu.Target><Button variant="default">{t('run.statements')}</Button></Menu.Target>
              <Menu.Dropdown>
                <Menu.Item component="a" href={apiUrl(`compensation/runs/${id}/statements.pdf`)} target="_blank">{t('run.statementsAll')}</Menu.Item>
                {run.departments.filter((d) => d.departmentId).map((d) => (
                  <Menu.Item key={d.departmentId} component="a" href={apiUrl(`compensation/runs/${id}/statements.pdf`, { departmentId: d.departmentId })} target="_blank">{department(d.departmentId)}</Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Item component="a" href={apiUrl('core/lists/compensation.statement/export/pdf', { runId: id, lang: i18n.language })} target="_blank">{t('run.overview')}</Menu.Item>
              </Menu.Dropdown>
            </Menu>
            {!draft && <Button component="a" href={apiUrl(`compensation/runs/${id}/transfer.csv`)} variant="default">{t('run.transfer')}</Button>}
            {!draft && <Button variant="default" loading={sepa.isPending} onClick={() => sepa.mutate(undefined)}>{t('run.sepa')}</Button>}
            {draft && <Button variant="default" loading={refresh.isPending} onClick={() => refresh.mutate(undefined)}>{t('run.refresh')}</Button>}
            {draft && <Button variant="default" color="red" onClick={() => setConfirm('delete')}>{t('run.delete')}</Button>}
            {draft && <Button disabled={blocking > 0} onClick={() => setConfirm('close')}>{t('run.close')}</Button>}
            {run.status === 'closed' && <Button onClick={() => setConfirm('hand-over')}>{t('run.handOver')}</Button>}
            {run.status === 'handed-over' && <Button onClick={() => setConfirm('paid')}>{t('run.paid')}</Button>}
          </Group>
        }
      />
      {blocking > 0 && <Notice kind="error">{t('run.blocking', { count: blocking })}</Notice>}
      {run.closedAt && <Notice kind="done">{t('run.closedBy', { name: run.closedBy, at: formatDateTime(run.closedAt, i18n.language) })}</Notice>}
      <Tabs defaultValue="persons">
        <Tabs.List mb="md">
          <Tabs.Tab value="persons">{t('run.tabs.persons')}</Tabs.Tab>
          <Tabs.Tab value="departments">{t('run.tabs.departments')}</Tabs.Tab>
          <Tabs.Tab value="items">{t('run.tabs.items')}</Tabs.Tab>
          <Tabs.Tab value="problems">{t('run.tabs.problems', { count: run.problems.length })}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="persons">
          <DataTable<PersonTotal>
            rows={run.persons}
            rowKey={(p) => p.personId}
            onRowClick={(p) => navigate(`/masterdata/persons/${p.personId}`)}
            columns={[
              { key: 'department', header: t('run.department'), render: (p) => department(p.departmentId) },
              { key: 'name', header: t('run.name'), render: (p) => <Text fw={700} size="sm">{p.name}</Text> },
              { key: 'incidents', header: t('run.incidents'), align: 'right', render: (p) => p.incidents },
              { key: 'sessions', header: t('run.sessions'), align: 'right', render: (p) => p.sessions },
              { key: 'amount', header: t('items.amount'), align: 'right', render: (p) => formatMoney(p.amount, i18n.language) },
            ]}
          />
        </Tabs.Panel>
        <Tabs.Panel value="departments">
          <DataTable<RunDetail['departments'][number]>
            rows={run.departments}
            rowKey={(d) => d.departmentId ?? 'none'}
            columns={[
              { key: 'department', header: t('run.department'), render: (d) => department(d.departmentId) },
              { key: 'persons', header: t('run.persons'), align: 'right', render: (d) => d.persons },
              { key: 'incidents', header: t('run.incidents'), align: 'right', render: (d) => d.incidents },
              { key: 'amount', header: t('items.amount'), align: 'right', render: (d) => formatMoney(d.amount, i18n.language) },
            ]}
          />
        </Tabs.Panel>
        <Tabs.Panel value="items">
          <DataTable<Item>
            rows={run.items}
            rowKey={(i) => i.id}
            onRowClick={draft ? (i) => (i.kind === 'loss-of-earnings' || i.source === 'manual' || i.amount === null) && setAmountFor(i) : undefined}
            columns={[
              { key: 'date', header: t('items.date'), render: (i) => formatDate(i.date, i18n.language) },
              { key: 'name', header: t('run.name'), render: (i) => name(i.personId) },
              { key: 'label', header: t('items.label'), render: (i) => <ItemLabel item={i} /> },
              { key: 'hours', header: t('items.hours'), align: 'right', render: (i) => i.hours ?? '' },
              { key: 'amount', header: t('items.amount'), align: 'right', render: (i) => <Amount item={i} /> },
            ]}
          />
        </Tabs.Panel>
        <Tabs.Panel value="problems">
          <DataTable<Problem>
            rows={run.problems}
            rowKey={(p) => `${p.code}-${p.itemIds.join('-')}-${p.detail}`}
            empty={t('run.noProblems')}
            columns={[
              { key: 'code', header: t('run.problem'), render: (p) => <Text size="sm" fw={700} c={p.blocking ? 'red.8' : undefined}>{t(`problem.${p.code}`)}</Text> },
              { key: 'name', header: t('run.name'), render: (p) => p.name },
              { key: 'detail', header: t('items.label'), render: (p) => p.detail },
            ]}
          />
        </Tabs.Panel>
      </Tabs>
      {confirm && (
        <ConfirmDialog
          opened
          onClose={() => setConfirm(null)}
          title={t(`run.confirm.${confirm}.title`)}
          description={t(`run.confirm.${confirm}.text`)}
          confirmLabel={t(`run.confirm.${confirm}.button`)}
          loading={action.isPending}
          onConfirm={() => action.mutate(undefined)}
        />
      )}
      {amountFor && <AmountDialog item={amountFor} onClose={() => setAmountFor(null)} />}
    </Stack>
  );
}
