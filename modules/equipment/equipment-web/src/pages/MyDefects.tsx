import { Button, Group, Select, Stack, Text, Textarea } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Defect } from '@forga/equipment-contracts';
import { api, formatDate, send, useTranslation, withQuery } from '@forga/web-sdk';
import { DataTable, Panel, StatusBadge, useAction } from '@forga/web-ui';
import { keys } from '../api';
import { DefectPhotoInput, uploadDefectPhoto } from '../parts';

const OWN = ['equipment', 'me', 'defects'] as const;

/** "My area": report a defect by inventory number or name, and the own reports with their state. */
export function MyDefects() {
  const { t, i18n } = useTranslation('equipment');
  const [search, setSearch] = useState('');
  const [query] = useDebouncedValue(search, 250);
  const [itemId, setItemId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const { data: found = [] } = useQuery({ queryKey: ['equipment', 'me', 'items', query], queryFn: () => api<{ id: string; inventoryNumber: string; name: string }[]>(withQuery('equipment/me/items', { q: query })), enabled: query.trim().length >= 2 });
  const { data: own = [] } = useQuery({ queryKey: OWN, queryFn: () => api<Defect[]>('equipment/me/defects') });
  const report = useAction(async () => {
    const defect = await send<Defect>('POST', `equipment/items/${itemId}/defects`, { description });
    await uploadDefectPhoto(defect.id, photo);
  }, {
    success: t('defect.reported'),
    invalidate: [OWN, keys.all],
    onSuccess: () => {
      setItemId(null);
      setSearch('');
      setDescription('');
      setPhoto(null);
    },
  });
  return (
    <Panel title={t('me.title')}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{t('me.hint')}</Text>
        <Group align="end" grow>
          <Select
            label={t('me.item')}
            placeholder={t('me.search')}
            searchable
            searchValue={search}
            onSearchChange={setSearch}
            data={found.map((i) => ({ value: i.id, label: `${i.inventoryNumber} · ${i.name}` }))}
            value={itemId}
            onChange={setItemId}
            nothingFoundMessage={query.trim().length >= 2 ? t('me.notFound') : undefined}
            filter={({ options }) => options}
          />
        </Group>
        <Textarea label={t('defect.description')} value={description} onChange={(e) => setDescription(e.currentTarget.value)} autosize minRows={2} />
        <DefectPhotoInput value={photo} onChange={setPhoto} />
        <Group justify="flex-end">
          <Button loading={report.isPending} disabled={!itemId || !description.trim()} onClick={() => report.mutate(undefined)}>{t('defect.send')}</Button>
        </Group>
        {own.length > 0 && (
          <DataTable<Defect>
            rows={own}
            rowKey={(d) => d.id}
            columns={[
              { key: 'date', header: t('defect.reportedAt'), render: (d) => formatDate(d.reportedAt, i18n.language) },
              { key: 'item', header: t('me.item'), render: (d) => `${d.inventoryNumber} · ${d.itemName}` },
              { key: 'description', header: t('defect.description'), render: (d) => <><Text size="sm">{d.description}</Text>{d.resolution && <Text size="xs" c="dimmed">{d.resolution}</Text>}</> },
              { key: 'status', header: t('fields.status'), render: (d) => <StatusBadge tone={d.status === 'fixed' ? 'done' : d.status === 'retired' ? 'neutral' : 'warning'}>{t(`defectStatus.${d.status}`)}</StatusBadge> },
            ]}
          />
        )}
      </Stack>
    </Panel>
  );
}
