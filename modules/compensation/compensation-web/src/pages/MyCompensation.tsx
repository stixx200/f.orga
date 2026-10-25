import { Group, Select, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { MyCompensation as Mine } from '@forga/compensation-contracts';

type Item = Mine['items'][number];
import { api, formatDate, formatMoney, withQuery, useTranslation } from '@forga/web-sdk';
import { DataTable, Panel } from '@forga/web-ui';
import { keys } from '../api';
import { Amount, ItemLabel } from '../parts';

/** "Mein Bereich": own compensation of a year, open and paid out (extension point `core.me.sections`). */
export function MyCompensation() {
  const { t, i18n } = useTranslation('compensation');
  const [thisYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState(String(thisYear));
  const { data, isLoading } = useQuery({ queryKey: [...keys.all, 'me', year], queryFn: () => api<Mine>(withQuery('compensation/me', { year })) });
  return (
    <Panel
      title={t('my.title')}
      aside={
        <Group gap="md">
          {data && <Text size="sm">{t('my.totals', { open: formatMoney(data.open, i18n.language), paid: formatMoney(data.paid, i18n.language) })}</Text>}
          <Select aria-label={t('functions.yearLabel')} w={100} size="xs" data={[0, 1, 2, 3].map((n) => String(thisYear - n))} value={year} onChange={(v) => v && setYear(v)} allowDeselect={false} />
        </Group>
      }
    >
      <DataTable<Item>
        rows={data?.items ?? []}
        rowKey={(i) => i.id}
        exportable={false}
        empty={isLoading ? t('loading') : t('my.empty')}
        columns={[
          { key: 'date', header: t('items.date'), render: (i) => formatDate(i.date, i18n.language) },
          { key: 'label', header: t('items.label'), render: (i) => <ItemLabel item={i} /> },
          { key: 'amount', header: t('items.amount'), align: 'right', render: (i) => <Amount item={i} /> },
          { key: 'status', header: t('person.status'), render: (i) => t(i.paidOut ? 'my.paid' : 'my.open') },
        ]}
      />
    </Panel>
  );
}
