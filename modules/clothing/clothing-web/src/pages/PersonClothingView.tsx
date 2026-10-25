import { Group, Stack, Text } from '@mantine/core';
import { Link } from 'react-router';
import type { IssueRecord, Item, PersonClothing } from '@forga/clothing-contracts';
import { formatDate, useTranslation } from '@forga/web-sdk';
import { DataTable, Panel } from '@forga/web-ui';
import { useArticleName, usePersons } from '../api';
import { BlockBadges, CancelButton, Cancelled, Due, useMayCancel } from '../parts';

/**
 * Pieces a person holds and the history of issues and returns (person file, issue page, "my area"). With `links`
 * (not in "my area") the pieces link to their page and wrong entries can be cancelled.
 */
export function PersonClothingView({ data, personId, links = true }: { data: PersonClothing; personId?: string; links?: boolean }) {
  const { t, i18n } = useTranslation('clothing');
  const articleName = useArticleName();
  const mayCancel = useMayCancel();
  const { data: persons = [] } = usePersons();
  const personDepartments = persons.find((p) => p.id === (personId ?? data.history[0]?.personId))?.departmentIds ?? [];
  // The newest entry per held piece: only it can be cancelled (cancelling the issue puts the piece back).
  const latest = new Set(data.items.map((i) => data.history.find((h) => h.itemId === i.id && !h.cancelledAt)?.id));
  const departments = (h: IssueRecord) => (h.itemId ? data.items.filter((i) => i.id === h.itemId).map((i) => i.departmentId) : personDepartments);
  const cancellable = (h: IssueRecord) => links && (!h.itemId || latest.has(h.id)) && mayCancel(h, departments(h));
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
            { key: 'article', header: t('items.article'), render: (i) => <Group gap={4}>{articleName(i.articleKey)}<BlockBadges item={i} /></Group> },
            { key: 'size', header: t('items.size'), render: (i) => i.size },
            { key: 'issuedOn', header: t('items.issuedOn'), render: (i) => formatDate(i.issuedOn, i18n.language) },
            { key: 'impregnation', header: t('items.impregnationDue'), render: (i) => <Due date={i.impregnationDueOn} /> },
            { key: 'inspection', header: t('items.inspectionDue'), render: (i) => <Due date={i.inspectionDueOn} /> },
          ]}
        />
      </Panel>
      <Panel title={t('history.title')}>
        <DataTable<IssueRecord>
          rows={data.history}
          rowKey={(h) => h.id}
          empty={t('history.empty')}
          columns={[
            { key: 'date', header: t('care.date'), render: (h) => <Cancelled entry={h}>{formatDate(h.date, i18n.language)}</Cancelled> },
            { key: 'kind', header: t('history.kind'), render: (h) => <HistoryKind record={h} /> },
            { key: 'article', header: t('items.article'), render: (h) => articleName(h.articleKey) },
            { key: 'number', header: t('items.inventoryNumber'), render: (h) => h.inventoryNumber ?? '' },
            { key: 'size', header: t('items.size'), render: (h) => h.size },
            { key: 'quantity', header: t('history.quantity'), align: 'right', render: (h) => h.quantity },
            { key: 'by', header: t('items.recordedBy'), render: (h) => h.recordedBy },
            ...(links ? [{ key: 'cancel', header: '', export: false, render: (h: IssueRecord) => cancellable(h) && <CancelButton path={`clothing/issues/${h.id}`} /> }] : []),
          ]}
        />
      </Panel>
    </Stack>
  );
}

/** "issued", "taken back", with "retired" or "to wash" for returns. */
export function HistoryKind({ record }: { record: IssueRecord }) {
  const { t } = useTranslation('clothing');
  const extra = record.kind === 'return' && (record.retire ? t('history.returnKinds.retire') : record.laundry ? t('history.returnKinds.laundry') : null);
  return <>{t(`history.kinds.${record.kind}`)}{extra ? ` (${extra})` : ''}</>;
}
