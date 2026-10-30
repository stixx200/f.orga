import { Button, Checkbox, Group, SegmentedControl, Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Due, InspectionResult, InspectionType, Item } from '@forga/equipment-contracts';
import { apiUrl, formatDate, localDate, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ActionBar, DataTable, PageHeader, Panel, useAction } from '@forga/web-ui';
import { keys, useDepartments, useDueSoon, useItemAccess, useItems, usePersons, usePlace } from '../api';
import { DueDate } from '../parts';
import { matchesCode, ScanDialog, scannedCode } from './ScanDialog';

type Row = { item: Item; due: Due };

const label = (item: Item) => `${item.inventoryNumber} · ${item.name}`;

/**
 * Inspections due, and the bulk inspection of many items of the same inspection type. With a chosen inspection type,
 * every item having it can be added (also when not due), by scan or search; for inspections after use or washing
 * a scan can also make the item due ("washed").
 */
export function InspectionsPage() {
  const { t, i18n } = useTranslation('equipment');
  const localized = useLocalized();
  const navigate = useNavigate();
  const place = usePlace();
  const access = useItemAccess();
  const session = useSession().data;
  const { soon } = useDueSoon();
  const { data: departments = [] } = useDepartments();
  const { data: persons = [] } = usePersons();
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [until, setUntil] = useState<string | null>(soon);
  const { data: items = [], isLoading } = useItems({ departmentId: departmentId ?? undefined });
  const rows: Row[] = items.flatMap((item) => item.dues.filter((d) => d.dueOn && (!until || d.dueOn <= until)).map((due) => ({ item, due }))).toSorted((a, b) => String(a.due.dueOn).localeCompare(String(b.due.dueOn)));
  // All inspection types of the visible items, not only the due ones.
  const kinds = [...new Map(items.flatMap((i) => i.inspections).map((x) => [x.key, x])).values()].toSorted((a, b) => localized(a.name).localeCompare(localized(b.name)));
  const [kind, setKind] = useState<string | null>(null);
  const kindType: InspectionType | undefined = kinds.find((k) => k.key === kind);
  const [selected, setSelected] = useState<string[]>([]);
  const [date, setDate] = useState<string | null>(() => localDate());
  const [result, setResult] = useState<InspectionResult>('passed');
  const [company, setCompany] = useState('');
  const [inspector, setInspector] = useState<string | null>(() => session?.user.personId ?? null);
  const [washed, setWashed] = useState(false);
  // Items that have the chosen inspection type and may be inspected by the user.
  const candidates = kind ? items.filter((i) => i.inspections.some((x) => x.key === kind) && access.canInspect(i)) : [];
  const dueOf = (item: Item): Due => item.dues.find((d) => d.key === kind)!;
  const visible: Row[] = kind
    ? [...rows.filter((r) => r.due.key === kind), ...candidates.filter((i) => selected.includes(i.id) && !rows.some((r) => r.item.id === i.id && r.due.key === kind)).map((item) => ({ item, due: dueOf(item) }))]
    : rows;
  const save = useAction(
    () => send<{ recorded: number }>('POST', 'equipment/inspections/bulk', { itemIds: selected, inspectionKey: kind, date, result, inspectorCompany: company, inspectorPersonId: inspector }),
    {
      invalidate: [keys.all],
      onSuccess: (r) => {
        setSelected([]);
        return r;
      },
      success: t('bulk.saved'),
    },
  );
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const select = (item: Item) => setSelected((s) => (s.includes(item.id) ? s : [...s, item.id]));
  const [scanning, setScanning] = useState(false);
  const afterTrigger = kindType && kindType.trigger !== 'periodic';

  // A scanned label selects an item that has the chosen inspection type, due or not; "washed" also makes it due.
  const onScan = async (text: string): Promise<{ message: string; ok: boolean }> => {
    const code = scannedCode(text);
    const item = candidates.find((i) => matchesCode(i, code));
    if (!item) return { message: t('scan.unknown', { code: code.code ?? text }), ok: false };
    if (selected.includes(item.id)) return { message: t('scan.already', { item: label(item) }), ok: false };
    if (washed && afterTrigger) await send('POST', `equipment/items/${item.id}/trigger`, { inspectionKey: kind });
    select(item);
    const due = Boolean(dueOf(item).dueOn) || (washed && afterTrigger);
    return { message: t(due ? 'scan.selected' : 'scan.selectedNotDue', { item: label(item), count: selected.length + 1 }), ok: true };
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
        <Select
          label={t('inspection.type')}
          placeholder={t('items.all')}
          data={kinds.map((k) => ({ value: k.key, label: localized(k.name) }))}
          value={kind}
          onChange={(v) => {
            setKind(v);
            setSelected([]);
            setWashed(false);
          }}
          searchable
          clearable
        />
      </Group>
      {kind && access.inspectsAnything && (
        <Panel title={t('bulk.record')}>
          <Stack gap="sm">
            <Group align="end">
              <DateInput label={t('inspection.date')} value={date} onChange={setDate} valueFormat="DD.MM.YYYY" maxDate={localDate()} />
              <Select
                label={t('inspection.inspector')}
                description={kindType ? t(`inspector.${kindType.inspector}`) : undefined}
                data={persons.filter((p) => p.status !== 'left').map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}` }))}
                value={inspector}
                onChange={setInspector}
                searchable
                clearable
              />
              <TextInput label={t('inspection.company')} value={company} onChange={(e) => setCompany(e.currentTarget.value)} />
              <SegmentedControl value={result} onChange={(v) => setResult(v as InspectionResult)} data={(['passed', 'passed-with-defects', 'failed'] as const).map((r) => ({ value: r, label: t(`result.${r}`) }))} />
            </Group>
            <Group align="end">
              <Select
                label={t('bulk.add')}
                placeholder={t('bulk.addPlaceholder')}
                data={candidates.filter((i) => !selected.includes(i.id)).map((i) => ({ value: i.id, label: label(i) }))}
                value={null}
                onChange={(id) => {
                  const item = candidates.find((i) => i.id === id);
                  if (item) select(item);
                }}
                searchable
                w={320}
              />
              {afterTrigger && <Switch label={t('bulk.washed', { trigger: t(`trigger.${kindType.trigger}`) })} description={t('bulk.washedHint')} checked={washed} onChange={(e) => setWashed(e.currentTarget.checked)} />}
            </Group>
          </Stack>
        </Panel>
      )}
      <DataTable<Row>
        scroll
        rows={visible}
        rowKey={(r) => `${r.item.id}:${r.due.key}`}
        empty={isLoading ? t('loading') : t('bulk.empty')}
        columns={[
          ...(kind && access.inspectsAnything
            ? [{ key: 'select', header: '', width: 40, render: (r: Row) => access.canInspect(r.item) && <Checkbox aria-label={r.item.inventoryNumber} checked={selected.includes(r.item.id)} onChange={(e) => toggle(r.item.id, e.currentTarget.checked)} /> }]
            : []),
          { key: 'due', header: t('inspection.due'), render: (r) => <DueDate dueOn={r.due.dueOn} /> },
          { key: 'type', header: t('inspection.type'), render: (r) => localized(r.due.name) },
          { key: 'item', header: t('fields.name'), render: (r) => <Text size="sm" fw={700} c="brand" style={{ cursor: 'pointer' }} onClick={() => navigate(`/equipment/items/${r.item.id}?tab=inspections`)}>{label(r.item)}</Text> },
          { key: 'place', header: t('fields.place'), render: (r) => place(r.item) },
          { key: 'last', header: t('inspection.last'), render: (r) => formatDate(r.due.lastDate, i18n.language) },
        ]}
      />
      {kind && access.inspectsAnything && (
        <ActionBar info={t('bulk.selected', { count: selected.length })}>
          <Button variant="default" onClick={() => setScanning(true)}>{t('scan.open')}</Button>
          <Button variant="default" onClick={() => setSelected([...new Set(visible.filter((r) => access.canInspect(r.item)).map((r) => r.item.id))])}>{t('bulk.selectAll')}</Button>
          <Button loading={save.isPending} disabled={!selected.length || !date} onClick={() => save.mutate(undefined)}>{t('bulk.save')}</Button>
        </ActionBar>
      )}
      {scanning && <ScanDialog onScan={onScan} onClose={() => setScanning(false)} />}
    </Stack>
  );
}
