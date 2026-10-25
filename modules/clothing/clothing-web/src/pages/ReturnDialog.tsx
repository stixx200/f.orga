import { Button, Checkbox, Group, SegmentedControl, Stack, Text, Textarea } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import type { Item } from '@forga/clothing-contracts';
import { localDate, send, useTranslation } from '@forga/web-sdk';
import { DataTable, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, useArticleName, useArticles } from '../api';

type Disposition = 'stock' | 'laundry' | 'retire';

/**
 * Takes back pieces a person holds, each into stock, to the laundry (only issued again after a recorded washing) or
 * out of use. `all` preselects every piece ("take back everything").
 */
export function ReturnDialog({ items, all = false, onClose }: { items: Item[]; all?: boolean; onClose: () => void }) {
  const { t } = useTranslation('clothing');
  const { t: common } = useTranslation('common');
  const articleName = useArticleName();
  const { data: articles = [] } = useArticles();
  const textile = new Set(articles.filter((a) => a.textile).map((a) => a.key));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(all ? items.map((i) => i.id) : []));
  const [dispositions, setDispositions] = useState<Record<string, Disposition>>({});
  const [date, setDate] = useState<string | null>(() => localDate());
  const [notes, setNotes] = useState('');
  const chosen = items.filter((i) => selected.has(i.id));
  const save = useAction(
    () =>
      send('POST', 'clothing/return', {
        date,
        notes,
        items: chosen.map((i) => ({ itemId: i.id, retire: dispositions[i.id] === 'retire', laundry: dispositions[i.id] === 'laundry' })),
      }),
    { success: t('returns.done', { count: chosen.length }), invalidate: [keys.all], onSuccess: onClose },
  );
  const toggle = (id: string, on: boolean) => setSelected((s) => { const next = new Set(s); if (on) next.add(id); else next.delete(id); return next; });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('returns.title')}
      size="xl"
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button disabled={!chosen.length || !date} loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('returns.save', { count: chosen.length })}</Button>
        </Group>
      }
    >
      <Stack gap="sm">
        <DataTable<Item>
          exportable={false}
          rows={items}
          rowKey={(i) => i.id}
          empty={t('person.nothingHeld')}
          columns={[
            {
              key: 'select',
              header: '',
              width: 40,
              render: (i) => <Checkbox aria-label={i.inventoryNumber} checked={selected.has(i.id)} onChange={(e) => toggle(i.id, e.currentTarget.checked)} />,
            },
            { key: 'number', header: t('items.inventoryNumber'), render: (i) => <Text fw={700} size="sm">{i.inventoryNumber}</Text> },
            { key: 'article', header: t('items.article'), render: (i) => `${articleName(i.articleKey)}${i.size ? ` · ${i.size}` : ''}` },
            {
              key: 'disposition',
              header: t('returns.disposition'),
              render: (i) => (
                <SegmentedControl
                  size="xs"
                  disabled={!selected.has(i.id)}
                  value={dispositions[i.id] ?? 'stock'}
                  onChange={(v) => setDispositions((d) => ({ ...d, [i.id]: v as Disposition }))}
                  data={(['stock', 'laundry', 'retire'] as const)
                    .filter((d) => d !== 'laundry' || textile.has(i.articleKey))
                    .map((d) => ({ value: d, label: t(`returns.dispositions.${d}`) }))}
                />
              ),
            },
          ]}
        />
        <Text size="xs" c="dimmed">{t('returns.hint')}</Text>
        <DateInput label={t('items.returnedOn')} value={date} onChange={setDate} maxDate={localDate()} valueFormat="DD.MM.YYYY" required />
        <Textarea label={t('items.notes')} value={notes} onChange={(e) => setNotes(e.currentTarget.value)} autosize minRows={1} />
      </Stack>
    </ResponsiveDialog>
  );
}
