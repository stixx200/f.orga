import { Button, Group, NumberInput, Select, SimpleGrid, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { InitialInspection, Item, ItemInput } from '@forga/equipment-contracts';
import { vehicleLabel } from '@forga/masterdata-contracts';
import { can, localDate, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { CodeInput, ResponsiveDialog, treeOptions, useAction } from '@forga/web-ui';
import { BREATHING_WRITE, keys, useCategories, useDepartments, useStations, useTypes, useVehicles, WRITE } from '../api';
import { LocationField } from '../parts';

type Form = Required<Omit<ItemInput, 'inspections' | 'version' | 'initialInspections'>>;

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
  location: item?.location ?? '',
  quantity: item?.quantity ?? 1,
  expiresOn: item?.expiresOn ?? null,
  intervalOverrides: item?.intervalOverrides ?? {},
  notes: item?.notes ?? '',
});

/**
 * Create or edit an item; a type fills category, manufacturer and inspections. Per inspection type an own interval
 * (e.g. a vehicle below 3.5 t) and, when creating, the last inspection done before.
 */
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
  // Breathing apparatus officers (`equipment.breathing.write` only) create and edit items of breathing apparatus categories.
  const breathing = (key: string) => Boolean(categories.find((c) => c.key === key)?.breathingApparatus);
  const general = (departmentId: string) => can(session, WRITE, departmentId);
  const writable = departments.filter((d) => general(d.id) || (breathing(form.categoryKey) && can(session, BREATHING_WRITE, d.id)));
  const allowedCategories = categories.filter((c) => c.breathingApparatus || departments.some((d) => general(d.id)));
  const allowedTypes = types.filter((x) => allowedCategories.some((c) => c.key === x.categoryKey));
  const departmentId = form.departmentId || (writable.length === 1 ? writable[0].id : '');
  const stock = categories.find((c) => c.key === form.categoryKey)?.tracking === 'stock';
  const stationOptions = stations
    .map((s) => {
      const shortName = departments.find((d) => d.id === s.departmentId)?.shortName;
      return { id: s.id, label: shortName ? `${s.name} (${shortName})` : s.name };
    })
    .toSorted((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base' }));
  const [initial, setInitial] = useState<Record<string, { date: string | null; nextDueOn: string | null }>>({});
  // Inspection types of the item: own ones, else those of the type (with the type's intervals).
  const inspections = item?.ownInspections ? item.inspections : (type?.inspections ?? []);
  const typeInterval = (key: string) => (item?.ownInspections ? undefined : type?.inspections.find((x) => x.key === key)?.intervalMonths) ?? null;
  const initialInspections: InitialInspection[] = Object.entries(initial).flatMap(([inspectionKey, v]) => (v.date ? [{ inspectionKey, date: v.date, nextDueOn: v.nextDueOn }] : []));
  const overrides = Object.fromEntries(Object.entries(form.intervalOverrides).filter(([key]) => inspections.some((x) => x.key === key)));
  const save = useAction(
    () => {
      const body = {
        ...form,
        intervalOverrides: overrides,
        departmentId,
        ...(item ? { version: item.version } : { initialInspections }),
        ...(item?.ownInspections ? { inspections: item.inspections } : {}),
      };
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
        <SimpleGrid cols={{ base: 1, sm: 2 }} style={{ alignItems: 'end' }}>
          <Select
            label={t('fields.type')}
            data={allowedTypes.map((x) => ({ value: x.key, label: localized(x.name) }))}
            value={form.typeKey}
            onChange={(v) => {
              const chosen = types.find((x) => x.key === v);
              setForm((f) => ({ ...f, typeKey: v, categoryKey: chosen?.categoryKey ?? f.categoryKey, name: f.name || (chosen ? localized(chosen.name) : ''), manufacturer: f.manufacturer || chosen?.manufacturer || '' }));
            }}
            searchable
            clearable
          />
          <Select label={t('fields.category')} data={treeOptions(categories, (c) => localized(c.name), { include: (c) => allowedCategories.some((a) => a.key === c.key) })} value={form.categoryKey || null} onChange={(v) => set('categoryKey', v ?? '')} required searchable />
          <TextInput label={t('fields.inventoryNumber')} value={form.inventoryNumber} onChange={(e) => set('inventoryNumber', e.currentTarget.value)} required />
          <TextInput label={t('fields.name')} value={form.name} onChange={(e) => set('name', e.currentTarget.value)} required />
          <TextInput label={t('fields.serialNumber')} value={form.serialNumber} onChange={(e) => set('serialNumber', e.currentTarget.value)} />
          <CodeInput label={common('codes.barcode')} description={common('codes.barcodeHint')} value={form.barcode ?? ''} onChange={(v) => set('barcode', v)} source="camera" />
          <CodeInput label={common('codes.rfid')} description={common('codes.rfidHint')} value={form.rfid ?? ''} onChange={(v) => set('rfid', v)} source="nfc" />
          <TextInput label={t('fields.manufacturer')} value={form.manufacturer} onChange={(e) => set('manufacturer', e.currentTarget.value)} />
          <NumberInput label={t('fields.yearBuilt')} value={form.yearBuilt ?? ''} onChange={(v) => set('yearBuilt', v === '' ? null : Number(v))} min={1900} max={2100} />
          <DateInput label={t('fields.purchasedOn')} value={form.purchasedOn} onChange={(v) => set('purchasedOn', v)} valueFormat="DD.MM.YYYY" minDate="1900-01-01" maxDate={localDate()} clearable />
          <NumberInput label={t('fields.price')} value={form.price ?? ''} onChange={(v) => set('price', v === '' ? null : Number(v))} min={0} decimalScale={2} suffix=" €" />
          <DateInput label={t('fields.expiresOn')} value={form.expiresOn} onChange={(v) => set('expiresOn', v)} valueFormat="DD.MM.YYYY" clearable />
          <Select label={t('fields.department')} data={writable.map((d) => ({ value: d.id, label: d.name }))} value={departmentId || null} onChange={(v) => set('departmentId', v ?? '')} required />
          <LocationField
            stationId={form.stationId}
            location={form.location}
            stations={stationOptions}
            onChange={({ stationId, location }) => setForm((f) => ({ ...f, stationId, location, vehicleId: stationId ? null : f.vehicleId }))}
          />
          <Select
            label={t('fields.vehicle')}
            data={vehicles.map((v) => ({ value: v.id, label: vehicleLabel(v, departments.find((d) => d.id === v.departmentId)?.shortName) }))}
            searchable
            value={form.vehicleId}
            onChange={(v) => setForm((f) => ({ ...f, vehicleId: v, stationId: v ? null : f.stationId, location: v ? '' : f.location }))}
            clearable
          />
          <TextInput label={t('fields.loadingPlace')} value={form.loadingPlace} onChange={(e) => set('loadingPlace', e.currentTarget.value)} />
          {stock && <NumberInput label={t('fields.quantity')} value={form.quantity} onChange={(v) => set('quantity', Number(v) || 0)} min={0} />}
          {(type?.properties ?? []).map((name) => (
            <TextInput key={name} label={name} value={form.properties[name] ?? ''} onChange={(e) => set('properties', { ...form.properties, [name]: e.currentTarget.value })} />
          ))}
        </SimpleGrid>
        {inspections.length > 0 && (
          <Stack gap={4}>
            <Text size="sm" fw={700}>{t('item.inspections')}</Text>
            <Text size="xs" c="dimmed">{item ? t('item.inspectionsHintEdit') : t('item.inspectionsHint')}</Text>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('inspection.type')}</Table.Th>
                  <Table.Th>{t('item.ownInterval')}</Table.Th>
                  {!item && <Table.Th>{t('item.lastInspection')}</Table.Th>}
                  {!item && <Table.Th>{t('inspection.nextDue')}</Table.Th>}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {inspections.map((x) => (
                  <Table.Tr key={x.key}>
                    <Table.Td><Text size="sm">{localized(x.name)}</Text></Table.Td>
                    <Table.Td>
                      {x.intervalMonths !== null || form.intervalOverrides[x.key] ? (
                        <NumberInput
                          aria-label={t('item.ownInterval')}
                          w={110}
                          min={1}
                          max={240}
                          placeholder={typeInterval(x.key) ? t('inspection.months', { count: typeInterval(x.key)! }) : undefined}
                          value={form.intervalOverrides[x.key] ?? ''}
                          onChange={(v) => {
                            const { [x.key]: _old, ...rest } = form.intervalOverrides;
                            set('intervalOverrides', v === '' ? rest : { ...rest, [x.key]: Number(v) });
                          }}
                        />
                      ) : (
                        <Text size="sm" c="dimmed">{t(`trigger.${x.trigger}`)}</Text>
                      )}
                    </Table.Td>
                    {!item && (
                      <Table.Td>
                        <DateInput aria-label={t('item.lastInspection')} w={140} value={initial[x.key]?.date ?? null} minDate={form.purchasedOn ?? '1900-01-01'} maxDate={localDate()} onChange={(v) => setInitial({ ...initial, [x.key]: { date: v, nextDueOn: initial[x.key]?.nextDueOn ?? null } })} valueFormat="DD.MM.YYYY" clearable />
                      </Table.Td>
                    )}
                    {!item && (
                      <Table.Td>
                        <DateInput aria-label={t('inspection.nextDue')} w={140} value={initial[x.key]?.nextDueOn ?? null} disabled={!initial[x.key]?.date} placeholder={t('inspection.nextDueHint')} onChange={(v) => setInitial({ ...initial, [x.key]: { date: initial[x.key]?.date ?? null, nextDueOn: v } })} valueFormat="DD.MM.YYYY" clearable />
                      </Table.Td>
                    )}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Stack>
        )}
        <Textarea label={t('fields.notes')} value={form.notes} onChange={(e) => set('notes', e.currentTarget.value)} autosize minRows={2} />
      </Stack>
    </ResponsiveDialog>
  );
}
