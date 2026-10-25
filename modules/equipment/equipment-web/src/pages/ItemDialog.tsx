import { Button, Group, NumberInput, Select, SimpleGrid, Stack, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Item, ItemInput } from '@forga/equipment-contracts';
import { can, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { CodeInput, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, useCategories, useDepartments, useStations, useTypes, useVehicles, WRITE } from '../api';

type Form = Required<Omit<ItemInput, 'inspections' | 'version'>>;

const fromItem = (item?: Item): Form => ({
  inventoryNumber: item?.inventoryNumber ?? '',
  name: item?.name ?? '',
  typeKey: item?.typeKey ?? null,
  categoryKey: item?.categoryKey ?? '',
  serialNumber: item?.serialNumber ?? '',
  barcode: item?.barcode ?? '',
  rfid: item?.rfid ?? '',
  manufacturer: item?.manufacturer ?? '',
  yearBuilt: item?.yearBuilt ?? null,
  purchasedOn: item?.purchasedOn ?? null,
  price: item?.price ?? null,
  properties: item?.properties ?? {},
  departmentId: item?.departmentId ?? '',
  vehicleId: item?.vehicleId ?? null,
  stationId: item?.stationId ?? null,
  loadingPlace: item?.loadingPlace ?? '',
  quantity: item?.quantity ?? 1,
  expiresOn: item?.expiresOn ?? null,
  notes: item?.notes ?? '',
});

/** Create or edit an item; a type fills category, manufacturer and inspections. */
export function ItemDialog({ item, onClose }: { item?: Item; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const navigate = useNavigate();
  const session = useSession().data;
  const { data: categories = [] } = useCategories();
  const { data: types = [] } = useTypes();
  const { data: departments = [] } = useDepartments();
  const { data: vehicles = [] } = useVehicles();
  const { data: stations = [] } = useStations();
  const [form, setForm] = useState<Form>(() => fromItem(item));
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }));
  const type = types.find((x) => x.key === form.typeKey);
  const writable = departments.filter((d) => can(session, WRITE, d.id));
  const departmentId = form.departmentId || (writable.length === 1 ? writable[0].id : '');
  const stock = categories.find((c) => c.key === form.categoryKey)?.tracking === 'stock';
  const save = useAction(
    () => {
      const body = { ...form, departmentId, ...(item ? { version: item.version } : {}), ...(item?.ownInspections ? { inspections: item.inspections } : {}) };
      return item ? send<Item>('PUT', `equipment/items/${item.id}`, body) : send<Item>('POST', 'equipment/items', body);
    },
    { success: t('item.saved'), invalidate: [keys.all], onSuccess: (saved) => { onClose(); if (!item) navigate(`/equipment/items/${saved.id}`); } },
  );
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={item ? t('item.edit') : t('item.new')}
      size="xl"
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!form.inventoryNumber || !form.name || !form.categoryKey || !departmentId} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label={t('fields.type')}
            data={types.map((x) => ({ value: x.key, label: localized(x.name) }))}
            value={form.typeKey}
            onChange={(v) => {
              const chosen = types.find((x) => x.key === v);
              setForm((f) => ({ ...f, typeKey: v, categoryKey: chosen?.categoryKey ?? f.categoryKey, name: f.name || (chosen ? localized(chosen.name) : ''), manufacturer: f.manufacturer || chosen?.manufacturer || '' }));
            }}
            searchable
            clearable
          />
          <Select label={t('fields.category')} data={categories.map((c) => ({ value: c.key, label: localized(c.name) }))} value={form.categoryKey || null} onChange={(v) => set('categoryKey', v ?? '')} required />
          <TextInput label={t('fields.inventoryNumber')} value={form.inventoryNumber} onChange={(e) => set('inventoryNumber', e.currentTarget.value)} required />
          <TextInput label={t('fields.name')} value={form.name} onChange={(e) => set('name', e.currentTarget.value)} required />
          <TextInput label={t('fields.serialNumber')} value={form.serialNumber} onChange={(e) => set('serialNumber', e.currentTarget.value)} />
          <CodeInput label={common('codes.barcode')} description={common('codes.barcodeHint')} value={form.barcode ?? ''} onChange={(v) => set('barcode', v)} source="camera" />
          <CodeInput label={common('codes.rfid')} description={common('codes.rfidHint')} value={form.rfid ?? ''} onChange={(v) => set('rfid', v)} source="nfc" />
          <TextInput label={t('fields.manufacturer')} value={form.manufacturer} onChange={(e) => set('manufacturer', e.currentTarget.value)} />
          <NumberInput label={t('fields.yearBuilt')} value={form.yearBuilt ?? ''} onChange={(v) => set('yearBuilt', v === '' ? null : Number(v))} min={1900} max={2100} />
          <DateInput label={t('fields.purchasedOn')} value={form.purchasedOn} onChange={(v) => set('purchasedOn', v)} valueFormat="DD.MM.YYYY" clearable />
          <NumberInput label={t('fields.price')} value={form.price ?? ''} onChange={(v) => set('price', v === '' ? null : Number(v))} min={0} decimalScale={2} suffix=" €" />
          <DateInput label={t('fields.expiresOn')} value={form.expiresOn} onChange={(v) => set('expiresOn', v)} valueFormat="DD.MM.YYYY" clearable />
          <Select label={t('fields.department')} data={writable.map((d) => ({ value: d.id, label: d.name }))} value={departmentId || null} onChange={(v) => set('departmentId', v ?? '')} required />
          <Select label={t('fields.vehicle')} data={vehicles.filter((v) => !departmentId || v.departmentId === departmentId).map((v) => ({ value: v.id, label: v.radioCallSign || v.designation }))} value={form.vehicleId} onChange={(v) => setForm((f) => ({ ...f, vehicleId: v, stationId: v ? null : f.stationId }))} clearable />
          <Select label={t('fields.station')} data={stations.filter((s) => !departmentId || s.departmentId === departmentId).map((s) => ({ value: s.id, label: s.name }))} value={form.stationId} onChange={(v) => setForm((f) => ({ ...f, stationId: v, vehicleId: v ? null : f.vehicleId }))} clearable disabled={Boolean(form.vehicleId)} />
          <TextInput label={t('fields.loadingPlace')} value={form.loadingPlace} onChange={(e) => set('loadingPlace', e.currentTarget.value)} />
          {stock && <NumberInput label={t('fields.quantity')} value={form.quantity} onChange={(v) => set('quantity', Number(v) || 0)} min={0} />}
          {(type?.properties ?? []).map((name) => (
            <TextInput key={name} label={name} value={form.properties[name] ?? ''} onChange={(e) => set('properties', { ...form.properties, [name]: e.currentTarget.value })} />
          ))}
        </SimpleGrid>
        <Textarea label={t('fields.notes')} value={form.notes} onChange={(e) => set('notes', e.currentTarget.value)} autosize minRows={2} />
      </Stack>
    </ResponsiveDialog>
  );
}
