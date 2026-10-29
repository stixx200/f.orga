import { ActionIcon, Button, Group, Select, Stack, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { Person, RestPeriod, RestPeriodReason } from '@forga/masterdata-contracts';
import { formatDate, send, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { today } from '../api';

type Draft = { reason: RestPeriodReason; from: string | null; to: string | null; notes: string };

/** Periods that do not count as service time for promotions: dormant membership or service in another brigade. */
export function RestPeriodsPanel({ person, disabled, onChanged }: { person: Person; disabled: boolean; onChanged: (p: Person) => void }) {
  const { t, i18n } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const [editing, setEditing] = useState<RestPeriod | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>({ reason: 'dormant', from: today(), to: null, notes: '' });
  const [removing, setRemoving] = useState<string | null>(null);
  const open = (entry: RestPeriod | 'new') => {
    setDraft(entry === 'new' ? { reason: 'dormant', from: today(), to: null, notes: '' } : { reason: entry.reason, from: entry.from, to: entry.to, notes: entry.notes });
    setEditing(entry);
  };
  const save = useAction(
    () => (editing === 'new' || editing === null ? send<Person>('POST', `masterdata/persons/${person.id}/rest-periods`, draft) : send<Person>('PUT', `masterdata/persons/${person.id}/rest-periods/${editing.id}`, draft)),
    {
      success: t('person.saved'),
      onSuccess: (p) => {
        onChanged(p);
        setEditing(null);
      },
    },
  );
  const remove = useAction((id: string) => send<Person>('DELETE', `masterdata/persons/${person.id}/rest-periods/${id}`), { success: t('person.saved'), onSuccess: onChanged });

  return (
    <Panel title={t('restPeriods.title')} aside={!disabled && <Button size="xs" variant="outline" onClick={() => open('new')}>{t('restPeriods.add')}</Button>}>
      <DataTable<RestPeriod>
        rows={person.restPeriods}
        rowKey={(r) => r.id}
        onRowClick={disabled ? undefined : open}
        empty={t('restPeriods.empty')}
        columns={[
          { key: 'reason', header: t('restPeriods.reason'), render: (r) => t(`restPeriods.reasons.${r.reason}`) },
          { key: 'period', header: t('offices.period'), render: (r) => `${formatDate(r.from, i18n.language)} – ${r.to ? formatDate(r.to, i18n.language) : ''}` },
          { key: 'notes', header: t('entries.notes'), render: (r) => r.notes },
          {
            key: 'remove',
            header: '',
            align: 'right',
            render: (r) =>
              !disabled && (
                <ActionIcon
                  aria-label={common('actions.delete')}
                  onClick={(event) => {
                    event.stopPropagation();
                    setRemoving(r.id);
                  }}
                >
                  <IconTrash size={16} />
                </ActionIcon>
              ),
          },
        ]}
      />
      {editing && (
        <ResponsiveDialog
          opened
          onClose={() => setEditing(null)}
          title={editing === 'new' ? t('restPeriods.add') : t('restPeriods.edit')}
          actions={
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEditing(null)}>{common('actions.cancel')}</Button>
              <Button loading={save.isPending} disabled={!draft.from || Boolean(draft.to && draft.from && draft.to < draft.from)} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
            </Group>
          }
        >
          <Stack gap="sm">
            <Select label={t('restPeriods.reason')} data={(['dormant', 'other-brigade'] as const).map((r) => ({ value: r, label: t(`restPeriods.reasons.${r}`) }))} value={draft.reason} onChange={(v) => v && setDraft({ ...draft, reason: v as RestPeriodReason })} allowDeselect={false} />
            <Group grow>
              <DateInput label={t('offices.from')} value={draft.from} onChange={(v) => setDraft({ ...draft, from: v })} valueFormat="DD.MM.YYYY" required />
              <DateInput label={t('offices.to')} description={t('restPeriods.toHint')} value={draft.to} onChange={(v) => setDraft({ ...draft, to: v })} valueFormat="DD.MM.YYYY" clearable />
            </Group>
            <TextInput label={t('entries.notes')} description={common('privacy.noHealthData')} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.currentTarget.value })} />
          </Stack>
        </ResponsiveDialog>
      )}
      <ConfirmDialog
        opened={!!removing}
        onClose={() => setRemoving(null)}
        title={t('restPeriods.removeTitle')}
        confirmLabel={common('actions.delete')}
        onConfirm={() => {
          if (removing) remove.mutate(removing);
          setRemoving(null);
        }}
      />
    </Panel>
  );
}
