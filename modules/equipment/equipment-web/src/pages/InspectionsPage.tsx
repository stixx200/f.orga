import { Button, Checkbox, Group, SegmentedControl, Select, Stack, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Due, InspectionResult, Item } from '@forga/equipment-contracts';
import { apiUrl, formatDate, localDate, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { ActionBar, DataTable, PageHeader, Panel, useAction } from '@forga/web-ui';
import { keys, useDepartments, useItems, usePlace } from '../api';
import { DueDate } from '../parts';
import { matchesCode, ScanDialog, scannedCode } from './ScanDialog';

type Row = { item: Item; due: Due };

/** Inspections due, and the bulk inspection of many items of the same inspection type. */
export function InspectionsPage() {
  const { t, i18n } = useTranslation('equipment');
  const localized = useLocalized();
  const navigate = useNavigate();
  const place = usePlace();
  const { data: departments = [] } = useDepartments();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(() => localDate(new Date(Date.now() + 30 * 86_400_000)));
  const { data: items = [], isLoading } = useItems({ departmentId: departmentId ?? undefined, dueBefore: until ?? undefined });
  const rows: Row[] = items.flatMap((item) => item.dues.filter((d) => d.dueOn && (!until || d.dueOn <= until)).map((due) => ({ item, due }))).toSorted((a, b) => String(a.due.dueOn).localeCompare(String(b.due.dueOn)));
  const kinds = [...new Map(rows.map((r) => [r.due.key, r.due])).values()];
  const [kind, setKind] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(() => localDate());
  const [result, setResult] = useState<InspectionResult>('passed');
  const [company, setCompany] = useState('');
  const visible = kind ? rows.filter((r) => r.due.key === kind) : rows;
  const save = useAction(() => send<{ recorded: number }>('POST', 'equipment/inspections/bulk', { itemIds: selected, inspectionKey: kind, date, result, inspectorCompany: company }), {
    invalidate: [keys.all],
    onSuccess: (r) => {
      setSelected([]);
      return r;
    },
    success: t('bulk.saved'),
  });
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const [scanning, setScanning] = useState(false);
  // A scanned label selects the item if the chosen inspection is due for it.
  const onScan = (text: string) => {
    const code = scannedCode(text);
    const row = visible.find((r) => matchesCode(r.item, code));
    if (!row) return t('scan.notDue', { code: code.code ?? text });
    if (selected.includes(row.item.id)) return t('scan.already', { item: `${row.item.inventoryNumber} · ${row.item.name}` });
    setSelected((s) => [...s, row.item.id]);
    return t('scan.selected', { item: `${row.item.inventoryNumber} · ${row.item.name}`, count: selected.length + 1 });
  };

  return (
    <Stack gap="lg" pb={80}>
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('bulk.title') }]}
        title={t('bulk.title')}
        subtitle={t('bulk.subtitle')}
        actions={<Button component="a" href={apiUrl('core/lists/equipment.inspection-report/export/pdf', { departmentId: departmentId ?? undefined, lang: i18n.language })} target="_blank" variant="default">{t('protocol.today')}</Button>}
      />
      <Group align="end">
        <DateInput label={t('bulk.until')} value={until} onChange={setUntil} valueFormat="DD.MM.YYYY" clearable />
        <Select label={t('fields.department')} placeholder={t('items.all')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} clearable />
        <Select label={t('inspection.type')} placeholder={t('items.all')} data={kinds.map((k) => ({ value: k.key, label: localized(k.name) }))} value={kind} onChange={(v) => { setKind(v); setSelected([]); }} clearable />
      </Group>
      {kind && (
        <Panel title={t('bulk.record')}>
          <Group align="end">
            <DateInput label={t('inspection.date')} value={date} onChange={setDate} valueFormat="DD.MM.YYYY" />
            <TextInput label={t('inspection.company')} value={company} onChange={(e) => setCompany(e.currentTarget.value)} />
            <SegmentedControl value={result} onChange={(v) => setResult(v as InspectionResult)} data={(['passed', 'passed-with-defects', 'failed'] as const).map((r) => ({ value: r, label: t(`result.${r}`) }))} />
          </Group>
        </Panel>
      )}
      <DataTable<Row>
        rows={visible}
        rowKey={(r) => `${r.item.id}:${r.due.key}`}
        empty={isLoading ? t('loading') : t('bulk.empty')}
        columns={[
          ...(kind ? [{ key: 'select', header: '', width: 40, render: (r: Row) => <Checkbox aria-label={r.item.inventoryNumber} checked={selected.includes(r.item.id)} onChange={(e) => toggle(r.item.id, e.currentTarget.checked)} /> }] : []),
          { key: 'due', header: t('inspection.due'), render: (r) => <DueDate dueOn={r.due.dueOn} /> },
          { key: 'type', header: t('inspection.type'), render: (r) => localized(r.due.name) },
          { key: 'item', header: t('fields.name'), render: (r) => <Text size="sm" fw={700} c="brand" style={{ cursor: 'pointer' }} onClick={() => navigate(`/equipment/items/${r.item.id}`)}>{r.item.inventoryNumber} · {r.item.name}</Text> },
          { key: 'place', header: t('fields.place'), render: (r) => place(r.item) },
          { key: 'last', header: t('inspection.last'), render: (r) => formatDate(r.due.lastDate, i18n.language) },
        ]}
      />
      {kind && (
        <ActionBar info={t('bulk.selected', { count: selected.length })}>
          <Button variant="default" onClick={() => setScanning(true)}>{t('scan.open')}</Button>
          <Button variant="default" onClick={() => setSelected(visible.map((r) => r.item.id))}>{t('bulk.selectAll')}</Button>
          <Button loading={save.isPending} disabled={!selected.length || !date} onClick={() => save.mutate(undefined)}>{t('bulk.save')}</Button>
        </ActionBar>
      )}
      {scanning && <ScanDialog onScan={onScan} onClose={() => setScanning(false)} />}
    </Stack>
  );
}
