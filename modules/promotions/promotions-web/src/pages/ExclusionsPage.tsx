import { Button, Group, Select, Stack, Text, Textarea } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import type { Exclusion } from '@forga/promotions-contracts';
import { formatDate, localDate, send, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, PageHeader, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, useCatalog, useCatalogName, useExclusions, usePersons } from '../api';

function ExclusionDialog({ exclusion, onClose }: { exclusion?: Exclusion; onClose: () => void }) {
  const { t } = useTranslation('promotions');
  const { t: common } = useTranslation('common');
  const { data: persons = [] } = usePersons();
  const { data: ranks = [] } = useCatalog('rank');
  const rank = useCatalogName('rank');
  const [form, setForm] = useState({ personId: exclusion?.personId ?? null, from: exclusion?.from ?? localDate(), until: exclusion?.until ?? null, targetRank: exclusion?.targetRank ?? null, reason: exclusion?.reason ?? '' });
  const save = useAction(() => (exclusion ? send('PUT', `promotions/exclusions/${exclusion.id}`, { ...form, version: exclusion.version }) : send('POST', 'promotions/exclusions', form)), { success: t('exclusions.saved'), invalidate: [keys.all], onSuccess: onClose });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={exclusion ? t('exclusions.edit') : t('exclusions.create')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!form.personId || !form.reason.trim()} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <Select label={t('fields.person')} searchable disabled={Boolean(exclusion)} data={persons.map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}` }))} value={form.personId} onChange={(v) => setForm({ ...form, personId: v })} />
      <Group grow>
        <DateInput label={t('fields.from')} value={form.from} onChange={(v) => v && setForm({ ...form, from: v })} valueFormat="DD.MM.YYYY" />
        <DateInput label={t('fields.until')} description={t('exclusions.untilHint')} value={form.until} onChange={(v) => setForm({ ...form, until: v })} valueFormat="DD.MM.YYYY" clearable />
      </Group>
      <Select
        label={t('exclusions.targetRank')}
        description={t('exclusions.targetRankHint')}
        placeholder={t('exclusions.allRanks')}
        data={ranks.map((r) => ({ value: r.key, label: rank(r.key) }))}
        value={form.targetRank}
        onChange={(v) => setForm({ ...form, targetRank: v })}
        clearable
      />
      <Textarea label={t('fields.reason')} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.currentTarget.value })} autosize minRows={2} required />
    </ResponsiveDialog>
  );
}

/** Persons excluded from promotions, e.g. after disciplinary measures; visible only with the exclusion permission. */
export function ExclusionsPage() {
  const { t, i18n } = useTranslation('promotions');
  const rank = useCatalogName('rank');
  const { data = [], isLoading } = useExclusions();
  const [editing, setEditing] = useState<Exclusion | 'new' | null>(null);
  const [removing, setRemoving] = useState<Exclusion | null>(null);
  const [today] = useState(() => localDate());
  const remove = useAction((id: string) => send('DELETE', `promotions/exclusions/${id}`), { success: t('exclusions.removed'), invalidate: [keys.all], onSuccess: () => setRemoving(null) });
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('exclusions.title') }]} title={t('exclusions.title')} actions={<Button onClick={() => setEditing('new')}>{t('exclusions.create')}</Button>} />
      <DataTable<Exclusion>
        rows={data}
        rowKey={(e) => e.id}
        onRowClick={(e) => setEditing(e)}
        empty={isLoading ? t('loading') : t('exclusions.empty')}
        columns={[
          { key: 'name', header: t('fields.name'), render: (e) => <Text size="sm" fw={700}>{e.lastName}, {e.firstName}</Text> },
          { key: 'period', header: t('exclusions.period'), render: (e) => <Text size="sm" c={e.until && e.until < today ? 'dimmed' : undefined}>{formatDate(e.from, i18n.language)} – {e.until ? formatDate(e.until, i18n.language) : t('exclusions.open')}</Text> },
          { key: 'rank', header: t('exclusions.targetRank'), render: (e) => (e.targetRank ? rank(e.targetRank) : t('exclusions.allRanks')) },
          { key: 'reason', header: t('fields.reason'), render: (e) => e.reason },
          { key: 'by', header: t('exclusions.by'), render: (e) => e.createdBy },
          { key: 'actions', header: '', align: 'right', render: (e) => <Button size="compact-xs" variant="subtle" color="red" onClick={(ev) => { ev.stopPropagation(); setRemoving(e); }}>{t('exclusions.remove')}</Button> },
        ]}
      />
      {editing && <ExclusionDialog exclusion={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog opened={Boolean(removing)} onClose={() => setRemoving(null)} title={t('exclusions.remove')} description={removing ? `${removing.firstName} ${removing.lastName}` : ''} confirmLabel={t('exclusions.remove')} loading={remove.isPending} onConfirm={() => removing && remove.mutate(removing.id)} />
    </Stack>
  );
}
