import { Button, Chip, Group, MultiSelect, Stack, Text, TextInput } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { Item } from '@forga/clothing-contracts';
import { can, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, PageHeader } from '@forga/web-ui';
import { MANAGE, useArticleName, useArticles, useItems, usePersonName } from '../api';
import { Due, ItemStatusBadge } from '../parts';
import { ItemDialog } from './ItemDialog';

type View = 'stock' | 'issued' | 'retired' | 'all';

/** Pieces of the clothing store with status, holder and the next washing and inspection. */
export function ItemsPage() {
  const { t } = useTranslation('clothing');
  const navigate = useNavigate();
  const localized = useLocalized();
  const session = useSession().data;
  const [view, setView] = useState<View>('stock');
  const [articleKeys, setArticleKeys] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const { data: articles = [] } = useArticles();
  const { data: all = [], isLoading } = useItems({ status: view === 'all' ? undefined : view, q: query.trim() || undefined });
  // Sizes of the pieces of the chosen articles, in natural order (44, 46 … and S, M, L).
  const sizeOptions = useMemo(() => {
    const order = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];
    const rank = (size: string) => (order.includes(size) ? order.indexOf(size) : 100);
    const present = new Set(all.filter((i) => !articleKeys.length || articleKeys.includes(i.articleKey)).map((i) => i.size).filter(Boolean));
    return [...present].toSorted((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'de', { numeric: true }));
  }, [all, articleKeys]);
  const items = all.filter((i) => (!articleKeys.length || articleKeys.includes(i.articleKey)) && (!sizes.length || sizes.includes(i.size)));
  const articleName = useArticleName();
  const personName = usePersonName();
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('items.title') }]}
        title={t('items.title')}
        subtitle={t('items.subtitle')}
        actions={can(session, MANAGE) && <Button onClick={() => setAdding(true)}>{t('items.add')}</Button>}
      />
      <Chip.Group value={view} onChange={(v) => setView(v as View)}>
        <Group gap="xs">{(['stock', 'issued', 'retired', 'all'] as const).map((v) => <Chip key={v} value={v} radius="xs">{t(`items.views.${v}`)}</Chip>)}</Group>
      </Chip.Group>
      <Group grow align="end">
        <TextInput type="search" label={t('items.search')} placeholder={t('items.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
        <MultiSelect
          label={t('items.article')}
          placeholder={articleKeys.length ? undefined : t('items.allArticles')}
          data={articles.filter((a) => a.kind === 'inventory').map((a) => ({ value: a.key, label: localized(a.name) }))}
          value={articleKeys}
          onChange={setArticleKeys}
          clearable
          searchable
        />
        <MultiSelect
          label={t('items.size')}
          placeholder={sizes.length ? undefined : t('items.allSizes')}
          data={sizeOptions}
          value={sizes}
          onChange={setSizes}
          clearable
          searchable
        />
      </Group>
      <DataTable<Item>
        rows={items}
        rowKey={(i) => i.id}
        onRowClick={(i) => navigate(`/clothing/items/${i.id}`)}
        empty={isLoading ? t('loading') : t('items.empty')}
        columns={[
          { key: 'number', header: t('items.inventoryNumber'), render: (i) => <Text fw={700} size="sm" c="brand">{i.inventoryNumber}</Text> },
          { key: 'article', header: t('items.article'), render: (i) => articleName(i.articleKey) },
          { key: 'size', header: t('items.size'), render: (i) => i.size },
          { key: 'status', header: t('items.status'), render: (i) => <ItemStatusBadge status={i.status} /> },
          { key: 'holder', header: t('items.holder'), render: (i) => personName(i.holderId) },
          { key: 'impregnation', header: t('items.impregnationDue'), render: (i) => <Due date={i.impregnationDueOn} /> },
          { key: 'inspection', header: t('items.inspectionDue'), render: (i) => <Due date={i.inspectionDueOn} /> },
        ]}
      />
      <Text size="xs" c="dimmed">{t('items.count', { count: items.length })}</Text>
      {adding && <ItemDialog onClose={() => setAdding(false)} onSaved={(item) => navigate(`/clothing/items/${item.id}`)} />}
    </Stack>
  );
}
