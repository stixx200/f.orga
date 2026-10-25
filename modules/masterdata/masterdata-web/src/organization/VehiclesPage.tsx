import { Button, Chip, Group, Stack, Text, TextInput } from '@mantine/core';
import { useMemo, useState } from 'react';
import type { Vehicle } from '@forga/masterdata-contracts';
import { can, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, matchesSearch, PageHeader, StatusBadge } from '@forga/web-ui';
import { MANAGE, useCatalog, useDepartments, useStations, useVehicles } from '../api';
import { VehicleDialog } from './dialogs';

/** All vehicles of the brigade; editing opens the vehicle dialog of the organization. */
export function VehiclesPage() {
  const { t } = useTranslation('masterdata');
  const localized = useLocalized();
  const session = useSession().data;
  const { data: vehicles = [], isLoading } = useVehicles();
  const { data: departments = [] } = useDepartments();
  const { data: stations = [] } = useStations();
  const { data: types = [] } = useCatalog('vehicle-type');
  const [query, setQuery] = useState('');
  const [view, setView] = useState<'in-service' | 'all'>('in-service');
  const [editing, setEditing] = useState<{ vehicle?: Vehicle } | null>(null);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles
      .filter((v) => view === 'all' || v.status !== 'retired')
      .filter((v) => matchesSearch([v.designation, v.radioCallSign, v.licensePlate], q));
  }, [vehicles, query, view]);
  const department = (id: string) => departments.find((d) => d.id === id)?.shortName ?? '';
  const type = (key: string) => {
    const entry = types.find((x) => x.key === key);
    return entry ? localized(entry.name) : key;
  };
  const firstWritable = departments.find((d) => can(session, MANAGE, d.id));

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('vehicles.title') }]}
        title={t('vehicles.title')}
        actions={firstWritable && <Button onClick={() => setEditing({})}>{t('vehicles.create')}</Button>}
      />
      <Group align="end">
        <TextInput type="search" label={t('persons.search')} placeholder={t('vehicles.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} style={{ flex: 1 }} />
        <Chip.Group value={view} onChange={(v) => setView(v as typeof view)}>
          <Group gap="xs" pb={6}>
            <Chip value="in-service" radius="xs">{t('vehicles.current')}</Chip>
            <Chip value="all" radius="xs">{t('vehicles.withRetired')}</Chip>
          </Group>
        </Chip.Group>
      </Group>
      <DataTable<Vehicle>
        rows={rows}
        rowKey={(v) => v.id}
        empty={isLoading ? t('loading') : t('organization.noVehicles')}
        highlight={(v) => v.status !== 'in-service'}
        onRowClick={(v) => (can(session, MANAGE, v.departmentId) ? setEditing({ vehicle: v }) : undefined)}
        columns={[
          { key: 'designation', header: t('vehicle.designation'), render: (v) => <Text fw={700} size="sm" c="brand">{v.designation}</Text> },
          { key: 'radio', header: t('vehicle.radioCallSign'), render: (v) => v.radioCallSign },
          { key: 'type', header: t('vehicle.type'), render: (v) => type(v.vehicleType) },
          { key: 'department', header: t('vehicle.department'), render: (v) => department(v.departmentId) },
          { key: 'station', header: t('vehicle.station'), render: (v) => stations.find((s) => s.id === v.stationId)?.name ?? '' },
          { key: 'plate', header: t('vehicle.licensePlate'), render: (v) => v.licensePlate },
          { key: 'seats', header: t('vehicle.seats'), align: 'right', render: (v) => v.seats },
          { key: 'category', header: t('vehicles.category'), render: (v) => v.statisticsCategory },
          { key: 'status', header: t('vehicle.status'), render: (v) => <StatusBadge tone={v.status === 'in-service' ? 'done' : 'warning'}>{t(`vehicleStatus.${v.status}`)}</StatusBadge> },
        ]}
      />
      {editing && firstWritable && <VehicleDialog vehicle={editing.vehicle} departmentId={editing.vehicle?.departmentId ?? firstWritable.id} onClose={() => setEditing(null)} />}
    </Stack>
  );
}
