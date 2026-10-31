import { Button, Checkbox, Chip, Group, Select, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { notifications } from '@mantine/notifications';
import { IconSearch } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import type { BulkInspectionResult, Category, InspectionResult, InspectionType, Item } from '@forga/equipment-contracts';
import { vehicleLabel } from '@forga/masterdata-contracts';
import { formatDate, localDate, send, upload, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ActionBar, DataTable, HeaderCheckbox, matchesSearch, PageHeader, Panel, useAction } from '@forga/web-ui';
import { keys, useCategories, useCategoryName, useDepartments, useDueSoon, useItemAccess, useItems, usePersons, usePlace, useRecentCategories, useStations, useVehicles } from '../api';
import { DueDate, InspectionResultField, LocationField, ProtocolInput, ScanField } from '../parts';
import { matchesCode, scannedCode } from './ScanDialog';

const label = (item: Item) => `${item.inventoryNumber} · ${item.name}`;
const placeKey = (item: Pick<Item, 'vehicleId' | 'stationId'>) => (item.vehicleId ? `v:${item.vehicleId}` : item.stationId ? `s:${item.stationId}` : 'none');

/** The category with all its subcategories. */
function withSubcategories(categories: Category[], key: string): Set<string> {
  const found = new Set([key]);
  for (let grown = true; grown; ) {
    grown = false;
    for (const c of categories) {
      if (c.parentKey && found.has(c.parentKey) && !found.has(c.key)) {
        found.add(c.key);
        grown = true;
      }
    }
  }
  return found;
}

/**
 * Bulk booking: choose the kind of equipment, tick or scan any of its items, then optionally record one
 * inspection all selected items share, mark such an inspection due, and move them to another place.
 */
export function BulkPage() {
  const { t, i18n } = useTranslation('equipment');
  const localized = useLocalized();
  const navigate = useNavigate();
  const place = usePlace();
  const categoryName = useCategoryName();
  const access = useItemAccess();
  const session = useSession().data;
  const { soon } = useDueSoon();
  const { data: categories = [] } = useCategories();
  const { data: recent } = useRecentCategories();
  const { data: departments = [] } = useDepartments();
  const { data: stations = [] } = useStations();
  const { data: vehicles = [] } = useVehicles();
  const { data: persons = [] } = usePersons();
  const [categoryKey, setCategoryKey] = useState<string | null>(null);
  const { data: items = [], isLoading } = useItems({}, Boolean(categoryKey));
  const [query, setQuery] = useState('');
  const [dueOnly, setDueOnly] = useState(false);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [location, setLocation] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [kind, setKind] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(() => localDate());
  const [result, setResult] = useState<InspectionResult>('passed');
  const [company, setCompany] = useState('');
  const [inspector, setInspector] = useState<string | null>(() => session?.user.personId ?? null);
  const [setDue, setSetDue] = useState(false);
  const [placeOn, setPlaceOn] = useState(false);
  const [targetStation, setTargetStation] = useState<string | null>(null);
  const [targetVehicle, setTargetVehicle] = useState<string | null>(null);
  const [targetLocation, setTargetLocation] = useState('');
  const [targetLoading, setTargetLoading] = useState('');
  const [protocol, setProtocol] = useState<File | null>(null);

  // Every item of the kind the user may book (inspect, mark due or move), not only the due ones.
  const candidates = useMemo(() => {
    if (!categoryKey) return [];
    const kinds = withSubcategories(categories, categoryKey);
    return items.filter((i) => kinds.has(i.categoryKey) && (access.canInspect(i) || access.canTrigger(i) || access.canWrite(i))).toSorted((a, b) => String(a.nextDue ?? '9').localeCompare(String(b.nextDue ?? '9')) || a.inventoryNumber.localeCompare(b.inventoryNumber));
  }, [items, categories, categoryKey, access]);
  const due = (item: Item) => Boolean(item.nextDue && item.nextDue <= soon);
  const locations = [...new Map(candidates.map((i) => [placeKey(i), place(i) || t('bulk.noPlace')])).entries()].toSorted((a, b) => a[1].localeCompare(b[1], i18n.language));
  // Selected rows stay visible even when the filter would hide them.
  const rows = candidates.filter(
    (i) =>
      selected.includes(i.id) ||
      ((!dueOnly || due(i)) &&
        (!departmentId || i.departmentId === departmentId) &&
        (!location || placeKey(i) === location) &&
        matchesSearch([i.inventoryNumber, i.name, i.barcode, i.serialNumber, place(i)], query.trim().toLowerCase())),
  );
  const chosen = candidates.filter((i) => selected.includes(i.id));
  // Only inspection types every selected item has.
  const shared: InspectionType[] = chosen.length
    ? chosen[0].inspections.filter((x) => chosen.every((i) => i.inspections.some((y) => y.key === x.key)))
    : [...new Map(candidates.flatMap((i) => i.inspections).map((x) => [x.key, x])).values()];
  const kinds = shared
    .filter((k) => access.recordsAnything || k.trigger !== 'periodic')
    .toSorted((a, b) => localized(a.name).localeCompare(localized(b.name)));
  const kindType = kinds.find((k) => k.key === kind);
  const afterTrigger = Boolean(kindType && kindType.trigger !== 'periodic');
  const dueMode = afterTrigger && (setDue || !access.recordsAnything);
  const stationOptions = stations
    .map((s) => {
      const shortName = departments.find((d) => d.id === s.departmentId)?.shortName;
      return { id: s.id, label: shortName ? `${s.name} (${shortName})` : s.name };
    })
    .toSorted((a, b) => a.label.localeCompare(b.label, i18n.language));

  const save = useAction(
    async () => {
      const recorded = await send<BulkInspectionResult>('POST', 'equipment/inspections/bulk', {
        itemIds: selected,
        categoryKey,
        inspection: kind && !dueMode ? { inspectionKey: kind, date, result, inspectorCompany: company, inspectorPersonId: inspector } : undefined,
        triggerKey: kind && dueMode ? kind : undefined,
        place: placeOn ? { stationId: targetStation, vehicleId: targetVehicle, location: targetLocation, loadingPlace: targetLoading } : undefined,
      });
      if (protocol && !dueMode) await Promise.all(recorded.ids.map((id) => upload(`core/attachments?type=equipment.inspection&id=${id}`, protocol)));
      return recorded;
    },
    {
      invalidate: [keys.all],
      onSuccess: (r) => {
        setSelected([]);
        setProtocol(null);
        return r;
      },
      success: t('bulk.saved'),
    },
  );
  const toggle = (id: string, on: boolean) => setSelected((s) => (on ? [...s, id] : s.filter((x) => x !== id)));
  const shownIds = rows.map((i) => i.id);
  const shownSelected = shownIds.filter((id) => selected.includes(id)).length;
  const allShown = shownIds.length > 0 && shownSelected === shownIds.length;
  const setShown = (on: boolean) => setSelected(on ? [...new Set([...selected, ...shownIds])] : selected.filter((id) => !shownIds.includes(id)));
  const chooseCategory = (value: string | null) => {
    setCategoryKey(value);
    setSelected([]);
    setKind(null);
    setSetDue(false);
    setLocation(null);
  };
  const recentKeys = (recent?.categoryKeys ?? []).filter((key) => categories.some((c) => c.key === key));

  const scan = async (text: string) => {
    const code = scannedCode(text);
    const item = candidates.find((i) => matchesCode(i, code));
    if (!item) {
      const other = items.find((i) => matchesCode(i, code));
      notifications.show({ color: 'orange', message: other ? t('bulk.otherKind', { item: label(other) }) : t('bulk.unknown', { code: code.code ?? text }) });
      return;
    }
    if (dueMode && kind && item.inspections.some((x) => x.key === kind)) await send('POST', `equipment/items/${item.id}/trigger`, { inspectionKey: kind });
    setSelected((s) => (s.includes(item.id) ? s : [...s, item.id]));
  };

  return (
    <Stack gap="lg" pb={80}>
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('bulk.title') }]} title={t('bulk.title')} subtitle={t('bulk.subtitle')} />
      <Group align="end">
        <Select
          label={t('bulk.category')}
          placeholder={t('bulk.categoryPlaceholder')}
          data={categories.map((c) => ({ value: c.key, label: c.parentKey ? `${categoryName(c.parentKey)} › ${localized(c.name)}` : localized(c.name) }))}
          value={categoryKey}
          onChange={chooseCategory}
          searchable
          clearable
          w={280}
        />
        {recentKeys.map((key) => (
          <Chip key={key} checked={categoryKey === key} onChange={() => { if (key !== categoryKey) chooseCategory(key); }}>{categoryName(key)}</Chip>
        ))}
      </Group>
      {categoryKey && (access.recordsAnything || access.canTrigger({ departmentId: '', categoryKey: '' }) || candidates.some((i) => access.canTrigger(i))) && (
        <Panel title={t('bulk.record')}>
          <Stack gap="sm">
            {!access.recordsAnything && <Text size="sm" c="dimmed">{t('bulk.dueOnlyMode')}</Text>}
            <Group align="end">
              <Select
                label={t('inspection.type')}
                description={chosen.length ? t('bulk.sharedTypes') : undefined}
                data={kinds.map((k) => ({ value: k.key, label: localized(k.name) }))}
                value={kinds.some((k) => k.key === kind) ? kind : null}
                onChange={(v) => {
                  setKind(v);
                  setSetDue(false);
                }}
                clearable
                w={260}
              />
              {access.recordsAnything && !dueMode && (
                <>
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
                </>
              )}
              {access.recordsAnything && !dueMode && <InspectionResultField value={result} onChange={setResult} />}
              {afterTrigger && (
                <Switch
                  label={t('bulk.washed', { trigger: t(`trigger.${kindType!.trigger}`) })}
                  description={t('bulk.washedHint')}
                  checked={dueMode}
                  disabled={!access.recordsAnything}
                  onChange={(e) => setSetDue(e.currentTarget.checked)}
                  mb={8}
                />
              )}
            </Group>
            {access.recordsAnything && !dueMode && <ProtocolInput value={protocol} onChange={setProtocol} />}
          </Stack>
        </Panel>
      )}
      {categoryKey && access.movesAnything && (
        <Panel title={t('bulk.placeTitle')}>
          <Stack gap="sm">
            <Switch label={t('bulk.placeOn')} checked={placeOn} onChange={(e) => setPlaceOn(e.currentTarget.checked)} />
            {placeOn && (
              <SimpleGrid cols={{ base: 1, sm: 3 }} style={{ alignItems: 'end' }}>
                <LocationField
                  stationId={targetStation}
                  location={targetLocation}
                  stations={stationOptions}
                  onChange={({ stationId, location: next }) => {
                    setTargetStation(stationId);
                    setTargetLocation(next);
                    if (stationId) setTargetVehicle(null);
                  }}
                />
                <Select
                  label={t('fields.vehicle')}
                  data={vehicles.map((v) => ({ value: v.id, label: vehicleLabel(v, departments.find((d) => d.id === v.departmentId)?.shortName) }))}
                  value={targetVehicle}
                  onChange={(v) => {
                    setTargetVehicle(v);
                    if (v) {
                      setTargetStation(null);
                      setTargetLocation('');
                    }
                  }}
                  clearable
                  searchable
                />
                <TextInput label={t('fields.loadingPlace')} value={targetLoading} onChange={(e) => setTargetLoading(e.currentTarget.value)} />
              </SimpleGrid>
            )}
          </Stack>
        </Panel>
      )}
      {categoryKey && (
        <Stack gap="xs">
          <Group align="end">
            <TextInput type="search" label={t('items.search')} leftSection={<IconSearch size={16} />} value={query} onChange={(e) => setQuery(e.currentTarget.value)} w={220} />
            <Select label={t('fields.department')} placeholder={t('items.all')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} clearable />
            <Select label={t('fields.place')} placeholder={t('items.all')} data={locations.map(([value, name]) => ({ value, label: name }))} value={location} onChange={setLocation} clearable searchable />
            <Switch label={t('bulk.dueOnly')} checked={dueOnly} onChange={(e) => setDueOnly(e.currentTarget.checked)} mb={8} />
          </Group>
          <ScanField onCode={(code) => void scan(code)} />
          <Text size="sm" fw={700}>{t('bulk.selected', { count: selected.length })}</Text>
        </Stack>
      )}
      <DataTable<Item>
        exportable={false}
        rows={rows}
        rowKey={(i) => i.id}
        onRowClick={(i) => toggle(i.id, !selected.includes(i.id))}
        empty={!categoryKey ? t('bulk.chooseCategory') : isLoading ? t('loading') : t('bulk.noItems')}
        columns={[
          {
            key: 'select',
            header: '',
            width: 40,
            heading: <HeaderCheckbox label={t('bulk.selectAll')} checked={allShown} indeterminate={shownSelected > 0 && !allShown} disabled={!rows.length} onChange={setShown} />,
            render: (i) => <Checkbox aria-label={i.inventoryNumber} checked={selected.includes(i.id)} onChange={(e) => toggle(i.id, e.currentTarget.checked)} onClick={(e) => e.stopPropagation()} />,
          },
          { key: 'item', header: t('fields.name'), render: (i) => <Text size="sm" fw={700} c="brand" style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); navigate(`/equipment/items/${i.id}?tab=inspections`); }}>{label(i)}</Text> },
          { key: 'category', header: t('fields.category'), render: (i) => categoryName(i.categoryKey) },
          { key: 'place', header: t('fields.place'), render: (i) => place(i) },
          { key: 'next', header: t('items.nextInspection'), render: (i) => <DueDate dueOn={i.nextDue} notRecorded={i.dues.some((d) => d.notRecorded)} /> },
          { key: 'last', header: t('inspection.last'), render: (i) => formatDate(kind ? (i.dues.find((d) => d.key === kind)?.lastDate ?? null) : null, i18n.language) },
        ]}
      />
      {categoryKey && (
        <ActionBar info={t('bulk.selected', { count: selected.length })}>
          <Button loading={save.isPending} disabled={!selected.length || (!placeOn && !kind) || (Boolean(kind) && !dueMode && !date)} onClick={() => save.mutate(undefined)}>{t('bulk.save')}</Button>
        </ActionBar>
      )}
    </Stack>
  );
}
