import { Button, Group, MultiSelect, NumberInput, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import {
  type Department,
  type DepartmentGroup,
  type DepartmentInput,
  DepartmentType,
  SpecialTask,
  type Station,
  type StationInput,
  VEHICLE_STATISTICS_CATEGORIES,
  type Vehicle,
  type VehicleInput,
  VehicleStatus,
} from '@forga/masterdata-contracts';
import { send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, MANAGE, personName, useCatalog, useDepartments, usePersons, useStations } from '../api';

function Actions({ onClose, form, loading, onDelete }: { onClose: () => void; form: string; loading: boolean; onDelete?: () => void }) {
  const { t } = useTranslation('common');
  return (
    <Group justify="space-between">
      {onDelete ? <Button variant="subtle" onClick={onDelete}>{t('actions.delete')} …</Button> : <span />}
      <Group>
        <Button variant="default" onClick={onClose}>{t('actions.cancel')}</Button>
        <Button type="submit" form={form} loading={loading}>{t('actions.save')}</Button>
      </Group>
    </Group>
  );
}

/** Confirms deleting; the server refuses objects that are still in use and says why. */
function DeleteConfirm({ opened, title, text, path, invalidate, onClose, onDeleted }: {
  opened: boolean;
  title: string;
  text: string;
  path: string;
  invalidate: readonly (readonly unknown[])[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const remove = useAction(() => send('DELETE', path), { success: t('organization.deleted'), invalidate, onSuccess: onDeleted });
  return (
    <ConfirmDialog
      opened={opened}
      onClose={onClose}
      title={title}
      description={text}
      confirmLabel={common('actions.delete')}
      loading={remove.isPending}
      onConfirm={() => remove.mutate(undefined)}
    />
  );
}

export function DeleteDepartment({ department, onClose, onDeleted }: { department: Department; onClose: () => void; onDeleted: () => void }) {
  const { t } = useTranslation('masterdata');
  return (
    <DeleteConfirm
      opened
      title={t('organization.deleteDepartmentTitle', { name: department.name })}
      text={t('organization.deleteDepartmentText')}
      path={`masterdata/departments/${department.id}`}
      invalidate={[keys.departments]}
      onClose={onClose}
      onDeleted={onDeleted}
    />
  );
}

/** Create or edit a department; a new sub-department gets its parent preset. */
export function DepartmentDialog({ department, parentId, onClose }: { department?: Department; parentId?: string | null; onClose: (saved?: Department) => void }) {
  const { t } = useTranslation('masterdata');
  const { data: departments = [] } = useDepartments();
  const { data: members = [] } = usePersons(department?.id);
  // Type, parent, special tasks, statistics and population concern the whole brigade (`masterdata.organization.manage` brigade-wide).
  const structure = useSession().data?.permissions[MANAGE] === 'brigade';
  const [form, setForm] = useState<Required<DepartmentInput>>(() => ({
    name: department?.name ?? '',
    shortName: department?.shortName ?? '',
    type: department?.type ?? 'operational',
    parentId: department?.parentId ?? parentId ?? null,
    specialTasks: department?.specialTasks ?? [],
    commanderId: department?.commanderId ?? null,
    deputyIds: department?.deputyIds ?? [],
    statisticsRelevant: department ? department.statisticsRelevant : null,
    population: department?.population ?? null,
  }));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const save = useAction(
    () => (department ? send<Department>('PUT', `masterdata/departments/${department.id}`, form) : send<Department>('POST', 'masterdata/departments', form)),
    { success: t('organization.saved'), invalidate: [keys.departments], onSuccess: (saved) => onClose(saved) },
  );
  const people = members.map((p) => ({ value: p.id, label: personName(p) }));

  return (
    <ResponsiveDialog opened onClose={() => onClose()} title={department ? t('organization.editDepartment') : t('organization.newDepartment')} size="lg" actions={<Actions onClose={() => onClose()} form="department" loading={save.isPending} />}>
      <form id="department" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label={t('department.name')} value={form.name} onChange={(e) => set('name', e.currentTarget.value)} required placeholder={t('organization.namePlaceholder')} />
            <TextInput label={t('department.shortName')} value={form.shortName} onChange={(e) => set('shortName', e.currentTarget.value)} required />
            <Select label={t('department.type')} data={DepartmentType.options.map((v) => ({ value: v, label: t(`departmentType.${v}`) }))} value={form.type} onChange={(v) => v && set('type', v as Department['type'])} allowDeselect={false} disabled={!structure} />
            <Select
              label={t('department.parent')}
              description={t('organization.parentHint')}
              data={departments.filter((d) => d.id !== department?.id).map((d) => ({ value: d.id, label: d.name }))}
              value={form.parentId}
              onChange={(v) => set('parentId', v)}
              clearable
              disabled={!structure}
            />
          </SimpleGrid>
          {department && (
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select label={t('department.commander')} description={t('organization.membersOnly')} data={people} value={form.commanderId} onChange={(v) => set('commanderId', v)} searchable clearable />
              <MultiSelect label={t('department.deputies')} data={people} value={form.deputyIds} onChange={(v) => set('deputyIds', v.slice(0, 3))} searchable maxValues={3} />
            </SimpleGrid>
          )}
          <MultiSelect
            label={t('department.specialTasks')}
            description={t('organization.specialTasksHint')}
            data={SpecialTask.options.map((v) => ({ value: v, label: t(`specialTask.${v}`) }))}
            value={form.specialTasks}
            onChange={(v) => set('specialTasks', v as Department['specialTasks'])}
            disabled={!structure}
          />
          <NumberInput
            label={t('department.population')}
            description={t('organization.populationHint')}
            value={form.population ?? ''}
            onChange={(v) => set('population', v === '' ? null : Number(v))}
            min={0}
            thousandSeparator="."
            decimalSeparator=","
            maw={260}
            disabled={!structure}
          />
          <Select
            label={t('department.statistics')}
            data={[
              { value: 'default', label: t('organization.statisticsDefault') },
              { value: 'true', label: t('organization.statisticsYes') },
              { value: 'false', label: t('organization.statisticsNo') },
            ]}
            value={form.statisticsRelevant === null ? 'default' : String(form.statisticsRelevant)}
            onChange={(v) => set('statisticsRelevant', v === 'default' || !v ? null : v === 'true')}
            allowDeselect={false}
            disabled={!structure}
          />
          {!structure && <Text size="xs" c="dimmed">{t('organization.structureHint')}</Text>}
        </Stack>
      </form>
    </ResponsiveDialog>
  );
}

export function StationDialog({ station, departmentId, onClose }: { station?: Station; departmentId: string; onClose: () => void }) {
  const { t } = useTranslation('masterdata');
  const { data: departments = [] } = useDepartments();
  const [form, setForm] = useState<Required<StationInput>>(() => ({
    name: station?.name ?? '',
    departmentId: station?.departmentId ?? departmentId,
    street: station?.street ?? '',
    postalCode: station?.postalCode ?? '',
    city: station?.city ?? '',
    permanentlyStaffed: station?.permanentlyStaffed ?? false,
    notes: station?.notes ?? '',
  }));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const [deleting, setDeleting] = useState(false);
  const save = useAction(() => (station ? send('PUT', `masterdata/stations/${station.id}`, form) : send('POST', 'masterdata/stations', form)), {
    success: t('organization.saved'),
    invalidate: [keys.stations],
    onSuccess: () => onClose(),
  });
  if (deleting && station) {
    return (
      <DeleteConfirm
        opened
        title={t('organization.deleteStationTitle', { name: station.name })}
        text={t('organization.deleteStationText')}
        path={`masterdata/stations/${station.id}`}
        invalidate={[keys.stations]}
        onClose={() => setDeleting(false)}
        onDeleted={onClose}
      />
    );
  }
  return (
    <ResponsiveDialog opened onClose={onClose} title={station ? t('organization.editStation') : t('organization.newStation')} size="lg" actions={<Actions onClose={onClose} form="station" loading={save.isPending} onDelete={station ? () => setDeleting(true) : undefined} />}>
      <form id="station" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
        <Stack gap="sm">
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput label={t('station.name')} value={form.name} onChange={(e) => set('name', e.currentTarget.value)} required />
            <Select label={t('station.department')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={form.departmentId} onChange={(v) => v && set('departmentId', v)} allowDeselect={false} />
            <TextInput label={t('station.street')} value={form.street} onChange={(e) => set('street', e.currentTarget.value)} />
            <Group grow>
              <TextInput label={t('station.postalCode')} value={form.postalCode} onChange={(e) => set('postalCode', e.currentTarget.value)} />
              <TextInput label={t('station.city')} value={form.city} onChange={(e) => set('city', e.currentTarget.value)} />
            </Group>
          </SimpleGrid>
          <Switch label={t('station.permanentlyStaffed')} checked={form.permanentlyStaffed} onChange={(e) => set('permanentlyStaffed', e.currentTarget.checked)} />
          <Textarea label={t('station.notes')} value={form.notes} onChange={(e) => set('notes', e.currentTarget.value)} autosize minRows={2} />
        </Stack>
      </form>
    </ResponsiveDialog>
  );
}

export function VehicleDialog({ vehicle, departmentId, onClose }: { vehicle?: Vehicle; departmentId: string; onClose: () => void }) {
  const { t } = useTranslation('masterdata');
  const localized = useLocalized();
  const { data: departments = [] } = useDepartments();
  const { data: stations = [] } = useStations();
  const { data: types = [] } = useCatalog('vehicle-type');
  const [form, setForm] = useState<Required<VehicleInput>>(() => ({
    designation: vehicle?.designation ?? '',
    radioCallSign: vehicle?.radioCallSign ?? '',
    licensePlate: vehicle?.licensePlate ?? '',
    vehicleType: vehicle?.vehicleType ?? '',
    departmentId: vehicle?.departmentId ?? departmentId,
    stationId: vehicle?.stationId ?? null,
    seats: vehicle?.seats ?? null,
    yearBuilt: vehicle?.yearBuilt ?? null,
    commissionedOn: vehicle?.commissionedOn ?? null,
    decommissionedOn: vehicle?.decommissionedOn ?? null,
    costRecoveryCategory: vehicle?.costRecoveryCategory ?? null,
    statisticsCategory: vehicle?.statisticsCategory ?? null,
    status: vehicle?.status ?? 'in-service',
    notes: vehicle?.notes ?? '',
  }));
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const type = types.find((x) => x.key === form.vehicleType);
  const [deleting, setDeleting] = useState(false);
  const save = useAction(() => (vehicle ? send('PUT', `masterdata/vehicles/${vehicle.id}`, form) : send('POST', 'masterdata/vehicles', form)), {
    success: t('organization.saved'),
    invalidate: [keys.vehicles],
    onSuccess: () => onClose(),
  });
  if (deleting && vehicle) {
    return (
      <DeleteConfirm
        opened
        title={t('organization.deleteVehicleTitle', { name: vehicle.designation })}
        text={t('organization.deleteVehicleText')}
        path={`masterdata/vehicles/${vehicle.id}`}
        invalidate={[keys.vehicles]}
        onClose={() => setDeleting(false)}
        onDeleted={onClose}
      />
    );
  }
  return (
    <ResponsiveDialog opened onClose={onClose} title={vehicle ? t('organization.editVehicle') : t('organization.newVehicle')} size="xl" actions={<Actions onClose={onClose} form="vehicle" loading={save.isPending} onDelete={vehicle ? () => setDeleting(true) : undefined} />}>
      <form id="vehicle" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label={t('vehicle.designation')} value={form.designation} onChange={(e) => set('designation', e.currentTarget.value)} required />
          <TextInput label={t('vehicle.radioCallSign')} value={form.radioCallSign} onChange={(e) => set('radioCallSign', e.currentTarget.value)} />
          <Select
            label={t('vehicle.type')}
            description={type ? t('vehicle.typeHint', { crew: String(type.attributes['crew'] ?? ''), seats: Number(type.attributes['seats'] ?? 0) }) : undefined}
            data={types.filter((x) => x.active).map((x) => ({ value: x.key, label: localized(x.name) }))}
            value={form.vehicleType || null}
            onChange={(v) => set('vehicleType', v ?? '')}
            searchable
            required
          />
          <TextInput label={t('vehicle.licensePlate')} value={form.licensePlate} onChange={(e) => set('licensePlate', e.currentTarget.value)} />
          <Select label={t('vehicle.department')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={form.departmentId} onChange={(v) => v && setForm((f) => ({ ...f, departmentId: v, stationId: null }))} allowDeselect={false} />
          <Select label={t('vehicle.station')} data={stations.filter((s) => s.departmentId === form.departmentId).map((s) => ({ value: s.id, label: s.name }))} value={form.stationId} onChange={(v) => set('stationId', v)} clearable />
          <NumberInput label={t('vehicle.seats')} description={t('vehicle.seatsHint')} value={form.seats ?? ''} onChange={(v) => set('seats', v === '' ? null : Number(v))} min={0} />
          <Select
            label={t('vehicle.statisticsCategory')}
            description={t('vehicle.statisticsHint')}
            data={VEHICLE_STATISTICS_CATEGORIES.map((c) => ({ value: c.id, label: `${c.id} · ${localized(c.name)}` }))}
            value={form.statisticsCategory}
            onChange={(v) => set('statisticsCategory', v)}
            searchable
            clearable
          />
          <NumberInput label={t('vehicle.yearBuilt')} value={form.yearBuilt ?? ''} onChange={(v) => set('yearBuilt', v === '' ? null : Number(v))} min={1900} max={2200} />
          <DateInput label={t('vehicle.commissionedOn')} value={form.commissionedOn} onChange={(v) => set('commissionedOn', v)} valueFormat="DD.MM.YYYY" clearable />
          <Select label={t('vehicle.status')} data={VehicleStatus.options.map((v) => ({ value: v, label: t(`vehicleStatus.${v}`) }))} value={form.status} onChange={(v) => v && set('status', v as Vehicle['status'])} allowDeselect={false} />
          <DateInput label={t('vehicle.decommissionedOn')} value={form.decommissionedOn} onChange={(v) => set('decommissionedOn', v)} valueFormat="DD.MM.YYYY" clearable />
        </SimpleGrid>
        <Textarea label={t('vehicle.notes')} value={form.notes} onChange={(e) => set('notes', e.currentTarget.value)} autosize minRows={2} mt="sm" />
      </form>
    </ResponsiveDialog>
  );
}

/** Create or edit a group of a department: name, group leader and members (members of the department only). */
export function GroupDialog({ group, departmentId, onClose }: { group?: DepartmentGroup; departmentId: string; onClose: () => void }) {
  const { t } = useTranslation('masterdata');
  const { data: members = [] } = usePersons(departmentId);
  const [form, setForm] = useState(() => ({ name: group?.name ?? '', leaderId: group?.leaderId ?? null, memberIds: group?.memberIds ?? [] }));
  const [deleting, setDeleting] = useState(false);
  const invalidate = [['masterdata', 'groups']] as const;
  const save = useAction(
    () => {
      const body = { departmentId, ...form };
      return group ? send('PUT', `masterdata/groups/${group.id}`, body) : send('POST', 'masterdata/groups', body);
    },
    { success: t('organization.saved'), invalidate, onSuccess: () => onClose() },
  );
  const people = members.filter((p) => p.status !== 'left').map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}` }));
  if (deleting && group) {
    return (
      <DeleteConfirm
        opened
        title={t('groups.deleteTitle', { name: group.name })}
        text={t('groups.deleteText')}
        path={`masterdata/groups/${group.id}`}
        invalidate={invalidate}
        onClose={() => setDeleting(false)}
        onDeleted={onClose}
      />
    );
  }
  return (
    <ResponsiveDialog opened onClose={onClose} title={group ? t('groups.edit') : t('groups.new')} actions={<Actions onClose={onClose} form="group" loading={save.isPending} onDelete={group ? () => setDeleting(true) : undefined} />}>
      <form id="group" onSubmit={(e) => { e.preventDefault(); save.mutate(undefined); }}>
        <Stack gap="sm">
          <TextInput label={t('groups.name')} placeholder={t('groups.namePlaceholder')} value={form.name} onChange={(e) => setForm({ ...form, name: e.currentTarget.value })} required />
          <Select label={t('groups.leader')} data={people} value={form.leaderId} onChange={(v) => setForm({ ...form, leaderId: v })} searchable clearable />
          <MultiSelect label={t('groups.members')} description={t('organization.membersOnly')} data={people.filter((p) => p.value !== form.leaderId)} value={form.memberIds} onChange={(v) => setForm({ ...form, memberIds: v })} searchable />
        </Stack>
      </form>
    </ResponsiveDialog>
  );
}
