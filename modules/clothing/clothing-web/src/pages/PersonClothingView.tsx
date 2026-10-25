import { Stack, Text } from '@mantine/core';
import { Link } from 'react-router';
import type { IssueRecord, Item, PersonClothing } from '@forga/clothing-contracts';
import { formatDate, useTranslation } from '@forga/web-sdk';
import { DataTable, Panel } from '@forga/web-ui';
import { useArticleName } from '../api';
import { Due } from '../parts';

/** Pieces a person holds and the history of issues and returns (person file, issue page, "my area"). */
export function PersonClothingView({ data, links = true }: { data: PersonClothing; links?: boolean }) {
  const { t, i18n } = useTranslation('clothing');
  const articleName = useArticleName();
  return (
    <Stack gap="lg">
      <Panel title={t('person.held')}>
        <DataTable<Item>
          rows={data.items}
          rowKey={(i) => i.id}
          empty={t('person.nothingHeld')}
          columns={[
            {
              key: 'number',
              header: t('items.inventoryNumber'),
              render: (i) => (links ? <Text component={Link} to={`/clothing/items/${i.id}`} size="sm" fw={700} c="brand">{i.inventoryNumber}</Text> : i.inventoryNumber),
            },
            { key: 'article', header: t('items.article'), render: (i) => articleName(i.articleKey) },
            { key: 'size', header: t('items.size'), render: (i) => i.size },
            { key: 'issuedOn', header: t('items.issuedOn'), render: (i) => formatDate(i.issuedOn, i18n.language) },
            { key: 'impregnation', header: t('items.impregnationDue'), render: (i) => <Due date={i.impregnationDueOn} /> },
          ]}
        />
      </Panel>
      <Panel title={t('history.title')}>
        <DataTable<IssueRecord>
          rows={data.history}
          rowKey={(h) => h.id}
          empty={t('history.empty')}
          columns={[
            { key: 'date', header: t('care.date'), render: (h) => formatDate(h.date, i18n.language) },
            { key: 'kind', header: t('history.kind'), render: (h) => t(`history.kinds.${h.kind}`) },
            { key: 'article', header: t('items.article'), render: (h) => articleName(h.articleKey) },
            { key: 'number', header: t('items.inventoryNumber'), render: (h) => h.inventoryNumber ?? '' },
            { key: 'size', header: t('items.size'), render: (h) => h.size },
            { key: 'quantity', header: t('history.quantity'), align: 'right', render: (h) => h.quantity },
            { key: 'by', header: t('items.recordedBy'), render: (h) => h.recordedBy },
          ]}
        />
      </Panel>
    </Stack>
  );
}
