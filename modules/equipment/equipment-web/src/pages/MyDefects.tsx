import { Button, Group, Modal, Select, Stack, Text, Textarea } from '@mantine/core';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Defect, ReportableItem } from '@forga/equipment-contracts';
import { api, formatDate, send, useTranslation, withQuery } from '@forga/web-sdk';
import { CodeCamera, DataTable, Notice, Panel, signalScan, StatusBadge, useAction } from '@forga/web-ui';
import { keys } from '../api';
import { DefectPhotoInput, uploadDefectPhoto, useDefectText } from '../parts';

const OWN = ['equipment', 'me', 'defects'] as const;

const label = (i: ReportableItem) => [`${i.inventoryNumber} · ${i.name}`, i.place].filter(Boolean).join(' · ');

/**
 * "My area": report a defect by inventory number or name (with vehicle and loading place, so items of the same name
 * can be told apart) or by scanning the label or barcode, and the own reports with their state.
 */
export function MyDefects() {
  const { t, i18n } = useTranslation('equipment');
  const text = useDefectText();
  const [search, setSearch] = useState('');
  const [query] = useDebouncedValue(search, 250);
  const [itemId, setItemId] = useState<string | null>(null);
  const [scanned, setScanned] = useState<ReportableItem | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMiss, setScanMiss] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const { data: found = [] } = useQuery({ queryKey: ['equipment', 'me', 'items', query], queryFn: () => api<ReportableItem[]>(withQuery('equipment/me/items', { q: query })), enabled: query.trim().length >= 2 });
  const { data: own = [] } = useQuery({ queryKey: OWN, queryFn: () => api<Defect[]>('equipment/me/defects') });
  const options = [...(scanned && !found.some((i) => i.id === scanned.id) ? [scanned] : []), ...found];
  const report = useAction(async () => {
    const defect = await send<Defect>('POST', `equipment/items/${itemId}/defects`, { description });
    await uploadDefectPhoto(defect.id, photo);
  }, {
    success: t('defect.reported'),
    invalidate: [OWN, keys.all],
    onSuccess: () => {
      setItemId(null);
      setScanned(null);
      setSearch('');
      setDescription('');
      setPhoto(null);
    },
  });
  const onCode = async (code: string) => {
    const hits = await api<ReportableItem[]>(withQuery('equipment/me/items', { code })).catch((): ReportableItem[] => []);
    signalScan(hits.length === 1);
    setScanning(false);
    if (hits.length !== 1) {
      setScanMiss(code);
      return;
    }
    setScanMiss(null);
    setScanned(hits[0]);
    setItemId(hits[0].id);
  };
  return (
    <Panel title={t('me.title')}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{t('me.hint')}</Text>
        <Group align="end" wrap="nowrap">
          <Select
            style={{ flex: 1 }}
            label={t('me.item')}
            placeholder={t('me.search')}
            searchable
            searchValue={search}
            onSearchChange={setSearch}
            data={options.map((i) => ({ value: i.id, label: label(i) }))}
            value={itemId}
            onChange={setItemId}
            nothingFoundMessage={query.trim().length >= 2 ? t('me.notFound') : undefined}
            filter={({ options: all }) => all}
          />
          <Button variant="default" onClick={() => setScanning(true)}>{t('me.scan')}</Button>
        </Group>
        {scanMiss && <Notice kind="warning">{t('me.scanNotFound', { code: scanMiss })}</Notice>}
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
              { key: 'description', header: t('defect.description'), render: (d) => <><Text size="sm">{text(d)}</Text>{d.resolution && <Text size="xs" c="dimmed">{d.resolution}</Text>}</> },
              { key: 'status', header: t('fields.status'), render: (d) => <StatusBadge tone={d.status === 'fixed' ? 'done' : d.status === 'retired' || d.status === 'withdrawn' ? 'neutral' : 'warning'}>{t(`defectStatus.${d.status}`)}</StatusBadge> },
            ]}
          />
        )}
      </Stack>
      {scanning && (
        <Modal opened onClose={() => setScanning(false)} title={t('me.scanTitle')} size="lg">
          <CodeCamera onCode={(code) => void onCode(code)} />
        </Modal>
      )}
    </Panel>
  );
}
