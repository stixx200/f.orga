import { ActionIcon, Button, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconCertificate, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { type Person, qualificationLabel, requiresDescription } from '@forga/masterdata-contracts';
import { apiUrl, formatDate, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { today, useCatalog, useCatalogNames } from '../api';

interface Entry {
  id: string;
  key: string;
  date: string;
  validUntil: string | null;
  fromCourse: boolean;
  /** Actual course of a collective entry like "other course". */
  description: string;
  notes: string;
}

/** Qualifications or honors of a person: list, add, remove. */
export function EntriesTab({ kind, person, disabled, onChanged }: { kind: 'qualification' | 'honor'; person: Person; disabled: boolean; onChanged: (p: Person) => void }) {
  const { t, i18n } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: catalog = [] } = useCatalog(kind);
  const name = useCatalogNames(kind);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [form, setForm] = useState({ key: null as string | null, date: today() as string | null, validUntil: null as string | null, description: '', notes: '' });
  // Collective entries like "other course" need the actual course as description.
  const describe = kind === 'qualification' && requiresDescription(catalog.find((c) => c.key === form.key));
  const path = kind === 'qualification' ? 'qualifications' : 'honors';
  const entries: Entry[] =
    kind === 'qualification'
      ? person.qualifications.map((q) => ({ id: q.id, key: q.qualification, date: q.acquiredOn, validUntil: q.validUntil, fromCourse: Boolean(q.courseAttendanceId), description: q.description, notes: q.notes }))
      : person.honors.map((h) => ({ id: h.id, key: h.honor, date: h.awardedOn, validUntil: null, fromCourse: false, description: '', notes: h.notes }));
  const add = useAction(
    () =>
      send<Person>(
        'POST',
        `masterdata/persons/${person.id}/${path}`,
        kind === 'qualification'
          ? { qualification: form.key, acquiredOn: form.date, validUntil: form.validUntil, description: describe ? form.description : '', notes: form.notes }
          : { honor: form.key, awardedOn: form.date, notes: form.notes },
      ),
    {
      success: t('person.saved'),
      onSuccess: (p) => {
        onChanged(p);
        setAdding(false);
      },
    },
  );
  const remove = useAction((id: string) => send<Person>('DELETE', `masterdata/persons/${person.id}/${path}/${id}`), { success: t('person.saved'), onSuccess: onChanged });

  return (
    <Panel
      title={t(`entries.${kind}.title`)}
      aside={
        !disabled && (
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              setForm({ key: null, date: today(), validUntil: null, description: '', notes: '' });
              setAdding(true);
            }}
          >
            {t(`entries.${kind}.add`)}
          </Button>
        )
      }
    >
      <DataTable<Entry>
        rows={entries.toSorted((a, b) => b.date.localeCompare(a.date))}
        rowKey={(e) => e.id}
        empty={t(`entries.${kind}.empty`)}
        columns={[
          { key: 'name', header: t(`entries.${kind}.name`), render: (e) => <Text fw={700} size="sm">{qualificationLabel(name(e.key, i18n.language), e.description)}</Text> },
          { key: 'date', header: t(`entries.${kind}.date`), render: (e) => formatDate(e.date, i18n.language) },
          ...(kind === 'qualification'
            ? [
                { key: 'valid', header: t('entries.qualification.validUntil'), render: (e: Entry) => (e.validUntil ? formatDate(e.validUntil, i18n.language) : '–') },
                { key: 'source', header: t('entries.qualification.source'), render: (e: Entry) => t(e.fromCourse ? 'entries.qualification.fromCourse' : 'entries.qualification.manual') },
              ]
            : []),
          { key: 'notes', header: t('entries.notes'), render: (e) => e.notes },
          {
            key: 'remove',
            header: '',
            align: 'right',
            render: (e) => (
              <Group gap={4} justify="flex-end" wrap="nowrap">
                {kind === 'honor' && <ActionIcon component="a" href={apiUrl('masterdata/persons/honors/certificates.pdf', { ids: e.id })} target="_blank" variant="subtle" aria-label={t('certificates.one')}><IconCertificate size={16} /></ActionIcon>}
                {!disabled && !e.fromCourse && <ActionIcon aria-label={common('actions.delete')} onClick={() => setRemoving(e.id)}><IconTrash size={16} /></ActionIcon>}
              </Group>
            ),
          },
        ]}
      />
      {kind === 'qualification' && <Text size="xs" c="dimmed" mt="sm">{t('entries.qualification.hint')}</Text>}
      {adding && (
        <ResponsiveDialog
          opened
          onClose={() => setAdding(false)}
          title={t(`entries.${kind}.add`)}
          actions={
            <Group justify="flex-end">
              <Button variant="default" onClick={() => setAdding(false)}>{common('actions.cancel')}</Button>
              <Button loading={add.isPending} disabled={!form.key || !form.date || (describe && !form.description.trim())} onClick={() => add.mutate(undefined)}>{common('actions.save')}</Button>
            </Group>
          }
        >
          <Stack gap="sm">
            <Select label={t(`entries.${kind}.name`)} data={catalog.filter((c) => c.active).map((c) => ({ value: c.key, label: localized(c.name) }))} value={form.key} onChange={(v) => setForm({ ...form, key: v })} searchable required />
            {describe && (
              <TextInput label={t('entries.qualification.description')} description={t('entries.qualification.descriptionHint')} value={form.description} onChange={(e) => setForm({ ...form, description: e.currentTarget.value })} maxLength={200} required />
            )}
            <DateInput label={t(`entries.${kind}.date`)} value={form.date} onChange={(v) => setForm({ ...form, date: v })} valueFormat="DD.MM.YYYY" required />
            {kind === 'qualification' && (
              <DateInput label={t('entries.qualification.validUntil')} description={t('entries.qualification.validHint')} value={form.validUntil} onChange={(v) => setForm({ ...form, validUntil: v })} valueFormat="DD.MM.YYYY" clearable />
            )}
            <TextInput label={t('entries.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} />
          </Stack>
        </ResponsiveDialog>
      )}
      <ConfirmDialog
        opened={!!removing}
        onClose={() => setRemoving(null)}
        title={t(`entries.${kind}.removeTitle`)}
        confirmLabel={common('actions.delete')}
        onConfirm={() => {
          if (removing) remove.mutate(removing);
          setRemoving(null);
        }}
      />
    </Panel>
  );
}
