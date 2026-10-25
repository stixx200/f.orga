import { Button, Group, Select, SimpleGrid, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import type { Item, ItemInput } from '@forga/clothing-contracts';
import { can, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { CodeInput, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, MANAGE, useArticles, useDepartments } from '../api';

/** Records a new piece or corrects one. */
export function ItemDialog({ item, onClose, onSaved }: { item?: Item; onClose: () => void; onSaved?: (item: Item) => void }) {
  const { t } = useTranslation('clothing');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const session = useSession().data;
  const { data: articles = [] } = useArticles();
  const { data: departments = [] } = useDepartments();
  const writable = departments.filter((d) => can(session, MANAGE, d.id));
  const [form, setForm] = useState<Required<Omit<ItemInput, 'version'>>>(() => ({
    articleKey: item?.articleKey ?? '',
    inventoryNumber: item?.inventoryNumber ?? '',
    size: item?.size ?? '',
    serialNumber: item?.serialNumber ?? '',
    barcode: item?.barcode ?? '',
    rfid: item?.rfid ?? '',
    manufacturer: item?.manufacturer ?? '',
    purchasedOn: item?.purchasedOn ?? null,
    departmentId: item?.departmentId ?? (writable.length === 1 ? writable[0].id : ''),
    notes: item?.notes ?? '',
  }));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const article = articles.find((a) => a.key === form.articleKey);
  const save = useAction(
    () => (item ? send<Item>('PUT', `clothing/items/${item.id}`, { ...form, version: item.version }) : send<Item>('POST', 'clothing/items', form)),
    { success: t('items.saved'), invalidate: [keys.all], onSuccess: (saved) => { onSaved?.(saved); onClose(); } },
  );
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={item ? t('items.edit') : t('items.add')}
      size="lg"
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!form.articleKey || !form.inventoryNumber.trim() || !form.departmentId} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select
          label={t('items.article')}
          data={articles.filter((a) => a.kind === 'inventory' && (a.active || a.key === form.articleKey)).map((a) => ({ value: a.key, label: localized(a.name) }))}
          value={form.articleKey || null}
          onChange={(v) => set('articleKey', v ?? '')}
          disabled={Boolean(item)}
          required
          searchable
        />
        <TextInput label={t('items.inventoryNumber')} value={form.inventoryNumber} onChange={(e) => set('inventoryNumber', e.currentTarget.value)} required />
        {article?.sizes.length ? (
          <Select label={t('items.size')} data={article.sizes} value={form.size || null} onChange={(v) => set('size', v ?? '')} clearable />
        ) : (
          <TextInput label={t('items.size')} value={form.size} onChange={(e) => set('size', e.currentTarget.value)} />
        )}
        <Select label={t('items.department')} data={writable.map((d) => ({ value: d.id, label: d.name }))} value={form.departmentId || null} onChange={(v) => set('departmentId', v ?? '')} required />
        <TextInput label={t('items.manufacturer')} value={form.manufacturer} onChange={(e) => set('manufacturer', e.currentTarget.value)} />
        <TextInput label={t('items.serialNumber')} value={form.serialNumber} onChange={(e) => set('serialNumber', e.currentTarget.value)} />
        <CodeInput label={common('codes.barcode')} description={common('codes.barcodeHint')} value={form.barcode ?? ''} onChange={(v) => set('barcode', v)} source="camera" />
        <CodeInput label={common('codes.rfid')} description={common('codes.rfidHint')} value={form.rfid ?? ''} onChange={(v) => set('rfid', v)} source="nfc" />
        <DateInput label={t('items.purchasedOn')} description={t('items.purchasedOnHint')} value={form.purchasedOn} onChange={(v) => set('purchasedOn', v)} valueFormat="DD.MM.YYYY" clearable />
        <Textarea label={t('items.notes')} value={form.notes} onChange={(e) => set('notes', e.currentTarget.value)} autosize minRows={1} />
      </SimpleGrid>
    </ResponsiveDialog>
  );
}
