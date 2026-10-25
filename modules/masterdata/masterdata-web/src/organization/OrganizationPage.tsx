import { ActionIcon, Button, Grid, Group, NavLink, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { IconPencil, IconTrash, IconUserMinus } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import type { BrigadeSettings } from '@forga/core-contracts';
import type { Department, MembershipInput, Station, Vehicle } from '@forga/masterdata-contracts';
import { api, can, send, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, EmptyState, KpiTile, PageHeader, Panel, StatusBadge, useAction } from '@forga/web-ui';
import { keys, loadPerson, MANAGE, PERSONS_WRITE, personName, useDepartments, usePersons, useStations, useVehicles } from '../api';
import { DeleteDepartment, DepartmentDialog, StationDialog, VehicleDialog } from './dialogs';

type Editing =
  | { kind: 'department'; department?: Department; parentId?: string | null }
  | { kind: 'station'; station?: Station; departmentId: string }
  | { kind: 'vehicle'; vehicle?: Vehicle; departmentId: string }
  | { kind: 'delete'; department: Department }
  | null;

/** Today in Europe/Berlin as `YYYY-MM-DD`. */
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
const dayBefore = (date: string) => new Date(new Date(`${date}T12:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);

/** Loads the memberships of a person, changes them and saves the whole list. */
async function changeMemberships(id: string, edit: (memberships: MembershipInput[]) => MembershipInput[]) {
  const person = await loadPerson(id);
  const memberships = person.memberships.map(({ departmentId, from, to, primary }) => ({ departmentId, from, to, primary }));
  return send('PUT', `masterdata/persons/${id}/memberships`, edit(memberships));
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap="xs" wrap="nowrap" align="start">
      <Text size="sm" c="dimmed" w={140} style={{ flexShrink: 0 }}>{label}</Text>
      <Text size="sm" component="div">{children || '–'}</Text>
    </Group>
  );
}

function Tree({ departments, parentId, selected, onSelect, counts }: {
  departments: Department[];
  parentId: string | null;
  selected: string | null;
  onSelect: (id: string) => void;
  counts: Map<string, number>;
}) {
  const { t } = useTranslation('masterdata');
  const ids = new Set(departments.map((d) => d.id));
  const children = departments.filter((d) => (parentId === null ? !d.parentId || !ids.has(d.parentId) : d.parentId === parentId));
  return children.map((d) => {
    const nested = departments.some((x) => x.parentId === d.id);
    return (
      <NavLink
        key={d.id}
        active={d.id === selected}
        onClick={() => onSelect(d.id)}
        label={<Text fw={700} size="sm">{d.name}</Text>}
        description={`${t(`departmentType.${d.type}`)} · ${t('organization.members', { count: counts.get(d.id) ?? 0 })}`}
        defaultOpened
        childrenOffset={24}
      >
        {nested ? <Tree departments={departments} parentId={d.id} selected={selected} onSelect={onSelect} counts={counts} /> : undefined}
      </NavLink>
    );
  });
}

function Members({ department, canEdit }: { department: Department; canEdit: boolean }) {
  const { t } = useTranslation('masterdata');
  const { data: members = [] } = usePersons(department.id);
  const { data: everyone = [] } = usePersons();
  const [personId, setPersonId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const invalidate = [keys.persons];

  const add = useAction((id: string) => changeMemberships(id, (m) => [...m, { departmentId: department.id, from: today(), to: null, primary: false }]), {
    success: t('organization.memberAdded'),
    invalidate,
    onSuccess: () => setPersonId(null),
  });
  // Ending keeps the membership in the history; one that starts today is removed.
  const end = useAction(
    (id: string) =>
      changeMemberships(id, (m) =>
        m.flatMap((x) => {
          if (x.departmentId !== department.id || x.primary || (x.to && x.to < today())) return [x];
          const to = dayBefore(today());
          return x.from > to ? [] : [{ ...x, to }];
        }),
      ),
    { success: t('organization.memberEnded'), invalidate },
  );
  const memberIds = new Set(members.map((m) => m.id));
  const removingPerson = members.find((m) => m.id === removing);

  return (
    <Panel title={t('organization.membersTitle', { count: members.length })}>
      <Stack gap="sm">
        {canEdit && (
          <Group align="end" gap="sm">
            <Select
              label={t('organization.addMember')}
              description={t('organization.addMemberHint')}
              data={everyone.filter((p) => !memberIds.has(p.id) && p.status !== 'left').map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}${p.personnelNumber ? ` (${p.personnelNumber})` : ''}` }))}
              value={personId}
              onChange={setPersonId}
              searchable
              clearable
              style={{ flex: 1, minWidth: 240 }}
            />
            <Button variant="outline" disabled={!personId} loading={add.isPending} onClick={() => personId && add.mutate(personId)}>{t('organization.addMemberButton')}</Button>
          </Group>
        )}
        <DataTable
          rows={members}
          rowKey={(p) => p.id}
          empty={t('organization.noMembers')}
          columns={[
            { key: 'name', header: t('organization.name'), render: (p) => `${p.lastName}, ${p.firstName}` },
            { key: 'number', header: t('organization.personnelNumber'), render: (p) => p.personnelNumber ?? '' },
            {
              key: 'membership',
              header: t('organization.membership'),
              render: (p) => <StatusBadge tone={p.primaryDepartmentId === department.id ? 'primary' : 'neutral'}>{t(p.primaryDepartmentId === department.id ? 'organization.primaryMembership' : 'organization.additionalMembership')}</StatusBadge>,
            },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (p) =>
                canEdit && p.primaryDepartmentId !== department.id && (
                  <ActionIcon aria-label={t('organization.endMembership')} onClick={() => setRemoving(p.id)}><IconUserMinus size={18} /></ActionIcon>
                ),
            },
          ]}
        />
      </Stack>
      <ConfirmDialog
        opened={!!removingPerson}
        onClose={() => setRemoving(null)}
        title={t('organization.endMembershipTitle')}
        description={removingPerson ? t('organization.endMembershipText', { name: personName(removingPerson), department: department.name }) : ''}
        confirmLabel={t('organization.endMembership')}
        onConfirm={() => {
          if (removing) end.mutate(removing);
          setRemoving(null);
        }}
      />
    </Panel>
  );
}

