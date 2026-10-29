import { Button, Checkbox, Group, Menu, NumberInput, Pagination, Select, Stack, Switch, Tabs, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { type Item, ItemKind, type ManualPayout, type PersonTotal, type Problem, type RunDetail, statuteMissing } from '@forga/compensation-contracts';
import { ApiError, apiUrl, can, ensureStepUp, formatDate, formatDateTime, formatMoney, isElevated, openAfterStepUp, send, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, EmptyState, matchesSearch, Notice, PageHeader, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, RUNS, useCompensationSettings, useDepartments, usePersonName, useRun } from '../api';
import { Amount, ItemLabel, RunStatusBadge } from '../parts';

const PAGE = 50;
const APPROVE = 'compensation.approve';
/** The amount of these items is entered here: loss of earnings, items by hand and items without rate. */
const amountEditable = (i: Item) => i.kind === 'loss-of-earnings' || i.source === 'manual' || i.amount === null;

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

/** Items of the run with search, filters (person, kind, only without amount) and pages. */
function ItemsTab({ run, focus, onOpen }: { run: RunDetail; focus: string[] | null; onOpen: (item: Item) => void }) {
  const { t, i18n } = useTranslation('compensation');
  const name = usePersonName();
  const [q, setQ] = useState('');
  const [person, setPerson] = useState<string | null>(null);
  const [kind, setKind] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [page, setPage] = useState(1);
  const rows = useMemo(
    () =>
      run.items.filter(
        (i) =>
          (!focus || focus.includes(i.id)) && (!person || i.personId === person) && (!kind || i.kind === kind) && (!missing || i.amount === null) && matchesSearch([i.label, name(i.personId), i.reason], q),
      ),
    [run.items, focus, person, kind, missing, q, name],
  );
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const current = Math.min(page, pages);
  return (
    <Stack gap="sm">
      <Group align="end">
        <TextInput label={t('run.filter.search')} leftSection={<IconSearch size={16} />} value={q} onChange={(e) => { setQ(e.currentTarget.value); setPage(1); }} w={240} />
        <Select label={t('run.name')} placeholder={t('run.filter.all')} data={run.persons.map((p) => ({ value: p.personId, label: p.name }))} value={person} onChange={(v) => { setPerson(v); setPage(1); }} searchable clearable w={220} />
        <Select label={t('items.kind')} placeholder={t('run.filter.all')} data={ItemKind.options.map((k) => ({ value: k, label: t(`kind.${k}`) }))} value={kind} onChange={(v) => { setKind(v); setPage(1); }} clearable w={180} />
        <Switch label={t('run.filter.onlyMissing')} checked={missing} onChange={(e) => { setMissing(e.currentTarget.checked); setPage(1); }} mb={8} />
      </Group>
      {focus && <Text size="sm" c="dimmed">{t('run.filter.focus', { count: focus.length })}</Text>}
      <DataTable<Item>
        rows={rows.slice((current - 1) * PAGE, current * PAGE)}
        rowKey={(i) => i.id}
        onRowClick={run.status === 'draft' ? (i) => amountEditable(i) && onOpen(i) : undefined}
        columns={[
          { key: 'date', header: t('items.date'), render: (i) => formatDate(i.date, i18n.language) },
          { key: 'name', header: t('run.name'), render: (i) => name(i.personId) },
          { key: 'label', header: t('items.label'), render: (i) => <ItemLabel item={i} /> },
          { key: 'hours', header: t('items.hours'), align: 'right', render: (i) => i.hours ?? '' },
          { key: 'amount', header: t('items.amount'), align: 'right', render: (i) => <Amount item={i} /> },
        ]}
      />
      <Group justify="space-between">
        <Text size="sm" c="dimmed">{t('run.filter.count', { count: rows.length })}</Text>
        {pages > 1 && <Pagination total={pages} value={current} onChange={setPage} size="sm" />}
      </Group>
    </Stack>
  );
}

/** Amounts to enter in a list (loss of earnings, items without rate); several saved at once or deferred to the next run. */
function AmountsTab({ run }: { run: RunDetail }) {
  const { t, i18n } = useTranslation('compensation');
  const name = usePersonName();
  const open = run.items.filter((i) => i.kind === 'loss-of-earnings' || i.amount === null);
  const [values, setValues] = useState<Record<string, number | ''>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const changed = Object.entries(values).filter(([id, v]) => v !== '' && open.find((i) => i.id === id)?.amount !== v);
  const save = useAction(() => send('PUT', 'compensation/items/amounts', changed.map(([id, amount]) => ({ id, amount: Number(amount) }))), { success: t('run.amountsSaved'), invalidate: [keys.all], onSuccess: () => setValues({}) });
  const defer = useAction(() => send('POST', `compensation/runs/${run.id}/defer`, { itemIds: selected }), { success: t('run.deferredNotice'), invalidate: [keys.all], onSuccess: () => setSelected([]) });
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  if (!open.length) return <Text size="sm" c="dimmed">{t('run.noAmounts')}</Text>;
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">{t('run.amountsHint')}</Text>
      <DataTable<Item>
        rows={open}
        rowKey={(i) => i.id}
        exportable={false}
        columns={[
          { key: 'select', header: '', width: 40, render: (i) => <Checkbox aria-label={t('run.defer')} checked={selected.includes(i.id)} onChange={(e) => toggle(i.id, e.currentTarget.checked)} /> },
          { key: 'date', header: t('items.date'), render: (i) => formatDate(i.date, i18n.language) },
          { key: 'name', header: t('run.name'), render: (i) => name(i.personId) },
          { key: 'label', header: t('items.label'), render: (i) => <ItemLabel item={i} /> },
          {
            key: 'amount',
            header: t('items.amount'),
            align: 'right',
            render: (i) => (
              <NumberInput aria-label={t('items.amount')} w={130} min={0} decimalScale={2} fixedDecimalScale suffix=" €" placeholder={t('items.amountMissing')} value={values[i.id] ?? i.amount ?? ''} onChange={(v) => setValues((s) => ({ ...s, [i.id]: v === '' ? '' : Number(v) }))} />
            ),
          },
          { key: 'current', header: '', render: (i) => (i.amount === null ? '' : formatMoney(i.amount, i18n.language)) },
        ]}
      />
      <Group>
        <Button disabled={!changed.length} loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('run.saveAmounts', { count: changed.length })}</Button>
        <Button variant="default" disabled={!selected.length} loading={defer.isPending} onClick={() => defer.mutate(undefined)}>{t('run.deferSelected', { count: selected.length })}</Button>
      </Group>
    </Stack>
  );
}

