import { ActionIcon, Button, Group, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { Link } from 'react-router';
import type { DutyAssignment } from '@forga/duty-officer-contracts';
import { can, formatDateTime, formatMoney, fromLocalInput, send, toLocalInput, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, Notice, PageHeader, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, personName, ROSTER, SETTINGS, useDutySettings, usePersons, useRoster } from '../api';

/** Special services from the duty roster (e.g. duty officer), compensated per day. */
export function RosterPage() {
  const { t, i18n } = useTranslation('duty-officer');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const session = useSession().data;
  const editable = can(session, ROSTER);
  const [thisYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState(String(thisYear));
  const { data: duties = [], isLoading } = useRoster(year);
  const { data: persons = [] } = usePersons();
  const { data: settings } = useDutySettings();
  const kinds = settings?.dutyKinds ?? [];
  const [editing, setEditing] = useState<DutyAssignment | 'new' | null>(null);
  const [removing, setRemoving] = useState<DutyAssignment | null>(null);
  const remove = useAction((id: string) => send('DELETE', `duty-officer/roster/${id}`), { success: t('roster.deleted'), invalidate: [keys.roster] });
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
        breadcrumbs={[{ label: t('module') }, { label: t('roster.title') }]}
        title={t('roster.title')}
        subtitle={t('roster.subtitle')}
        actions={
          editable && (
            <Group>
              <Button component={Link} to="/import" variant="default">{t('roster.import')}</Button>
              <Button onClick={() => setEditing('new')} disabled={!kinds.length}>{t('roster.create')}</Button>
            </Group>
          )
        }
      />
      {settings && !kinds.length && (
        <Notice kind="info" action={can(session, SETTINGS) && <Button component={Link} to="/duty-officer/settings" size="xs" variant="outline">{t('roster.toSettings')}</Button>}>
          {t('roster.noKinds')}
        </Notice>
      )}
      <Group justify="space-between">
        <Select aria-label={t('year')} data={[0, 1, 2].map((i) => String(thisYear + 1 - i))} value={year} onChange={(v) => v && setYear(v)} allowDeselect={false} w={120} />
        <Text size="sm" c="dimmed">{t('roster.summary', { count: duties.length, amount: formatMoney(total, i18n.language) })}</Text>
      </Group>
      <DataTable<DutyAssignment>
        rows={duties.toSorted((a, b) => b.from.localeCompare(a.from))}
        rowKey={(d) => d.id}
        empty={isLoading ? t('loading') : t('roster.empty')}
        onRowClick={editable ? (d) => setEditing(d) : undefined}
        columns={[
          { key: 'person', header: t('roster.person'), render: (d) => <Text fw={700} size="sm">{name(d.personId)}</Text> },
          { key: 'kind', header: t('roster.kind'), render: (d) => kindName(d.kind) },
          { key: 'from', header: t('roster.from'), render: (d) => formatDateTime(d.from, i18n.language) },
          { key: 'to', header: t('roster.to'), render: (d) => formatDateTime(d.to, i18n.language) },
          { key: 'days', header: t('roster.days'), align: 'right', render: (d) => d.days },
          { key: 'amount', header: t('roster.amount'), align: 'right', render: (d) => formatMoney(d.amount, i18n.language) },
          { key: 'source', header: t('roster.source'), render: (d) => t(d.externalUid ? 'roster.fromCalendar' : 'roster.manual') },
          ...(editable
            ? [{ key: 'remove', header: '', align: 'right' as const, render: (d: DutyAssignment) => <ActionIcon aria-label={common('actions.delete')} onClick={(e) => { e.stopPropagation(); setRemoving(d); }}><IconTrash size={16} /></ActionIcon> }]
            : []),
        ]}
      />
      {editing && <DutyDialog duty={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        opened={!!removing}
        onClose={() => setRemoving(null)}
        title={t('roster.deleteTitle')}
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
  const { t } = useTranslation('duty-officer');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: persons = [] } = usePersons();
  const { data: settings } = useDutySettings();
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
      return duty ? send('PUT', `duty-officer/roster/${duty.id}`, body) : send('POST', 'duty-officer/roster', body);
    },
    { success: t('roster.saved'), invalidate: [keys.roster], onSuccess: onClose },
  );
  const valid = form.personId && form.kind && form.from && form.to && form.to > form.from;
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={duty ? t('roster.edit') : t('roster.create')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <Panel p={0} shadow="none">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t('roster.person')} data={persons.filter((p) => p.status !== 'left').map((p) => ({ value: p.id, label: personName(p) }))} value={form.personId} onChange={(v) => setForm({ ...form, personId: v })} searchable required />
          <Select label={t('roster.kind')} data={kinds.map((k) => ({ value: k.key, label: localized(k.name) }))} value={form.kind} onChange={(v) => setForm({ ...form, kind: v })} required />
          <TextInput label={t('roster.from')} type="datetime-local" value={form.from} onChange={(e) => setForm({ ...form, from: e.currentTarget.value })} required />
          <TextInput label={t('roster.to')} type="datetime-local" value={form.to} onChange={(e) => setForm({ ...form, to: e.currentTarget.value })} required />
        </SimpleGrid>
        <TextInput label={t('roster.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} mt="sm" />
        <Text size="xs" c="dimmed" mt="xs">{t('roster.hint')}</Text>
      </Panel>
    </ResponsiveDialog>
  );
}
