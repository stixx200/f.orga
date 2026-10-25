import { Group, Select, Text } from '@mantine/core';
import { useState } from 'react';
import type { Item } from '@forga/compensation-contracts';
import { formatDate, formatMoney, useTranslation } from '@forga/web-sdk';
import { DataTable, Panel } from '@forga/web-ui';
import { usePersonItems } from '../api';
import { Amount, ItemLabel } from '../parts';

/** Tab "Entschädigung" in the person file (extension point `masterdata.person.tab`). */
export function PersonTab({ personId }: { personId?: unknown }) {
  const { t, i18n } = useTranslation('compensation');
  const [thisYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState(String(thisYear));
  const { data = [], isLoading } = usePersonItems(String(personId), Number(year));
  const total = data.reduce((s, i) => s + (i.amount ?? 0), 0);
  return (
    <Panel
      title={t('person.title', { year })}
      aside={
        <Group gap="md">
          <Text size="sm" fw={700}>{t('person.total', { total: formatMoney(total, i18n.language) })}</Text>
          <Select aria-label={t('functions.yearLabel')} w={100} size="xs" data={[0, 1, 2, 3].map((n) => String(thisYear - n))} value={year} onChange={(v) => v && setYear(v)} allowDeselect={false} />
        </Group>
      }
    >
      <DataTable<Item>
        rows={data}
        rowKey={(i) => i.id}
        empty={isLoading ? t('loading') : t('person.empty')}
        columns={[
          { key: 'date', header: t('items.date'), render: (i) => formatDate(i.date, i18n.language) },
          { key: 'label', header: t('items.label'), render: (i) => <ItemLabel item={i} /> },
          { key: 'hours', header: t('items.hours'), align: 'right', render: (i) => i.hours ?? '' },
          { key: 'amount', header: t('items.amount'), align: 'right', render: (i) => <Amount item={i} /> },
          { key: 'status', header: t('person.status'), render: (i) => (i.runId ? t('person.inRun') : t('person.open')) },
        ]}
      />
    </Panel>
  );
}
