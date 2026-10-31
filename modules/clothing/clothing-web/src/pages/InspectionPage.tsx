import { Button, Checkbox, Group, SegmentedControl, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useMemo, useState } from 'react';
import type { Item } from '@forga/clothing-contracts';
import { formatDate, localDate, send, useTranslation } from '@forga/web-sdk';
import { ActionBar, DataTable, matchesSearch, PageHeader, Panel, useAction } from '@forga/web-ui';
import { keys, useArticleName, useArticles, useItems, usePersonName } from '../api';
import { BlockBadges, Due, findByCode, ScanField, useUnknownCode } from '../parts';

/**
 * Inspections of many pieces at once (e.g. the yearly inspection of all jackets): tick or scan the pieces, set the
 * result per piece (passed by default), record all in one step.
 */
export function InspectionPage() {
  const { t, i18n } = useTranslation('clothing');
  const { data: articles = [] } = useArticles();
  const { data: items = [], isLoading } = useItems({});
  const articleName = useArticleName();
  const personName = usePersonName();
  const unknown = useUnknownCode();
  const [date, setDate] = useState<string | null>(() => localDate());
  const [inspector, setInspector] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [soon] = useState(() => localDate(new Date(Date.now() + 30 * 86_400_000)));
  const inspected = useMemo(() => new Set(articles.filter((a) => a.inspectionMonths).map((a) => a.key)), [articles]);
  const pieces = useMemo(() => items.filter((i) => inspected.has(i.articleKey)), [items, inspected]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return pieces
      .filter((i) => selected.has(i.id) || matchesSearch([i.inventoryNumber, i.barcode, i.rfid, i.serialNumber, personName(i.holderId), articleName(i.articleKey)], q))
      .toSorted((a, b) => String(a.inspectionDueOn ?? '9').localeCompare(String(b.inspectionDueOn ?? '9')) || a.inventoryNumber.localeCompare(b.inventoryNumber));
  }, [pieces, selected, query, personName, articleName]);
  const set = (setter: typeof setSelected, id: string, on: boolean) => setter((s) => { const next = new Set(s); if (on) next.add(id); else next.delete(id); return next; });
  const scan = (code: string) => {
    const item = findByCode(pieces, code);
    if (item) set(setSelected, item.id, true);
    else unknown(code);
  };
  const save = useAction(
    () => send('POST', 'clothing/inspections', { date, inspector, results: [...selected].map((id) => ({ itemId: id, passed: !failed.has(id), notes: notes[id] ?? '' })) }),
    {
      success: t('inspections.saved', { count: selected.size }),
      invalidate: [keys.all],
      onSuccess: () => {
        setSelected(new Set());
        setFailed(new Set());
        setNotes({});
      },
    },
  );

  return (
    <Stack gap="lg" pb={80}>
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('inspections.page') }]} title={t('inspections.page')} subtitle={t('inspections.subtitle')} />
      <Panel>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <DateInput label={t('care.date')} value={date} onChange={setDate} maxDate={localDate()} valueFormat="DD.MM.YYYY" required />
          <TextInput label={t('inspections.inspector')} value={inspector} onChange={(e) => setInspector(e.currentTarget.value)} />
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt="sm">{t('inspections.failedHint')}</Text>
      </Panel>
      <Group align="end" grow>
        <ScanField onCode={scan} />
        <TextInput type="search" label={t('items.search')} placeholder={t('inspections.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
      </Group>
      <Group justify="flex-end">
        <Button variant="default" onClick={() => setSelected(new Set(rows.filter((r) => r.inspectionDueOn && r.inspectionDueOn <= soon).map((r) => r.id)))}>{t('inspections.selectDue')}</Button>
      </Group>
      <DataTable<Item>
        exportable={false}
        scroll
        rows={rows}
        rowKey={(i) => i.id}
        empty={isLoading ? t('loading') : t('inspections.noItems')}
        columns={[
          { key: 'select', header: '', width: 40, render: (i) => <Checkbox aria-label={i.inventoryNumber} checked={selected.has(i.id)} onChange={(e) => set(setSelected, i.id, e.currentTarget.checked)} /> },
          {
            key: 'number',
            header: t('items.inventoryNumber'),
            render: (i) => (
              <Group gap={4}>
                <Text fw={700} size="sm">{i.inventoryNumber}</Text>
                <BlockBadges item={{ blockedBy: i.blockedBy.filter((b) => b === 'inspection') }} />
              </Group>
            ),
          },
          { key: 'article', header: t('items.article'), render: (i) => `${articleName(i.articleKey)}${i.size ? ` · ${i.size}` : ''}` },
          { key: 'holder', header: t('items.holder'), render: (i) => personName(i.holderId) },
          { key: 'last', header: t('items.lastInspected'), render: (i) => formatDate(i.lastInspectedOn, i18n.language) },
          { key: 'due', header: t('items.inspectionDue'), render: (i) => <Due date={i.inspectionDueOn} /> },
          {
            key: 'result',
            header: t('inspections.result'),
            render: (i) => (
              <SegmentedControl
                size="xs"
                disabled={!selected.has(i.id)}
                aria-label={t('inspections.result')}
                value={failed.has(i.id) ? 'failed' : 'passed'}
                onChange={(v) => set(setFailed, i.id, v === 'failed')}
                color={failed.has(i.id) ? 'red' : undefined}
                data={[{ value: 'passed', label: t('inspections.passed') }, { value: 'failed', label: t('inspections.failed') }]}
              />
            ),
          },
          {
            key: 'notes',
            header: t('items.notes'),
            render: (i) => <TextInput size="xs" aria-label={t('items.notes')} disabled={!selected.has(i.id)} value={notes[i.id] ?? ''} onChange={(e) => { const value = e.currentTarget.value; setNotes((n) => ({ ...n, [i.id]: value })); }} />,
          },
        ]}
      />
      <ActionBar info={t('care.selected', { count: selected.size })}>
        <Button disabled={!selected.size || !date} loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('inspections.save')}</Button>
      </ActionBar>
    </Stack>
  );
}