type Action = 'close' | 'approve' | 'hand-over' | 'paid' | 'delete';

/** One payout run: persons, departments, items, amounts to enter and notes; close, approve, hand over, paid, exports. */
export function RunPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('compensation');
  const navigate = useNavigate();
  const session = useSession().data;
  const name = usePersonName();
  const { data: departments = [] } = useDepartments();
  const { data: settings } = useCompensationSettings();
  const { data: run, isLoading } = useRun(id);
  const [confirm, setConfirm] = useState<Action | null>(null);
  const [ibanNames, setIbanNames] = useState<string[] | null>(null);
  const [amountFor, setAmountFor] = useState<Item | null>(null);
  const [tab, setTab] = useState<string | null>('persons');
  const [focus, setFocus] = useState<string[] | null>(null);
  const done = { invalidate: [keys.all], onSuccess: () => setConfirm(null) };
  const refresh = useAction(() => send('POST', `compensation/runs/${id}/refresh`), { invalidate: [keys.all], success: t('run.refreshed') });
  // Downloaded with fetch, so a missing payer account or IBAN shows as a message instead of an error page.
  const download = useAction(async (file: 'transfer.xml' | 'transfer.csv') => {
    // Transfer files name bank accounts: only in a session confirmed with the second factor.
    if (!(await ensureStepUp())) return;
    const response = await fetch(apiUrl(`compensation/runs/${id}/${file}`), { credentials: 'include' });
    if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => undefined));
    const link = document.createElement('a');
    link.href = URL.createObjectURL(await response.blob());
    link.download = `${file === 'transfer.xml' ? 'SEPA' : 'Ueberweisungen'}_${run?.number ?? id}.${file.split('.')[1]}`;
    link.click();
    URL.revokeObjectURL(link.href);
  });
  // Statements name the bank account: ask for the second factor first instead of opening the server's error.
  const statements = (event: { preventDefault: () => void }, url: string) => {
    if (isElevated(session)) return;
    event.preventDefault();
    void openAfterStepUp(url, true);
  };
  // Closing with persons without valid IBAN asks for an explicit confirmation listing them.
  const close = useAction((acceptMissingIban: boolean) => send('POST', `compensation/runs/${id}/close`, { acceptMissingIban }), {
    invalidate: [keys.all],
    success: t('run.closedNotice'),
    onSuccess: () => { setConfirm(null); setIbanNames(null); },
  });
  const tryClose = () =>
    close.mutateAsync(false).catch((error: unknown) => {
      if (error instanceof ApiError && error.code === 'compensation.ibanMissing') {
        setConfirm(null);
        setIbanNames((error.body?.['names'] as string[] | undefined) ?? []);
      }
    });
  const approve = useAction(() => send('POST', `compensation/runs/${id}/approve`), done);
  const handOver = useAction(() => send('POST', `compensation/runs/${id}/hand-over`), done);
  const paid = useAction(() => send('POST', `compensation/runs/${id}/paid`), done);
  const markPaid = useAction((key: string) => send('POST', `compensation/runs/${id}/payouts/${encodeURIComponent(key)}/paid`), { invalidate: [keys.all] });
  const remove = useAction(() => send('DELETE', `compensation/runs/${id}`), { invalidate: [keys.all], onSuccess: () => navigate('/compensation/runs') });
  const undefer = useAction((itemIds: string[]) => send('POST', `compensation/runs/${id}/undefer`, { itemIds }), { invalidate: [keys.all] });
  const defer = useAction((itemIds: string[]) => send('POST', `compensation/runs/${id}/defer`, { itemIds }), { invalidate: [keys.all], success: t('run.deferredNotice') });
  if (!run) return isLoading ? null : <EmptyState title={t('run.notFound')} />;

  const department = (departmentId: string | null) => (departmentId ? (departments.find((d) => d.id === departmentId)?.name ?? '') : t('run.noDepartment'));
  const blocking = run.problems.filter((p) => p.blocking).length;
  const draft = run.status === 'draft';
  const prepares = can(session, RUNS);
  const approvalNeeded = Boolean(settings?.factualApproval) && run.status === 'closed' && !run.approvedAt;
  const toAmounts = run.items.filter((i) => i.kind === 'loss-of-earnings' || i.amount === null).length;
  // A note opens its items: a single editable item directly, otherwise the item list filtered to them.
  const openProblem = (p: Problem) => {
    const items = run.items.filter((i) => p.itemIds.includes(i.id));
    if (items.length === 1 && draft && prepares && amountEditable(items[0]!)) return setAmountFor(items[0]!);
    if (items.length) {
      setFocus(p.itemIds);
      setTab('items');
    }
  };
  const actions: Record<Exclude<Action, 'close'>, { isPending: boolean; mutate: (v: undefined) => void }> = { approve, 'hand-over': handOver, paid, delete: remove };

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
                <Menu.Item component="a" href={apiUrl(`compensation/runs/${id}/statements.pdf`)} target="_blank" onClick={(e) => statements(e, apiUrl(`compensation/runs/${id}/statements.pdf`))}>{t('run.statementsAll')}</Menu.Item>
                {run.departments.filter((d) => d.departmentId).map((d) => (
                  <Menu.Item key={d.departmentId} component="a" href={apiUrl(`compensation/runs/${id}/statements.pdf`, { departmentId: d.departmentId })} target="_blank" onClick={(e) => statements(e, apiUrl(`compensation/runs/${id}/statements.pdf`, { departmentId: d.departmentId }))}>{department(d.departmentId)}</Menu.Item>
                ))}
                {prepares && <Menu.Divider />}
                {prepares && <Menu.Item component="a" href={apiUrl('core/lists/compensation.statement/export/pdf', { runId: id, lang: i18n.language })} target="_blank">{t('run.overview')}</Menu.Item>}
              </Menu.Dropdown>
            </Menu>
            {!draft && prepares && <Button variant="default" disabled={approvalNeeded} title={approvalNeeded ? t('run.approvalBeforeTransfer') : undefined} loading={download.isPending} onClick={() => download.mutate('transfer.csv')}>{t('run.transfer')}</Button>}
            {!draft && prepares && <Button variant="default" disabled={approvalNeeded} title={approvalNeeded ? t('run.approvalBeforeTransfer') : undefined} loading={download.isPending} onClick={() => download.mutate('transfer.xml')}>{t('run.sepa')}</Button>}
            {draft && prepares && <Button variant="default" loading={refresh.isPending} onClick={() => refresh.mutate(undefined)}>{t('run.refresh')}</Button>}
            {draft && prepares && <Button variant="default" color="red" onClick={() => setConfirm('delete')}>{t('run.delete')}</Button>}
            {draft && prepares && <Button disabled={blocking > 0} onClick={() => setConfirm('close')}>{t('run.close')}</Button>}
            {run.status === 'closed' && !run.approvedAt && can(session, APPROVE) && <Button variant={settings?.factualApproval ? 'filled' : 'default'} onClick={() => setConfirm('approve')}>{t('run.approve')}</Button>}
            {run.status === 'closed' && prepares && <Button disabled={approvalNeeded} onClick={() => setConfirm('hand-over')}>{t('run.handOver')}</Button>}
            {run.status === 'handed-over' && prepares && <Button onClick={() => setConfirm('paid')}>{t('run.paid')}</Button>}
          </Group>
        }
      />
      {settings && statuteMissing(settings) && <Notice kind="warning">{t('settings.statuteMissing')}</Notice>}
      {blocking > 0 && <Notice kind="error">{t('run.blocking', { count: blocking })}</Notice>}
      {run.closedAt && <Notice kind="done">{t('run.closedBy', { name: run.closedBy, at: formatDateTime(run.closedAt, i18n.language) })}</Notice>}
      {run.withoutIban.length > 0 && !run.manualPayouts.length && <Notice kind="warning">{t('run.withoutIban', { names: run.withoutIban.join(', ') })}</Notice>}
      {run.manualPayouts.length > 0 && (
        <Panel title={t('run.manualPayouts')}>
          <DataTable<ManualPayout>
            rows={run.manualPayouts}
            rowKey={(p) => p.key}
            exportable={false}
            columns={[
              { key: 'name', header: t('run.name'), render: (p) => p.name },
              { key: 'amount', header: t('items.amount'), align: 'right', render: (p) => formatMoney(p.amount, i18n.language) },
              { key: 'state', header: t('person.status'), render: (p) => (p.paidAt ? t('run.manualPaid', { at: formatDateTime(p.paidAt, i18n.language), by: p.paidBy }) : t('run.manualOpen')) },
              { key: 'action', header: '', align: 'right', render: (p) => !p.paidAt && prepares && <Button size="compact-xs" variant="default" loading={markPaid.isPending && markPaid.variables === p.key} onClick={() => markPaid.mutate(p.key)}>{t('run.markPaid')}</Button> },
            ]}
          />
        </Panel>
      )}
      {run.approvedAt && <Notice kind="done">{t('run.approvedBy', { name: run.approvedBy, at: formatDateTime(run.approvedAt, i18n.language) })}</Notice>}
      {approvalNeeded && <Notice kind="info">{t('run.approvalPending')}</Notice>}
      <Tabs value={tab} onChange={(v) => { setTab(v); if (v !== 'items') setFocus(null); }}>
        <Tabs.List mb="md">
          <Tabs.Tab value="persons">{t('run.tabs.persons')}</Tabs.Tab>
          <Tabs.Tab value="departments">{t('run.tabs.departments')}</Tabs.Tab>
          <Tabs.Tab value="items">{t('run.tabs.items')}</Tabs.Tab>
          {draft && prepares && <Tabs.Tab value="amounts">{t('run.tabs.amounts', { count: toAmounts })}</Tabs.Tab>}
          <Tabs.Tab value="problems">{t('run.tabs.problems', { count: run.problems.length })}</Tabs.Tab>
          {draft && run.deferred.length > 0 && <Tabs.Tab value="deferred">{t('run.tabs.deferred', { count: run.deferred.length })}</Tabs.Tab>}
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
          {tab === 'items' && <ItemsTab run={run} focus={focus} onOpen={(i) => prepares && setAmountFor(i)} />}
        </Tabs.Panel>
        {draft && prepares && <Tabs.Panel value="amounts">{tab === 'amounts' && <AmountsTab key={run.version + run.itemCount} run={run} />}</Tabs.Panel>}
        <Tabs.Panel value="problems">
          <Text size="sm" c="dimmed" mb="xs">{t('run.problemHint')}</Text>
          <DataTable<Problem>
            rows={run.problems}
            rowKey={(p) => `${p.code}-${p.itemIds.join('-')}-${p.detail}`}
            onRowClick={openProblem}
            empty={t('run.noProblems')}
            columns={[
              { key: 'code', header: t('run.problem'), render: (p) => <Text size="sm" fw={700} c={p.blocking ? 'red.8' : undefined}>{t(`problem.${p.code}`)}</Text> },
              { key: 'name', header: t('run.name'), render: (p) => p.name },
              { key: 'detail', header: t('items.label'), render: (p) => p.detail },
              {
                key: 'defer',
                header: '',
                align: 'right',
                render: (p) =>
                  draft && prepares && p.code === 'amount-missing' && (
                    <Button size="compact-xs" variant="default" loading={defer.isPending && defer.variables === p.itemIds} onClick={(e) => { e.stopPropagation(); defer.mutate(p.itemIds); }}>
                      {t('run.defer')}
                    </Button>
                  ),
              },
            ]}
          />
        </Tabs.Panel>
        {draft && (
          <Tabs.Panel value="deferred">
            <DataTable<Item>
              rows={run.deferred}
              rowKey={(i) => i.id}
              columns={[
                { key: 'date', header: t('items.date'), render: (i) => formatDate(i.date, i18n.language) },
                { key: 'name', header: t('run.name'), render: (i) => name(i.personId) },
                { key: 'label', header: t('items.label'), render: (i) => <ItemLabel item={i} /> },
                { key: 'amount', header: t('items.amount'), align: 'right', render: (i) => <Amount item={i} /> },
                { key: 'back', header: '', align: 'right', render: (i) => prepares && <Button size="compact-xs" variant="default" loading={undefer.isPending} onClick={() => undefer.mutate([i.id])}>{t('run.undefer')}</Button> },
              ]}
            />
          </Tabs.Panel>
        )}
      </Tabs>
      {confirm === 'close' && (
        <ConfirmDialog opened onClose={() => setConfirm(null)} title={t('run.confirm.close.title')} description={t('run.confirm.close.text')} confirmLabel={t('run.confirm.close.button')} loading={close.isPending} onConfirm={() => void tryClose()} />
      )}
      {confirm && confirm !== 'close' && (
        <ConfirmDialog
          opened
          onClose={() => setConfirm(null)}
          title={t(`run.confirm.${confirm}.title`)}
          description={t(`run.confirm.${confirm}.text`)}
          confirmLabel={t(`run.confirm.${confirm}.button`)}
          loading={actions[confirm].isPending}
          onConfirm={() => actions[confirm].mutate(undefined)}
        />
      )}
      {ibanNames && (
        <ConfirmDialog opened onClose={() => setIbanNames(null)} title={t('run.ibanConfirm.title')} description={t('run.ibanConfirm.text', { names: ibanNames.join(', ') })} confirmLabel={t('run.ibanConfirm.button')} loading={close.isPending} onConfirm={() => close.mutate(true)} />
      )}
      {amountFor && <AmountDialog item={amountFor} onClose={() => setAmountFor(null)} />}
    </Stack>
  );
}
