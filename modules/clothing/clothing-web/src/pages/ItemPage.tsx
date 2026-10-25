import { Button, Checkbox, Group, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import { useParams } from 'react-router';
import type { Care, Inspection, IssueRecord } from '@forga/clothing-contracts';
import { can, formatDate, localDate, send, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, EmptyState, PageHeader, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { ISSUE, keys, MANAGE, useArticleName, useArticles, useItem, usePersonName, usePersons } from '../api';
import { Due, ItemStatusBadge } from '../parts';
import { ItemDialog } from './ItemDialog';

type Dialog = 'issue' | 'return' | 'care' | 'inspection' | 'edit' | 'retire' | null;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap" align="start">
      <Text size="sm" c="dimmed" w={170} style={{ flexShrink: 0 }}>{label}</Text>
      <Text size="sm" component="div">{children || '–'}</Text>
    </Group>
  );
}

/** One piece: master data, holder, washing, inspections and history. */
export function ItemPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('clothing');
  const { t: common } = useTranslation('common');
  const session = useSession().data;
  const { data: item, isLoading } = useItem(id);
  const { data: articles = [] } = useArticles();
  const { data: persons = [] } = usePersons();
  const articleName = useArticleName();
  const personName = usePersonName();
  const [dialog, setDialog] = useState<Dialog>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [flag, setFlag] = useState(false);
  const value = (key: string, fallback = '') => values[key] ?? fallback;
  const setValue = (key: string, v: string | null) => setValues((x) => ({ ...x, [key]: v ?? '' }));
  const open = (d: Dialog) => {
    setValues({});
    setFlag(d === 'inspection');
    setDialog(d);
  };
  const close = () => setDialog(null);
  const done = { success: t('items.saved'), invalidate: [keys.all], onSuccess: close };
  const issue = useAction(() => send('POST', `clothing/items/${id}/issue`, { personId: value('person'), date: value('date', localDate()), notes: value('notes') }), done);
  const giveBack = useAction(() => send('POST', `clothing/items/${id}/return`, { date: value('date', localDate()), notes: value('notes'), retire: flag }), done);
  const care = useAction(() => send('POST', 'clothing/care', { itemIds: [id], kind: value('kind', 'wash'), date: value('date', localDate()), place: value('place'), notes: value('notes') }), done);
  const inspect = useAction(() => send('POST', `clothing/items/${id}/inspections`, { date: value('date', localDate()), passed: flag, inspector: value('inspector'), notes: value('notes') }), done);
  const retire = useAction(() => send('POST', `clothing/items/${id}/retire`), done);

  if (isLoading) return <Text c="dimmed">{t('loading')}</Text>;
  if (!item) return <EmptyState title={t('notFound')} />;
  const article = articles.find((a) => a.key === item.articleKey);
  const mayIssue = can(session, ISSUE, item.departmentId);
  const mayManage = can(session, MANAGE, item.departmentId);
  const date = (label: string) => <DateInput label={label} value={value('date', localDate())} onChange={(v) => setValue('date', v)} valueFormat="DD.MM.YYYY" required />;
  const notes = <Textarea label={t('items.notes')} value={value('notes')} onChange={(e) => setValue('notes', e.currentTarget.value)} autosize minRows={1} />;
  const actions = (submit: () => void, loading: boolean, ok = true) => (
    <Group justify="flex-end">
      <Button variant="default" onClick={close}>{common('actions.cancel')}</Button>
      <Button onClick={submit} loading={loading} disabled={!ok}>{common('actions.save')}</Button>
    </Group>
  );

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('items.title'), to: '/clothing/items' }, { label: item.inventoryNumber }]}
        title={`${item.inventoryNumber} · ${articleName(item.articleKey)}`}
        actions={
          <Group>
            {mayIssue && item.status === 'stock' && <Button onClick={() => open('issue')}>{t('items.issue')}</Button>}
            {mayIssue && item.status === 'issued' && <Button onClick={() => open('return')}>{t('items.return')}</Button>}
            {mayIssue && article?.textile && item.status !== 'retired' && <Button variant="default" onClick={() => open('care')}>{t('care.record')}</Button>}
            {mayIssue && article?.inspectionMonths && item.status !== 'retired' && <Button variant="default" onClick={() => open('inspection')}>{t('inspections.record')}</Button>}
            {mayManage && item.status !== 'retired' && <Button variant="default" onClick={() => open('edit')}>{common('actions.edit')}</Button>}
            {mayManage && item.status === 'stock' && <Button variant="subtle" color="red" onClick={() => open('retire')}>{t('items.retire')}</Button>}
          </Group>
        }
      />
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="lg">
        <Panel title={t('items.details')}>
          <Stack gap={6}>
            <Row label={t('items.status')}><ItemStatusBadge status={item.status} /></Row>
            <Row label={t('items.holder')}>{item.holderId ? `${personName(item.holderId)} · ${t('items.since', { date: formatDate(item.issuedOn, i18n.language) })}` : ''}</Row>
            <Row label={t('items.size')}>{item.size}</Row>
            <Row label={t('items.manufacturer')}>{item.manufacturer}</Row>
            <Row label={t('items.serialNumber')}>{item.serialNumber}</Row>
            <Row label={t('items.purchasedOn')}>{formatDate(item.purchasedOn, i18n.language)}</Row>
            <Row label={t('items.notes')}>{item.notes}</Row>
          </Stack>
        </Panel>
        <Panel title={t('items.dues')}>
          <Stack gap={6}>
            {article?.textile && <Row label={t('items.lastWashed')}>{formatDate(item.lastWashedOn, i18n.language)}</Row>}
            {article?.textile && <Row label={t('items.lastImpregnated')}>{formatDate(item.lastImpregnatedOn, i18n.language)}</Row>}
            {article?.impregnationMonths && <Row label={t('items.impregnationDue')}><Due date={item.impregnationDueOn} /></Row>}
            {article?.inspectionMonths && <Row label={t('items.lastInspected')}>{formatDate(item.lastInspectedOn, i18n.language)}</Row>}
            {article?.inspectionMonths && <Row label={t('items.inspectionDue')}><Due date={item.inspectionDueOn} /></Row>}
            {!article?.textile && !article?.inspectionMonths && <Text size="sm" c="dimmed">{t('items.noDues')}</Text>}
          </Stack>
        </Panel>
      </SimpleGrid>
      {article?.textile && (
        <Panel title={t('care.title')}>
          <DataTable<Care>
            rows={item.care}
            rowKey={(c) => c.id}
            empty={t('care.empty')}
            columns={[
              { key: 'date', header: t('care.date'), render: (c) => formatDate(c.date, i18n.language) },
              { key: 'kind', header: t('care.kind'), render: (c) => <StatusBadge tone={c.kind === 'impregnation' ? 'primary' : 'neutral'}>{t(`care.kinds.${c.kind}`)}</StatusBadge> },
              { key: 'place', header: t('care.place'), render: (c) => c.place },
              { key: 'notes', header: t('items.notes'), render: (c) => c.notes },
              { key: 'by', header: t('items.recordedBy'), render: (c) => c.recordedBy },
            ]}
          />
        </Panel>
      )}
      {(article?.inspectionMonths || item.inspections.length > 0) && (
        <Panel title={t('inspections.title')}>
          <DataTable<Inspection>
            rows={item.inspections}
            rowKey={(i) => i.id}
            empty={t('inspections.empty')}
            columns={[
              { key: 'date', header: t('care.date'), render: (i) => formatDate(i.date, i18n.language) },
              { key: 'passed', header: t('inspections.result'), render: (i) => <StatusBadge tone={i.passed ? 'done' : 'error'}>{t(i.passed ? 'inspections.passed' : 'inspections.failed')}</StatusBadge> },
              { key: 'inspector', header: t('inspections.inspector'), render: (i) => i.inspector },
              { key: 'notes', header: t('items.notes'), render: (i) => i.notes },
            ]}
          />
        </Panel>
      )}
      <Panel title={t('history.title')}>
        <DataTable<IssueRecord>
          rows={item.history}
          rowKey={(h) => h.id}
          empty={t('history.empty')}
          columns={[
            { key: 'date', header: t('care.date'), render: (h) => formatDate(h.date, i18n.language) },
            { key: 'kind', header: t('history.kind'), render: (h) => t(`history.kinds.${h.kind}`) },
            { key: 'person', header: t('history.person'), render: (h) => personName(h.personId) },
            { key: 'notes', header: t('items.notes'), render: (h) => h.notes },
            { key: 'by', header: t('items.recordedBy'), render: (h) => h.recordedBy },
          ]}
        />
      </Panel>

      {dialog === 'issue' && (
        <ResponsiveDialog opened onClose={close} title={t('items.issue')} actions={actions(() => issue.mutate(undefined), issue.isPending, Boolean(value('person')))}>
          <Stack gap="sm">
            <Select
              label={t('history.person')}
              data={persons.filter((p) => p.status !== 'left' && !p.restricted).map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}` }))}
              value={value('person') || null}
              onChange={(v) => setValue('person', v)}
              searchable
              required
            />
            {date(t('items.issuedOn'))}
            {notes}
          </Stack>
        </ResponsiveDialog>
      )}
      {dialog === 'return' && (
        <ResponsiveDialog opened onClose={close} title={t('items.return')} actions={actions(() => giveBack.mutate(undefined), giveBack.isPending)}>
          <Stack gap="sm">
            <Text size="sm">{t('items.returnText', { name: personName(item.holderId) })}</Text>
            {date(t('items.returnedOn'))}
            <Checkbox label={t('items.retireOnReturn')} description={t('items.retireOnReturnHint')} checked={flag} onChange={(e) => setFlag(e.currentTarget.checked)} />
            {notes}
          </Stack>
        </ResponsiveDialog>
      )}
      {dialog === 'care' && (
        <ResponsiveDialog opened onClose={close} title={t('care.record')} actions={actions(() => care.mutate(undefined), care.isPending)}>
          <Stack gap="sm">
            <SegmentedControl value={value('kind', 'wash')} onChange={(v) => setValue('kind', v)} data={(['wash', 'impregnation'] as const).map((k) => ({ value: k, label: t(`care.kinds.${k}`) }))} />
            <Text size="xs" c="dimmed">{t('care.impregnationHint')}</Text>
            {date(t('care.date'))}
            <TextInput label={t('care.place')} description={t('care.placeHint')} value={value('place')} onChange={(e) => setValue('place', e.currentTarget.value)} />
            {notes}
          </Stack>
        </ResponsiveDialog>
      )}
      {dialog === 'inspection' && (
        <ResponsiveDialog opened onClose={close} title={t('inspections.record')} actions={actions(() => inspect.mutate(undefined), inspect.isPending)}>
          <Stack gap="sm">
            {date(t('care.date'))}
            <Checkbox label={t('inspections.passed')} checked={flag} onChange={(e) => setFlag(e.currentTarget.checked)} />
            <TextInput label={t('inspections.inspector')} value={value('inspector')} onChange={(e) => setValue('inspector', e.currentTarget.value)} />
            {notes}
          </Stack>
        </ResponsiveDialog>
      )}
      {dialog === 'edit' && <ItemDialog item={item} onClose={close} />}
      <ConfirmDialog opened={dialog === 'retire'} onClose={close} title={t('items.retireTitle')} confirmLabel={t('items.retire')} onConfirm={() => retire.mutate(undefined)} />
    </Stack>
  );
}
