import { Button, Group, SegmentedControl, Stack, Tabs, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Candidate, PromotionList, PromotionListSummary } from '@forga/promotions-contracts';
import { apiUrl, can, formatDate, localDate, send, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, PageHeader, ResponsiveDialog, useAction } from '@forga/web-ui';
import { DECIDE, keys, useCandidates, useCatalogName, useDepartmentName, useLists } from '../api';
import { ExplanationTree, ListStatusBadge, MissingList, StateBadge } from '../parts';

/** Creates a list for a reference date; the candidates are taken over as entries. */
export function ListDialog({ list, onClose }: { list?: PromotionList; onClose: () => void }) {
  const { t } = useTranslation('promotions');
  const { t: common } = useTranslation('common');
  const navigate = useNavigate();
  const [year] = useState(() => new Date().getFullYear());
  const [form, setForm] = useState({ title: list?.title ?? t('lists.defaultTitle', { year }), referenceDate: list?.referenceDate ?? localDate(), effectiveDate: list?.effectiveDate ?? localDate(), notes: list?.notes ?? '' });
  const save = useAction(
    () => (list ? send<PromotionList>('PUT', `promotions/lists/${list.id}`, { ...form, version: list.version }) : send<PromotionList>('POST', 'promotions/lists', form)),
    {
      success: list ? t('lists.saved') : t('lists.created'),
      invalidate: [keys.all],
      onSuccess: (saved) => {
        onClose();
        if (!list) navigate(`/promotions/lists/${saved.id}`);
      },
    },
  );
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={list ? t('lists.edit') : t('lists.create')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!form.title.trim()} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <TextInput label={t('fields.title')} value={form.title} onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} required />
      <Group grow>
        <DateInput label={t('fields.referenceDate')} description={t('lists.referenceHint')} value={form.referenceDate} onChange={(v) => v && setForm({ ...form, referenceDate: v })} valueFormat="DD.MM.YYYY" />
        <DateInput label={t('fields.effectiveDate')} description={t('lists.effectiveHint')} value={form.effectiveDate} onChange={(v) => v && setForm({ ...form, effectiveDate: v })} valueFormat="DD.MM.YYYY" />
      </Group>
      <Textarea label={t('fields.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} autosize minRows={2} />
    </ResponsiveDialog>
  );
}

function Preview() {
  const { t, i18n } = useTranslation('promotions');
  const rank = useCatalogName('rank');
  const department = useDepartmentName();
  const [on, setOn] = useState(() => localDate());
  const [filter, setFilter] = useState('due');
  const [open, setOpen] = useState<Candidate | null>(null);
  const { data = [], isLoading } = useCandidates(on);
  const rows = filter === 'all' ? data : data.filter((c) => c.state === 'fulfilled' || c.state === 'preview');
  return (
    <Stack gap="md">
      <Group align="end" justify="space-between">
        <Group align="end">
          <DateInput label={t('fields.referenceDate')} value={on} onChange={(v) => v && setOn(v)} valueFormat="DD.MM.YYYY" w={160} />
          <SegmentedControl value={filter} onChange={setFilter} data={[{ value: 'due', label: t('preview.due') }, { value: 'all', label: t('preview.all') }]} />
        </Group>
        <Button component="a" href={apiUrl('core/lists/promotions.candidates/export/pdf', { on, lang: i18n.language })} target="_blank" variant="default">{t('preview.print')}</Button>
      </Group>
      <DataTable<Candidate>
        rows={rows}
        rowKey={(c) => c.personId}
        onRowClick={(c) => c.explanation && setOpen(c)}
        empty={isLoading ? t('loading') : t('preview.empty')}
        columns={[
          { key: 'name', header: t('fields.name'), render: (c) => <><Text size="sm" fw={700}>{c.lastName}, {c.firstName}</Text><Text size="xs" c="dimmed">{department(c.departmentId)}</Text></> },
          { key: 'rank', header: t('fields.rank'), render: (c) => <><Text size="sm">{rank(c.rank, true)}</Text><Text size="xs" c="dimmed">{t('fields.since', { date: formatDate(c.rankSince, i18n.language) })}</Text></> },
          { key: 'target', header: t('fields.targetRank'), render: (c) => rank(c.targetRank, true) },
          { key: 'state', header: t('fields.state'), render: (c) => <StateBadge state={c.state} /> },
          { key: 'details', header: t('fields.details'), render: (c) => (c.state === 'excluded' ? <Text size="xs" c="dimmed">{c.exclusion?.reason ?? ''}</Text> : c.state === 'fulfilled' ? '' : <MissingList missing={c.missing} />) },
        ]}
      />
      {open?.explanation && (
        <ResponsiveDialog opened onClose={() => setOpen(null)} title={`${open.firstName} ${open.lastName}: ${rank(open.rank, true)} → ${rank(open.targetRank, true)}`}>
          <ExplanationTree explanation={open.explanation} />
        </ResponsiveDialog>
      )}
    </Stack>
  );
}

/** Promotion lists and the live preview of who can be promoted. */
export function ListsPage() {
  const { t, i18n } = useTranslation('promotions');
  const navigate = useNavigate();
  const session = useSession().data;
  const [creating, setCreating] = useState(false);
  const { data = [], isLoading } = useLists();
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('lists.title') }]}
        title={t('lists.title')}
        actions={can(session, DECIDE) && <Button onClick={() => setCreating(true)}>{t('lists.create')}</Button>}
      />
      <Tabs defaultValue="lists">
        <Tabs.List mb="md">
          <Tabs.Tab value="lists">{t('lists.tab')}</Tabs.Tab>
          <Tabs.Tab value="preview">{t('preview.tab')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="lists">
          <DataTable<PromotionListSummary>
            rows={data}
            rowKey={(l) => l.id}
            onRowClick={(l) => navigate(`/promotions/lists/${l.id}`)}
            empty={isLoading ? t('loading') : t('lists.empty')}
            columns={[
              { key: 'title', header: t('fields.title'), render: (l) => <Text size="sm" fw={700} c="brand">{l.title}</Text> },
              { key: 'reference', header: t('fields.referenceDate'), render: (l) => formatDate(l.referenceDate, i18n.language) },
              { key: 'effective', header: t('fields.effectiveDate'), render: (l) => formatDate(l.effectiveDate, i18n.language) },
              { key: 'count', header: t('lists.promote'), align: 'right', render: (l) => `${l.promote} / ${l.total}` },
              { key: 'status', header: t('fields.status'), render: (l) => <ListStatusBadge status={l.status} /> },
            ]}
          />
        </Tabs.Panel>
        <Tabs.Panel value="preview">
          <Preview />
        </Tabs.Panel>
      </Tabs>
      {creating && <ListDialog onClose={() => setCreating(false)} />}
    </Stack>
  );
}
