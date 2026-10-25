import { Button, Chip, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
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
  const [view, setView] = useState<View>('all');
  const [articleKey, setArticleKey] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const { data: articles = [] } = useArticles();
  const { data: items = [], isLoading } = useItems({ status: view === 'all' ? undefined : view, articleKey: articleKey ?? undefined, q: query.trim() || undefined });
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
        <Group gap="xs">{(['all', 'stock', 'issued', 'retired'] as const).map((v) => <Chip key={v} value={v} radius="xs">{t(`items.views.${v}`)}</Chip>)}</Group>
      </Chip.Group>
      <Group grow align="end">
        <TextInput type="search" label={t('items.search')} placeholder={t('items.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
        <Select label={t('items.article')} placeholder={t('items.allArticles')} data={articles.filter((a) => a.kind === 'inventory').map((a) => ({ value: a.key, label: localized(a.name) }))} value={articleKey} onChange={setArticleKey} clearable />
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
