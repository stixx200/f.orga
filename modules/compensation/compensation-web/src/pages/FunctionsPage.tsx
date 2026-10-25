import { ActionIcon, Button, Group, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { FunctionHolder, FunctionHolderInput, YearTotal } from '@forga/compensation-contracts';
import { formatDate, formatMoney, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { DataTable, Notice, PageHeader, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { keys, useCompensationSettings, useHolders, usePersonName, usePersons, useYearTotals } from '../api';

function HolderDialog({ holder, onClose }: { holder?: FunctionHolder; onClose: () => void }) {
  const { t } = useTranslation('compensation');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: persons = [] } = usePersons();
  const { data: settings } = useCompensationSettings();
  const [form, setForm] = useState<FunctionHolderInput>(() => ({ personId: holder?.personId ?? '', functionKey: holder?.functionKey ?? '', from: holder?.from ?? `${new Date().getFullYear()}-01-01`, to: holder?.to ?? null }));
  const save = useAction(() => (holder ? send('PUT', `compensation/functions/${holder.id}`, form) : send('POST', 'compensation/functions', form)), { success: t('functions.saved'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={holder ? t('functions.edit') : t('functions.add')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!form.personId || !form.functionKey} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select label={t('functions.function')} data={(settings?.functionAllowances ?? []).filter((f) => !f.office).map((f) => ({ value: f.key, label: localized(f.name) }))} value={form.functionKey || null} onChange={(v) => setForm({ ...form, functionKey: v ?? '' })} required />
        <Select label={t('run.name')} data={persons.filter((p) => p.status !== 'left').map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}` }))} value={form.personId || null} onChange={(v) => setForm({ ...form, personId: v ?? '' })} searchable required />
        <DateInput label={t('functions.from')} value={form.from} onChange={(v) => v && setForm({ ...form, from: v })} valueFormat="DD.MM.YYYY" required />
        <DateInput label={t('functions.to')} value={form.to ?? null} onChange={(v) => setForm({ ...form, to: v })} valueFormat="DD.MM.YYYY" clearable />
      </SimpleGrid>
    </ResponsiveDialog>
  );
}

/** Function holders, annual allowances and annual totals with the tax hint. */
export function FunctionsPage() {
  const { t, i18n } = useTranslation('compensation');
  const localized = useLocalized();
  const name = usePersonName();
  const { data: holders = [] } = useHolders();
  const { data: settings } = useCompensationSettings();
  const [thisYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState(String(thisYear));
  const { data: totals = [] } = useYearTotals(Number(year));
  const [editing, setEditing] = useState<FunctionHolder | 'new' | null>(null);
  const [result, setResult] = useState<{ items: number; exceeded: { functionKey: string; holders: number; maxHolders: number }[] } | null>(null);
  const generate = useAction(() => send<NonNullable<typeof result>>('POST', 'compensation/functions/generate', { year: Number(year) }), { invalidate: [keys.all], onSuccess: setResult });
  const remove = useAction((id: string) => send('DELETE', `compensation/functions/${id}`), { invalidate: [keys.all] });
  const functionName = (key: string) => {
    const f = settings?.functionAllowances.find((x) => x.key === key);
    return f ? localized(f.name) : key;
  };

  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('functions.title') }]} title={t('functions.title')} subtitle={t('functions.subtitle')} />
      <Panel title={t('functions.holders')} aside={<Button size="xs" onClick={() => setEditing('new')}>{t('functions.add')}</Button>}>
        <DataTable<FunctionHolder>
          rows={holders}
          rowKey={(h) => h.id}
          onRowClick={(h) => h.source === 'module' && setEditing(h)}
          empty={t('functions.empty')}
          columns={[
            { key: 'function', header: t('functions.function'), render: (h) => <Text size="sm" fw={700}>{functionName(h.functionKey)}</Text> },
            { key: 'name', header: t('run.name'), render: (h) => name(h.personId) },
            { key: 'from', header: t('functions.from'), render: (h) => formatDate(h.from, i18n.language) },
            { key: 'to', header: t('functions.to'), render: (h) => formatDate(h.to, i18n.language) },
            { key: 'source', header: '', render: (h) => h.source === 'masterdata' && <StatusBadge>{t('functions.fromOffices')}</StatusBadge> },
            { key: 'actions', header: '', align: 'right', render: (h) => h.source === 'module' && <ActionIcon variant="subtle" color="red" aria-label={t('functions.delete')} onClick={(e) => { e.stopPropagation(); remove.mutate(h.id); }}><IconTrash size={16} /></ActionIcon> },
          ]}
        />
      </Panel>
      <Panel
        title={t('functions.year')}
        aside={
          <Group gap="sm">
            <Select aria-label={t('functions.yearLabel')} w={100} size="xs" data={[1, 0, -1, -2].map((n) => String(thisYear + n))} value={year} onChange={(v) => v && setYear(v)} allowDeselect={false} />
            <Button size="xs" loading={generate.isPending} onClick={() => generate.mutate(undefined)}>{t('functions.generate')}</Button>
          </Group>
        }
      >
        <Stack gap="sm">
          {result && <Notice kind="done">{t('functions.generated', { count: result.items })}</Notice>}
          {result?.exceeded.map((e) => <Notice key={e.functionKey} kind="warning">{t('functions.exceeded', { name: functionName(e.functionKey), holders: e.holders, max: e.maxHolders })}</Notice>)}
          <DataTable<YearTotal>
            rows={totals}
            rowKey={(r) => r.personId}
            empty={t('functions.noTotals')}
            columns={[
              { key: 'name', header: t('run.name'), render: (r) => r.name },
              { key: 'compensation', header: t('kind.compensation'), align: 'right', render: (r) => formatMoney(r.byKind['compensation'] ?? 0, i18n.language) },
              { key: 'flat', header: t('kind.flat-rate'), align: 'right', render: (r) => formatMoney(r.byKind['flat-rate'] ?? 0, i18n.language) },
              { key: 'loss', header: t('kind.loss-of-earnings'), align: 'right', render: (r) => formatMoney(r.byKind['loss-of-earnings'] ?? 0, i18n.language) },
              { key: 'total', header: t('functions.total'), align: 'right', render: (r) => <Text size="sm" fw={700}>{formatMoney(r.total, i18n.language)}</Text> },
              { key: 'hint', header: t('functions.taxHint'), render: (r) => <Text size="sm" c="orange.8">{[r.aboveYear ? t('functions.aboveYear') : '', r.monthsAbove.length ? t('functions.monthsAbove', { months: r.monthsAbove.join(', ') }) : ''].filter(Boolean).join(' · ')}</Text> },
            ]}
          />
        </Stack>
      </Panel>
      {editing && <HolderDialog holder={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Stack>
  );
}
