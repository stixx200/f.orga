import { ActionIcon, Button, Group, NumberInput, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { Item, ItemKind, ManualItemInput } from '@forga/compensation-contracts';
import { can, formatDate, formatMoney, localDate, send, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, PageHeader, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, MANUAL, useOpenItems, usePersonName, usePersons } from '../api';
import { Amount, ItemLabel } from '../parts';

const KINDS: ItemKind[] = ['expenses', 'flat-rate', 'compensation', 'loss-of-earnings'];

function ManualDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('compensation');
  const { t: common } = useTranslation('common');
  const { data: persons = [] } = usePersons();
  const [form, setForm] = useState<ManualItemInput>(() => ({ personId: '', kind: 'expenses', date: localDate(), label: '', amount: 0, reason: '' }));
  const save = useAction(() => send('POST', 'compensation/items', form), { success: t('items.saved'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('items.manual')}
      size="lg"
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!form.personId || !form.label || !form.reason} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select label={t('run.name')} data={persons.filter((p) => p.status !== 'left').map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}` }))} value={form.personId || null} onChange={(v) => setForm({ ...form, personId: v ?? '' })} searchable required />
        <Select label={t('items.kind')} data={KINDS.map((k) => ({ value: k, label: t(`kind.${k}`) }))} value={form.kind} onChange={(v) => v && setForm({ ...form, kind: v as ItemKind })} allowDeselect={false} />
        <DateInput label={t('items.date')} value={form.date} onChange={(v) => v && setForm({ ...form, date: v })} valueFormat="DD.MM.YYYY" required />
        <NumberInput label={t('items.amount')} description={t('items.negativeHint')} value={form.amount} onChange={(v) => setForm({ ...form, amount: Number(v) || 0 })} decimalScale={2} fixedDecimalScale suffix=" €" />
        <TextInput label={t('items.label')} value={form.label} onChange={(e) => setForm({ ...form, label: e.currentTarget.value })} required />
        <TextInput label={t('items.reason')} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.currentTarget.value })} required />
      </SimpleGrid>
    </ResponsiveDialog>
  );
}

/** Items not yet paid out; manual items (expenses, corrections) with a reason. */
export function ItemsPage() {
  const { t, i18n } = useTranslation('compensation');
  const session = useSession().data;
  const name = usePersonName();
  const { data = [], isLoading } = useOpenItems();
  const [creating, setCreating] = useState(false);
  const remove = useAction((id: string) => send('DELETE', `compensation/items/${id}`), { success: t('items.deleted'), invalidate: [keys.all] });
  const total = data.reduce((s, i) => s + (i.amount ?? 0), 0);
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('items.title') }]}
        title={t('items.title')}
        subtitle={t('items.subtitle', { count: data.length, total: formatMoney(total, i18n.language) })}
        actions={can(session, MANUAL) && <Button onClick={() => setCreating(true)}>{t('items.manual')}</Button>}
      />
      <DataTable<Item>
        rows={data}
        rowKey={(i) => i.id}
        empty={isLoading ? t('loading') : t('items.empty')}
        columns={[
          { key: 'date', header: t('items.date'), render: (i) => formatDate(i.date, i18n.language) },
          { key: 'name', header: t('run.name'), render: (i) => name(i.personId) },
          { key: 'label', header: t('items.label'), render: (i) => <ItemLabel item={i} /> },
          { key: 'hours', header: t('items.hours'), align: 'right', render: (i) => i.hours ?? '' },
          { key: 'amount', header: t('items.amount'), align: 'right', render: (i) => <Amount item={i} /> },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (i) =>
              i.source === 'manual' && !i.runId && can(session, MANUAL) ? (
                <ActionIcon variant="subtle" color="red" aria-label={t('items.delete')} onClick={() => remove.mutate(i.id)}><IconTrash size={16} /></ActionIcon>
              ) : (
                <Text size="xs" c="dimmed">{i.runId ? t('items.inDraft') : ''}</Text>
              ),
          },
        ]}
      />
      {creating && <ManualDialog onClose={() => setCreating(false)} />}
    </Stack>
  );
}
