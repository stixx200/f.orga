import { Button, Group, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useMediaQuery } from '@mantine/hooks';
import { useState } from 'react';
import type { Inspection, InspectionInput, Item } from '@forga/equipment-contracts';
import { localDate, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { Notice, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, usePersons } from '../api';
import { InspectionResultField, ProtocolInput, uploadInspectionProtocol } from '../parts';

/** The day after an ISO date (earliest next due date). */
const dayAfter = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/**
 * Records an inspection of an item with checklist, or corrects a recorded one (`inspection`, with reason).
 * "Failed" marks the item as defective and leaves the inspection due.
 */
export function InspectionDialog({ item, inspectionKey, inspection, onClose }: { item: Item; inspectionKey?: string; inspection?: Inspection; onClose: () => void }) {
  const { t } = useTranslation('equipment');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const phone = useMediaQuery('(max-width: 48em)');
  const { data: persons = [] } = usePersons();
  const today = localDate();
  const [form, setForm] = useState<Required<InspectionInput>>(() => ({
    inspectionKey: inspection?.inspectionKey ?? inspectionKey ?? item.dues.find((d) => d.overdue)?.key ?? item.inspections[0]?.key ?? '',
    date: inspection?.date ?? today,
    inspectorPersonId: inspection?.inspectorPersonId ?? null,
    inspectorCompany: inspection?.inspectorCompany ?? '',
    result: inspection?.result ?? 'passed',
    checklist: [],
    measurements: inspection?.measurements ?? '',
    nextDueOn: inspection?.nextDueOn ?? null,
    notes: inspection?.notes ?? '',
  }));
  const [reason, setReason] = useState('');
  const [protocol, setProtocol] = useState<File | null>(null);
  const type = item.inspections.find((x) => x.key === form.inspectionKey);
  const [points, setPoints] = useState<Record<string, 'ok' | 'not-ok'>>(() => Object.fromEntries((inspection?.checklist ?? []).map((c) => [c.point, c.state === 'not-ok' ? 'not-ok' : 'ok'])));
  const failed = form.result === 'failed';
  const body = { ...form, nextDueOn: failed ? null : form.nextDueOn, checklist: (type?.checklist ?? []).map((point) => ({ point, state: points[point] ?? 'ok', value: '' })) };
  const save = useAction(
    async () => {
      if (inspection) {
        const { inspectionKey: _key, ...correction } = body;
        return send('PUT', `equipment/inspections/${inspection.id}`, { ...correction, reason });
      }
      const created = await send<Inspection>('POST', `equipment/items/${item.id}/inspections`, body);
      await uploadInspectionProtocol(created.id, protocol);
      return created;
    },
    { success: t(inspection ? 'inspection.corrected' : 'inspection.saved'), invalidate: [keys.all], onSuccess: onClose },
  );
  const invalidDates = form.date > today || (!failed && form.nextDueOn !== null && form.nextDueOn <= form.date);
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={inspection ? t('inspection.correct') : t('inspection.record')}
      size="lg"
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={!form.inspectionKey || invalidDates || (Boolean(inspection) && reason.trim().length < 3)} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select label={t('inspection.type')} data={item.inspections.map((x) => ({ value: x.key, label: localized(x.name) }))} value={form.inspectionKey || null} onChange={(v) => setForm({ ...form, inspectionKey: v ?? '' })} allowDeselect={false} disabled={Boolean(inspection)} />
          <DateInput label={t('inspection.date')} value={form.date} onChange={(v) => v && setForm({ ...form, date: v })} valueFormat="DD.MM.YYYY" minDate={item.purchasedOn ?? '1900-01-01'} maxDate={today} />
          <Select label={t('inspection.inspector')} description={type ? t(`inspector.${type.inspector}`) : undefined} data={persons.filter((p) => p.status !== 'left').map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}` }))} value={form.inspectorPersonId} onChange={(v) => setForm({ ...form, inspectorPersonId: v })} searchable clearable />
          <TextInput label={t('inspection.company')} value={form.inspectorCompany} onChange={(e) => setForm({ ...form, inspectorCompany: e.currentTarget.value })} />
        </SimpleGrid>
        {(type?.checklist ?? []).length > 0 && (
          <Stack gap={6}>
            <Text size="sm" fw={700}>{t('inspection.checklist')}</Text>
            {type!.checklist.map((point) => {
              const data = [{ value: 'ok', label: t('inspection.ok') }, { value: 'not-ok', label: t('inspection.notOk') }];
              const value = points[point] ?? 'ok';
              const onChange = (next: string | null) => next && setPoints({ ...points, [point]: next as 'ok' | 'not-ok' });
              return phone ? (
                <Select key={point} label={point} data={data} value={value} onChange={onChange} allowDeselect={false} />
              ) : (
                <Group key={point} justify="space-between">
                  <Text size="sm">{point}</Text>
                  <SegmentedControl size="xs" value={value} onChange={onChange} data={data} />
                </Group>
              );
            })}
          </Stack>
        )}
        <InspectionResultField value={form.result} onChange={(result) => setForm({ ...form, result })} />
        {form.result !== 'passed' && <Notice kind="warning">{t(failed ? 'inspection.failedHint' : 'inspection.withDefectsHint')}</Notice>}
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label={t('inspection.measurements')} value={form.measurements} onChange={(e) => setForm({ ...form, measurements: e.currentTarget.value })} />
          {!failed && <DateInput label={t('inspection.nextDue')} description={t('inspection.nextDueHint')} value={form.nextDueOn} onChange={(v) => setForm({ ...form, nextDueOn: v })} valueFormat="DD.MM.YYYY" minDate={dayAfter(form.date)} clearable />}
        </SimpleGrid>
        <Textarea label={t('inspection.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} autosize minRows={2} />
        {!inspection && <ProtocolInput value={protocol} onChange={setProtocol} />}
        {inspection && <TextInput label={t('inspection.reason')} description={t('inspection.correctHint')} value={reason} onChange={(e) => setReason(e.currentTarget.value)} required />}
      </Stack>
    </ResponsiveDialog>
  );
}
