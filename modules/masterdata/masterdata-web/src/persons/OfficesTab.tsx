import { ActionIcon, Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import type { OfficeAssignment, Person } from '@forga/masterdata-contracts';
import { can, formatDate, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { today, useCatalog, useCatalogNames, useDepartments, WRITE } from '../api';

type Draft = { office: string | null; departmentId: string | null; from: string | null; to: string | null; notes: string };

/** Offices of a person (Ämter) with period and department; ending an office sets "until". */
export function OfficesTab({ person, disabled, onChanged }: { person: Person; disabled: boolean; onChanged: (p: Person) => void }) {
  const { t, i18n } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: catalog = [] } = useCatalog('office');
  const { data: departments = [] } = useDepartments();
  const name = useCatalogNames('office');
  const [editing, setEditing] = useState<OfficeAssignment | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>({ office: null, departmentId: null, from: today(), to: null, notes: '' });
  const [removing, setRemoving] = useState<string | null>(null);
  const [now] = useState(() => today());
  // Offices of a department need the permission for it, offices of the whole brigade the brigade-wide one (as on the server).
  const session = useSession().data;
  const brigadeWide = session?.permissions[WRITE] === 'brigade';
  const mayEdit = (departmentId: string | null) => !disabled && (departmentId ? can(session, WRITE, departmentId) : brigadeWide);
  const choosable = departments.filter((d) => can(session, WRITE, d.id));
  const open = (entry: OfficeAssignment | 'new') => {
    setDraft(entry === 'new' ? { office: null, departmentId: null, from: today(), to: null, notes: '' } : { office: entry.office, departmentId: entry.departmentId, from: entry.from, to: entry.to, notes: entry.notes });
    setEditing(entry);
  };
  const save = useAction(
    () =>
      editing === 'new' || editing === null
        ? send<Person>('POST', `masterdata/persons/${person.id}/offices`, draft)
        : send<Person>('PUT', `masterdata/persons/${person.id}/offices/${editing.id}`, draft),
    {
      success: t('person.saved'),
      onSuccess: (p) => {
        onChanged(p);
        setEditing(null);
      },
    },
  );
  const remove = useAction((id: string) => send<Person>('DELETE', `masterdata/persons/${person.id}/offices/${id}`), { success: t('person.saved'), onSuccess: onChanged });
  const department = (id: string | null) => (id ? (departments.find((d) => d.id === id)?.name ?? '') : t('offices.brigade'));

  return (
    <Panel title={t('offices.title')} aside={!disabled && <Button size="xs" variant="outline" onClick={() => open('new')}>{t('offices.add')}</Button>}>
      <DataTable<OfficeAssignment>
        rows={person.offices.toSorted((a, b) => b.from.localeCompare(a.from))}
        rowKey={(o) => o.id}
        onRowClick={(o) => mayEdit(o.departmentId) && open(o)}
        empty={t('offices.empty')}
        columns={[
          { key: 'office', header: t('offices.office'), render: (o) => <Text fw={700} size="sm">{name(o.office, i18n.language)}</Text> },
          { key: 'department', header: t('offices.department'), render: (o) => department(o.departmentId) },
          { key: 'period', header: t('offices.period'), render: (o) => `${formatDate(o.from, i18n.language)} – ${o.to ? formatDate(o.to, i18n.language) : ''}` },
          { key: 'state', header: '', render: (o) => (!o.to || o.to >= now) && o.from <= now && <StatusBadge tone="done">{t('offices.current')}</StatusBadge> },
          { key: 'notes', header: t('entries.notes'), render: (o) => o.notes },
          {
            key: 'remove',
            header: '',
            align: 'right',
            render: (o) =>
              mayEdit(o.departmentId) && (
                <ActionIcon
                  aria-label={common('actions.delete')}
                  onClick={(event) => {
                    event.stopPropagation();
                    setRemoving(o.id);
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
          title={editing === 'new' ? t('offices.add') : t('offices.edit')}
          actions={
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setEditing(null)}>{common('actions.cancel')}</Button>
              <Button loading={save.isPending} disabled={!draft.office || !draft.from || !mayEdit(draft.departmentId) || Boolean(draft.to && draft.from && draft.to < draft.from)} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
            </Group>
          }
        >
          <Stack gap="sm">
            <Select label={t('offices.office')} data={catalog.filter((c) => c.active).map((c) => ({ value: c.key, label: localized(c.name) }))} value={draft.office} onChange={(v) => setDraft({ ...draft, office: v })} searchable required />
            <Select
              label={t('offices.department')}
              placeholder={brigadeWide ? t('offices.brigade') : undefined}
              data={choosable.map((d) => ({ value: d.id, label: d.name }))}
              value={draft.departmentId}
              onChange={(v) => setDraft({ ...draft, departmentId: v })}
              clearable={brigadeWide}
              required={!brigadeWide}
            />
            <Group grow>
              <DateInput label={t('offices.from')} value={draft.from} onChange={(v) => setDraft({ ...draft, from: v })} valueFormat="DD.MM.YYYY" required />
              <DateInput label={t('offices.to')} description={t('offices.toHint')} value={draft.to} onChange={(v) => setDraft({ ...draft, to: v })} valueFormat="DD.MM.YYYY" clearable />
            </Group>
            <TextInput label={t('entries.notes')} value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.currentTarget.value })} />
          </Stack>
        </ResponsiveDialog>
      )}
      <ConfirmDialog
        opened={!!removing}
        onClose={() => setRemoving(null)}
        title={t('offices.removeTitle')}
        description={t('offices.removeHint')}
        confirmLabel={common('actions.delete')}
        onConfirm={() => {
          if (removing) remove.mutate(removing);
          setRemoving(null);
        }}
      />
    </Panel>
  );
}
