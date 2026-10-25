import { Button, Checkbox, Group, SegmentedControl, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useMemo, useState } from 'react';
import type { CareKind, Item } from '@forga/clothing-contracts';
import { formatDate, localDate, send, useTranslation } from '@forga/web-sdk';
import { ActionBar, DataTable, PageHeader, Panel, useAction } from '@forga/web-ui';
import { keys, useArticleName, useArticles, useItems, usePersonName } from '../api';
import { Due } from '../parts';

/**
 * Washing and impregnation of many textile pieces at once, e.g. after collecting them from the laundry.
 * Impregnating always includes washing.
 */
export function CarePage() {
  const { t, i18n } = useTranslation('clothing');
  const { data: articles = [] } = useArticles();
  const { data: items = [], isLoading } = useItems({});
  const articleName = useArticleName();
  const personName = usePersonName();
  const [kind, setKind] = useState<CareKind>('wash');
  const [date, setDate] = useState<string | null>(() => localDate());
  const [place, setPlace] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const textile = useMemo(() => new Set(articles.filter((a) => a.textile).map((a) => a.key)), [articles]);
  const [soon] = useState(() => localDate(new Date(Date.now() + 30 * 86_400_000)));
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter((i) => textile.has(i.articleKey))
      .filter((i) => !q || [i.inventoryNumber, personName(i.holderId), articleName(i.articleKey)].some((v) => v.toLowerCase().includes(q)))
      .toSorted((a, b) => String(a.impregnationDueOn ?? '9').localeCompare(String(b.impregnationDueOn ?? '9')));
  }, [items, query, textile, personName, articleName]);
  const toggle = (id: string, on: boolean) => setSelected((s) => { const next = new Set(s); if (on) next.add(id); else next.delete(id); return next; });
  const save = useAction(() => send('POST', 'clothing/care', { itemIds: [...selected], kind, date, place }), {
    success: t('care.saved', { count: selected.size }),
    invalidate: [keys.all],
    onSuccess: () => setSelected(new Set()),
  });

  return (
    <Stack gap="lg" pb={80}>
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('care.page') }]} title={t('care.page')} subtitle={t('care.subtitle')} />
      <Panel>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <Stack gap={4}>
            <Text size="sm" fw={500}>{t('care.kind')}</Text>
            <SegmentedControl value={kind} onChange={(v) => setKind(v as CareKind)} data={(['wash', 'impregnation'] as const).map((k) => ({ value: k, label: t(`care.kinds.${k}`) }))} />
            <Text size="xs" c="dimmed">{t('care.impregnationHint')}</Text>
          </Stack>
          <DateInput label={t('care.date')} value={date} onChange={setDate} valueFormat="DD.MM.YYYY" required />
          <TextInput label={t('care.place')} description={t('care.placeHint')} value={place} onChange={(e) => setPlace(e.currentTarget.value)} />
        </SimpleGrid>
      </Panel>
      <Group align="end">
        <TextInput type="search" label={t('items.search')} placeholder={t('care.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} style={{ flex: 1 }} />
        <Button variant="default" onClick={() => setSelected(new Set(rows.filter((r) => r.impregnationDueOn && r.impregnationDueOn <= soon).map((r) => r.id)))}>{t('care.selectDue')}</Button>
      </Group>
      <DataTable<Item>
        exportable={false}
        rows={rows}
        rowKey={(i) => i.id}
        empty={isLoading ? t('loading') : t('care.noTextiles')}
        columns={[
          { key: 'select', header: '', width: 40, render: (i) => <Checkbox aria-label={i.inventoryNumber} checked={selected.has(i.id)} onChange={(e) => toggle(i.id, e.currentTarget.checked)} /> },
          { key: 'number', header: t('items.inventoryNumber'), render: (i) => <Text fw={700} size="sm">{i.inventoryNumber}</Text> },
          { key: 'article', header: t('items.article'), render: (i) => articleName(i.articleKey) },
          { key: 'holder', header: t('items.holder'), render: (i) => personName(i.holderId) },
          { key: 'washed', header: t('items.lastWashed'), render: (i) => formatDate(i.lastWashedOn, i18n.language) },
          { key: 'impregnated', header: t('items.lastImpregnated'), render: (i) => formatDate(i.lastImpregnatedOn, i18n.language) },
          { key: 'due', header: t('items.impregnationDue'), render: (i) => <Due date={i.impregnationDueOn} /> },
        ]}
      />
      <ActionBar info={t('care.selected', { count: selected.size })}>
        <Button disabled={!selected.size || !date} loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('care.save')}</Button>
      </ActionBar>
    </Stack>
  );
}