function Detail({ department, edit }: { department: Department; edit: (editing: Editing) => void }) {
  const { t, i18n } = useTranslation('masterdata');
  const session = useSession().data;
  const { data: departments = [] } = useDepartments();
  const { data: stations = [] } = useStations();
  const { data: vehicles = [] } = useVehicles();
  const { data: members = [] } = usePersons(department.id);
  const canManage = can(session, MANAGE, department.id);
  const canMembers = can(session, PERSONS_WRITE, department.id);
  const own = { stations: stations.filter((s) => s.departmentId === department.id), vehicles: vehicles.filter((v) => v.departmentId === department.id) };
  const person = (id: string | null) => members.find((m) => m.id === id);
  const parent = departments.find((d) => d.id === department.parentId);

  return (
    <Stack gap="lg">
      <Panel
        title={department.name}
        aside={
          canManage && (
            <Group gap="xs">
              {session?.permissions[MANAGE] === 'brigade' && (
                <Button size="xs" variant="subtle" leftSection={<IconTrash size={14} />} onClick={() => edit({ kind: 'delete', department })}>{t('organization.delete')}</Button>
              )}
              <Button size="xs" variant="outline" leftSection={<IconPencil size={14} />} onClick={() => edit({ kind: 'department', department })}>{t('organization.edit')}</Button>
            </Group>
          )
        }
      >
        <Stack gap={6}>
          <Row label={t('department.type')}>{t(`departmentType.${department.type}`)}</Row>
          <Row label={t('department.shortName')}>{department.shortName}</Row>
          <Row label={t('department.parent')}>{parent?.name}</Row>
          <Row label={t('department.commander')}>{person(department.commanderId) ? personName(person(department.commanderId)!) : ''}</Row>
          <Row label={t('department.deputies')}>{department.deputyIds.map((id) => (person(id) ? personName(person(id)!) : '')).filter(Boolean).join(', ')}</Row>
          {department.population !== null && <Row label={t('department.population')}>{department.population.toLocaleString(i18n.language === 'de' ? 'de-DE' : 'en-GB')}</Row>}
          <Row label={t('department.statistics')}>{t(department.statisticsRelevant ? 'organization.countsInStatistics' : 'organization.notInStatistics')}</Row>
          <Row label={t('department.specialTasks')}>{department.specialTasks.length ? <Group gap={4}>{department.specialTasks.map((s) => <StatusBadge key={s}>{t(`specialTask.${s}`)}</StatusBadge>)}</Group> : ''}</Row>
        </Stack>
        <SimpleGrid cols={3} mt="md">
          <KpiTile value={members.filter((m) => m.status === 'active' || m.status === 'probation').length} label={t('organization.active')} />
          <KpiTile value={own.vehicles.filter((v) => v.status !== 'retired').length} label={t('organization.vehicles')} />
          <KpiTile value={own.stations.length} label={t('organization.stations')} />
        </SimpleGrid>
        {canManage && (
          <Group gap="xs" mt="md">
            <Button size="xs" variant="default" onClick={() => edit({ kind: 'station', departmentId: department.id })}>{t('organization.addStation')}</Button>
            <Button size="xs" variant="default" onClick={() => edit({ kind: 'vehicle', departmentId: department.id })}>{t('organization.addVehicle')}</Button>
            {can(session, MANAGE) && session?.permissions[MANAGE] === 'brigade' && (
              <Button size="xs" variant="default" onClick={() => edit({ kind: 'department', parentId: department.id })}>{t('organization.addSubDepartment')}</Button>
            )}
          </Group>
        )}
      </Panel>
      <Panel title={t('organization.stations')}>
        <DataTable
          rows={own.stations}
          rowKey={(s) => s.id}
          empty={t('organization.noStations')}
          onRowClick={canManage ? (s) => edit({ kind: 'station', station: s, departmentId: department.id }) : undefined}
          columns={[
            { key: 'name', header: t('station.name'), render: (s) => <Text fw={700} size="sm">{s.name}</Text> },
            { key: 'address', header: t('station.address'), render: (s) => [s.street, [s.postalCode, s.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') },
            { key: 'staffed', header: t('station.permanentlyStaffed'), render: (s) => t(s.permanentlyStaffed ? 'organization.yes' : 'organization.no') },
          ]}
        />
      </Panel>
      <Panel title={t('organization.vehicles')}>
        <DataTable
          rows={own.vehicles}
          rowKey={(v) => v.id}
          empty={t('organization.noVehicles')}
          highlight={(v) => v.status !== 'in-service'}
          onRowClick={canManage ? (v) => edit({ kind: 'vehicle', vehicle: v, departmentId: department.id }) : undefined}
          columns={[
            { key: 'designation', header: t('vehicle.designation'), render: (v) => <Text fw={700} size="sm">{v.designation}</Text> },
            { key: 'radio', header: t('vehicle.radioCallSign'), render: (v) => v.radioCallSign },
            { key: 'plate', header: t('vehicle.licensePlate'), render: (v) => v.licensePlate },
            { key: 'seats', header: t('vehicle.seats'), align: 'right', render: (v) => v.seats },
            { key: 'status', header: t('vehicle.status'), render: (v) => <StatusBadge tone={v.status === 'in-service' ? 'done' : 'warning'}>{t(`vehicleStatus.${v.status}`)}</StatusBadge> },
          ]}
        />
      </Panel>
      <Members department={department} canEdit={canMembers} />
    </Stack>
  );
}

/** Departments as a tree with stations, vehicles and members; editable with the organization permission. */
export function OrganizationPage() {
  const { t } = useTranslation('masterdata');
  const session = useSession().data;
  const { data: departments = [], isLoading } = useDepartments();
  const { data: persons = [] } = usePersons();
  const { data: brigade } = useQuery({ queryKey: ['core', 'settings', 'brigade'], queryFn: () => api<BrigadeSettings | null>('core/settings/brigade') });
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const counts = new Map<string, number>();
  for (const p of persons) for (const id of p.departmentIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const current = departments.find((d) => d.id === selected) ?? departments.find((d) => !d.parentId);
  const createAllowed = session?.permissions[MANAGE] === 'brigade';

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('organization.title') }]}
        title={t('organization.title')}
        actions={createAllowed && <Button onClick={() => setEditing({ kind: 'department', parentId: null })}>{t('organization.create')}</Button>}
      />
      {!isLoading && !departments.length ? (
        <EmptyState title={t('organization.empty')} />
      ) : (
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Panel title={brigade?.name ?? t('organization.brigade')} p="sm">
              <Tree departments={departments} parentId={null} selected={current?.id ?? null} onSelect={setSelected} counts={counts} />
            </Panel>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 8 }}>{current && <Detail key={current.id} department={current} edit={setEditing} />}</Grid.Col>
        </Grid>
      )}
      {editing?.kind === 'department' && (
        <DepartmentDialog
          department={editing.department}
          parentId={editing.parentId}
          onClose={(saved) => {
            setEditing(null);
            if (saved) setSelected(saved.id);
          }}
        />
      )}
      {editing?.kind === 'delete' && (
        <DeleteDepartment
          department={editing.department}
          onClose={() => setEditing(null)}
          onDeleted={() => {
            setEditing(null);
            setSelected(null);
          }}
        />
      )}
      {editing?.kind === 'station' && <StationDialog station={editing.station} departmentId={editing.departmentId} onClose={() => setEditing(null)} />}
      {editing?.kind === 'vehicle' && <VehicleDialog vehicle={editing.vehicle} departmentId={editing.departmentId} onClose={() => setEditing(null)} />}
    </Stack>
  );
}
