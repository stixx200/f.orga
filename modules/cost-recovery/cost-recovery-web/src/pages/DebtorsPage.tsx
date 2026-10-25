import { ActionIcon, Button, Group, SimpleGrid, Stack, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { AddressBookEntry, AddressBookInput } from '@forga/cost-recovery-contracts';
import { send, useTranslation } from '@forga/web-sdk';
import { DataTable, PageHeader, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, useAddressBook } from '../api';

function EntryDialog({ entry, onClose }: { entry?: AddressBookEntry; onClose: () => void }) {
  const { t } = useTranslation('cost-recovery');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState<Required<AddressBookInput>>(() => ({ name: entry?.name ?? '', street: entry?.street ?? '', postalCode: entry?.postalCode ?? '', city: entry?.city ?? '', role: entry?.role ?? '', notes: entry?.notes ?? '' }));
  const save = useAction(() => (entry ? send('PUT', `cost-recovery/debtors/${entry.id}`, form) : send('POST', 'cost-recovery/debtors', form)), { invalidate: [keys.all], onSuccess: onClose });
  const field = (key: keyof typeof form, required = false) => <TextInput label={t(`debtor.${key}`)} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.currentTarget.value })} required={required} />;
  return (
    <ResponsiveDialog opened onClose={onClose} title={entry ? t('debtors.edit') : t('debtors.add')} actions={<Group justify="flex-end"><Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button><Button loading={save.isPending} disabled={!form.name.trim()} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button></Group>}>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {field('name', true)}
        {field('street')}
        {field('postalCode')}
        {field('city')}
        {field('role')}
        {field('notes')}
      </SimpleGrid>
    </ResponsiveDialog>
  );
}

/** Frequent debtors, e.g. operators of fire alarm systems or insurances. */
export function DebtorsPage() {
  const { t } = useTranslation('cost-recovery');
  const { data = [] } = useAddressBook();
  const [editing, setEditing] = useState<AddressBookEntry | 'new' | null>(null);
  const remove = useAction((id: string) => send('DELETE', `cost-recovery/debtors/${id}`), { invalidate: [keys.all] });
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('debtors.title') }]} title={t('debtors.title')} subtitle={t('debtors.subtitle')} actions={<Button onClick={() => setEditing('new')}>{t('debtors.add')}</Button>} />
      <DataTable<AddressBookEntry>
        rows={data}
        rowKey={(e) => e.id}
        onRowClick={setEditing}
        empty={t('debtors.empty')}
        columns={[
          { key: 'name', header: t('debtor.name'), render: (e) => e.name },
          { key: 'address', header: t('debtor.street'), render: (e) => [e.street, `${e.postalCode} ${e.city}`.trim()].filter(Boolean).join(', ') },
          { key: 'notes', header: t('debtor.notes'), render: (e) => e.notes },
          { key: 'actions', header: '', align: 'right', render: (e) => <ActionIcon variant="subtle" color="red" aria-label={t('notice.remove')} onClick={(ev) => { ev.stopPropagation(); remove.mutate(e.id); }}><IconTrash size={16} /></ActionIcon> },
        ]}
      />
      {editing && <EntryDialog entry={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
    </Stack>
  );
}
