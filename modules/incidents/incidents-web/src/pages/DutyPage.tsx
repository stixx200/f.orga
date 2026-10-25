import { ActionIcon, Button, Group, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { DutyAssignment } from '@forga/incidents-contracts';
import { api, formatDateTime, formatMoney, fromLocalInput, send, toLocalInput, useLocalized, useTranslation, withQuery } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, PageHeader, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { personName, usePersons, useSettings } from '../api';

const DUTY = ['incidents', 'duty'] as const;

/** Special services from the duty roster (e.g. duty officer), compensated per full day. */
export function DutyPage() {
  const { t, i18n } = useTranslation('incidents');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const [thisYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState(String(thisYear));
  const { data: duties = [], isLoading } = useQuery({
    queryKey: [...DUTY, year],
    queryFn: () => api<DutyAssignment[]>(withQuery('incidents/duty', { from: `${year}-01-01`, to: `${year}-12-31` })),
  });
  const { data: persons = [] } = usePersons();
  const { data: settings } = useSettings();
  const kinds = settings?.dutyKinds ?? [];
  const [editing, setEditing] = useState<DutyAssignment | 'new' | null>(null);
  const [removing, setRemoving] = useState<DutyAssignment | null>(null);
  const remove = useAction((id: string) => send('DELETE', `incidents/duty/${id}`), { success: t('duty.deleted'), invalidate: [DUTY] });
  const name = (id: string) => {
    const p = persons.find((x) => x.id === id);
    return p ? personName(p) : '';
  };
  const kindName = (key: string) => {
    const k = kinds.find((x) => x.key === key);
    return k ? localized(k.name) : key;
  };
  const total = duties.reduce((sum, d) => sum + d.amount, 0);

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('duty.title') }]}
        title={t('duty.title')}
        subtitle={t('duty.subtitle')}
        actions={
          <Group>
            <Button component={Link} to="/import" variant="default">{t('duty.import')}</Button>
            <Button onClick={() => setEditing('new')}>{t('duty.create')}</Button>
          </Group>
        }
      />
      <Group justify="space-between">
        <Select aria-label={t('incidents.year')} data={[0, 1, 2].map((i) => String(thisYear + 1 - i))} value={year} onChange={(v) => v && setYear(v)} allowDeselect={false} w={120} />
        <Text size="sm" c="dimmed">{t('duty.summary', { count: duties.length, amount: formatMoney(total, i18n.language) })}</Text>
      </Group>
      <DataTable<DutyAssignment>
        rows={duties.toSorted((a, b) => b.from.localeCompare(a.from))}
        rowKey={(d) => d.id}
        empty={isLoading ? t('loading') : t('duty.empty')}
        onRowClick={(d) => setEditing(d)}
        columns={[
          { key: 'person', header: t('duty.person'), render: (d) => <Text fw={700} size="sm">{name(d.personId)}</Text> },
          { key: 'kind', header: t('duty.kind'), render: (d) => kindName(d.kind) },
          { key: 'from', header: t('duty.from'), render: (d) => formatDateTime(d.from, i18n.language) },
          { key: 'to', header: t('duty.to'), render: (d) => formatDateTime(d.to, i18n.language) },
          { key: 'days', header: t('duty.days'), align: 'right', render: (d) => d.days },
          { key: 'amount', header: t('duty.amount'), align: 'right', render: (d) => formatMoney(d.amount, i18n.language) },
          { key: 'source', header: t('duty.source'), render: (d) => t(d.externalUid ? 'duty.fromCalendar' : 'duty.manual') },
          { key: 'remove', header: '', align: 'right', render: (d) => <ActionIcon aria-label={common('actions.delete')} onClick={(e) => { e.stopPropagation(); setRemoving(d); }}><IconTrash size={16} /></ActionIcon> },
        ]}
      />
      {editing && <DutyDialog duty={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        opened={!!removing}
        onClose={() => setRemoving(null)}
        title={t('duty.deleteTitle')}
        description={removing ? `${name(removing.personId)} · ${formatDateTime(removing.from, i18n.language)}` : ''}
        confirmLabel={common('actions.delete')}
        onConfirm={() => {
          if (removing) remove.mutate(removing.id);
          setRemoving(null);
        }}
      />
    </Stack>
  );
}

function DutyDialog({ duty, onClose }: { duty?: DutyAssignment; onClose: () => void }) {
  const { t } = useTranslation('incidents');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: persons = [] } = usePersons();
  const { data: settings } = useSettings();
  const kinds = settings?.dutyKinds ?? [];
  const [form, setForm] = useState<{ personId: string | null; kind: string | null; from: string; to: string; notes: string }>(() => ({
    personId: duty?.personId ?? null,
    kind: duty?.kind ?? kinds[0]?.key ?? null,
    from: toLocalInput(duty?.from),
    to: toLocalInput(duty?.to),
    notes: duty?.notes ?? '',
  }));
  const save = useAction(
    () => {
      const body = { personId: form.personId, kind: form.kind, from: fromLocalInput(form.from), to: fromLocalInput(form.to), notes: form.notes };
      return duty ? send('PUT', `incidents/duty/${duty.id}`, body) : send('POST', 'incidents/duty', body);
    },
    { success: t('duty.saved'), invalidate: [DUTY], onSuccess: onClose },
  );
  const valid = form.personId && form.kind && form.from && form.to && form.to > form.from;
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={duty ? t('duty.edit') : t('duty.create')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <Panel p={0} shadow="none">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t('duty.person')} data={persons.filter((p) => p.status !== 'left').map((p) => ({ value: p.id, label: personName(p) }))} value={form.personId} onChange={(v) => setForm({ ...form, personId: v })} searchable required />
          <Select label={t('duty.kind')} data={kinds.map((k) => ({ value: k.key, label: localized(k.name) }))} value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} required />
          <TextInput label={t('duty.from')} type="datetime-local" value={form.from} onChange={(e) => setForm({ ...form, from: e.currentTarget.value })} required />
          <TextInput label={t('duty.to')} type="datetime-local" value={form.to} onChange={(e) => setForm({ ...form, to: e.currentTarget.value })} required />
        </SimpleGrid>
        <TextInput label={t('duty.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} mt="sm" />
        <Text size="xs" c="dimmed" mt="xs">{t('duty.hint')}</Text>
      </Panel>
    </ResponsiveDialog>
  );
}
