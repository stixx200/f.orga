import { Button, Group, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import type { InspectionInput, InspectionResult, Item } from '@forga/equipment-contracts';
import { localDate, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, usePersons } from '../api';

/** Records an inspection of an item with checklist; "failed" marks the item as defective. */
export function InspectionDialog({ item, inspectionKey, onClose }: { item: Item; inspectionKey?: string; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: persons = [] } = usePersons();
  const [form, setForm] = useState<Required<InspectionInput>>(() => ({
    inspectionKey: inspectionKey ?? item.dues.find((d) => d.overdue)?.key ?? item.inspections[0]?.key ?? '',
    date: localDate(),
    inspectorPersonId: null,
    inspectorCompany: '',
    result: 'passed',
    checklist: [],
    measurements: '',
    nextDueOn: null,
    notes: '',
  }));
  const type = item.inspections.find((x) => x.key === form.inspectionKey);
  const [points, setPoints] = useState<Record<string, 'ok' | 'not-ok'>>({});
  const save = useAction(
    () => send('POST', `equipment/items/${item.id}/inspections`, { ...form, checklist: (type?.checklist ?? []).map((point) => ({ point, state: points[point] ?? 'ok', value: '' })) }),
    { success: t('inspection.saved'), invalidate: [keys.all], onSuccess: onClose },
  );
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('inspection.record')}
      size="lg"
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!form.inspectionKey} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t('inspection.type')} data={item.inspections.map((x) => ({ value: x.key, label: localized(x.name) }))} value={form.inspectionKey || null} onChange={(v) => setForm({ ...form, inspectionKey: v ?? '' })} allowDeselect={false} />
          <DateInput label={t('inspection.date')} value={form.date} onChange={(v) => v && setForm({ ...form, date: v })} valueFormat="DD.MM.YYYY" />
          <Select label={t('inspection.inspector')} description={type ? t(`inspector.${type.inspector}`) : undefined} data={persons.filter((p) => p.status !== 'left').map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}` }))} value={form.inspectorPersonId} onChange={(v) => setForm({ ...form, inspectorPersonId: v })} searchable clearable />
          <TextInput label={t('inspection.company')} value={form.inspectorCompany} onChange={(e) => setForm({ ...form, inspectorCompany: e.currentTarget.value })} />
        </SimpleGrid>
        {(type?.checklist ?? []).length > 0 && (
          <Stack gap={6}>
            <Text size="sm" fw={700}>{t('inspection.checklist')}</Text>
            {type!.checklist.map((point) => (
              <Group key={point} justify="space-between">
                <Text size="sm">{point}</Text>
                <SegmentedControl size="xs" value={points[point] ?? 'ok'} onChange={(v) => setPoints({ ...points, [point]: v as 'ok' | 'not-ok' })} data={[{ value: 'ok', label: t('inspection.ok') }, { value: 'not-ok', label: t('inspection.notOk') }]} />
              </Group>
            ))}
          </Stack>
        )}
        <SegmentedControl fullWidth value={form.result} onChange={(v) => setForm({ ...form, result: v as InspectionResult })} data={(['passed', 'passed-with-defects', 'failed'] as const).map((r) => ({ value: r, label: t(`result.${r}`) }))} />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label={t('inspection.measurements')} value={form.measurements} onChange={(e) => setForm({ ...form, measurements: e.currentTarget.value })} />
          <DateInput label={t('inspection.nextDue')} description={t('inspection.nextDueHint')} value={form.nextDueOn} onChange={(v) => setForm({ ...form, nextDueOn: v })} valueFormat="DD.MM.YYYY" clearable />
        </SimpleGrid>
        <Textarea label={t('inspection.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} autosize minRows={2} />
      </Stack>
    </ResponsiveDialog>
  );
}
