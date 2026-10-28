import { Button, Group, MultiSelect, Paper, Select, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconClock, IconPlus, IconUsersGroup } from '@tabler/icons-react';
import { useState } from 'react';
import type { Finding, PreviousCrew, Report } from '@forga/incidents-contracts';
import { api, formatDate, formatMoney, formatTime, useLocalized, useTranslation } from '@forga/web-sdk';
import { Notice, notifyError, notifySuccess, Panel, StatusBadge } from '@forga/web-ui';
import { personName, useFunctions, useNames, usePersons, useStations, useVehicles } from '../api';
import type { Content, Personnel } from './editor';
import { mergeFindings, useFindingText } from './findings';
import { PersonDialog, placeOf, type Target, targetOf } from './PersonDialog';
import classes from './report.module.css';
import { StandbyAction } from './StandbyAction';
import { type VehicleEntry, VehicleDialog } from './VehicleDialog';

const blank = (place: Pick<Personnel, 'vehicleId' | 'standbyStationId'>): Personnel => ({
  personId: null,
  guestName: '',
  ...place,
  function: null,
  breathingApparatus: false,
  breathingMinutes: null,
  chemicalSuit: false,
  breathingDevice: null,
  from: null,
  to: null,
  lossOfEarnings: false,
  duringWorkingHours: false,
  allowances: [],
  compensationOverride: null,
  injured: false,
  killed: false,
});

/**
 * Personnel by vehicle and standby. Several persons are chosen at once and added to a vehicle or standby with
 * their function (the vehicle is added to the report with them); the crew of the last incident of the vehicle
 * can be taken over in one step.
 */
export function PersonnelSection({ content, report, update, disabled, findings }: {
  content: Content;
  report: Report;
  update: (change: (c: Content) => Content) => void;
  disabled: boolean;
  findings: Finding[];
}) {
  const { t, i18n } = useTranslation('incidents');
  const localized = useLocalized();
  const findingText = useFindingText();
  const { data: persons = [] } = usePersons();
  const { data: vehicles = [] } = useVehicles();
  const { data: stations = [] } = useStations();
  const names = useNames();
  const { data: functions = [] } = useFunctions();
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [guest, setGuest] = useState('');
  const [target, setTarget] = useState<string | null>(null);
  const [fn, setFn] = useState<string | null>(null);
  const [loadingCrew, setLoadingCrew] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<string | null>(null);

  // A brigade-wide unit (e.g. the duty officer) uses the vehicles and stations of every department.
  const ownVehicles = vehicles.filter((v) => !report.departmentId || v.departmentId === report.departmentId);
  const usedVehicleIds = [...new Set([...content.vehicles.map((v) => v.vehicleId), ...content.personnel.flatMap((p) => (p.vehicleId ? [p.vehicleId] : []))])];
  const ownStations = stations.filter((s) => !report.departmentId || s.departmentId === report.departmentId);
  const usedStationIds = [...new Set(content.personnel.flatMap((p) => (p.standbyStationId ? [p.standbyStationId] : [])))];
  const standbyStations = ownStations.map((s) => ({ id: s.id, name: s.name }));
  const vehicleEntry = (vehicleId: string): VehicleEntry =>
    content.vehicles.find((v) => v.vehicleId === vehicleId) ?? { vehicleId, alarmedAt: null, departedAt: null, returnedAt: null, kilometres: null };
  /** Puts a person on standby at a station (one click from the person row). */
  const toStandby = (index: number, stationId: string) =>
    update((c) => ({ ...c, personnel: c.personnel.map((p, i) => (i === index ? { ...p, vehicleId: null, standbyStationId: stationId } : p)) }));
  const targets: Target[] = [
    ...[...new Set([...usedVehicleIds, ...ownVehicles.map((v) => v.id)])].map((id) => ({ value: `v:${id}`, label: names.vehicle(id) || id })),
    ...[...new Set([...usedStationIds, ...ownStations.map((s) => s.id)])].map((id) => ({ value: `s:${id}`, label: t('personnel.standbyAt', { station: stations.find((s) => s.id === id)?.name ?? '' }) })),
  ];
  // The place to add to: the last used vehicle unless one is chosen.
  const place = target ?? (usedVehicleIds.length ? `v:${usedVehicleIds.at(-1)}` : null);

  const inReport = new Set(content.personnel.flatMap((p) => (p.personId ? [p.personId] : [])));
  const candidates = persons
    .filter((p) => !inReport.has(p.id) && p.status !== 'youth' && p.status !== 'veterans')
    .toSorted((a, b) => {
      const own = (p: typeof a) => Number(Boolean(report.departmentId) && p.departmentIds.includes(report.departmentId as string));
      return own(b) - own(a) || a.lastName.localeCompare(b.lastName);
    });
  const nameOf = (p: Personnel) => p.guestName || (persons.find((x) => x.id === p.personId) ? personName(persons.find((x) => x.id === p.personId)!) : t('personnel.unknownPerson'));
  const functionAbbreviation = (key: string | null | undefined) => {
    const entry = functions.find((f) => f.key === key);
    return (entry?.attributes['abbreviation'] as string | undefined) || (entry ? localized(entry.name) : '');
  };

  /** Adds persons (and the vehicle, if new) to a vehicle or standby; persons already in the report are skipped. */
  const addEntries = (to: string, entries: { personId: string | null; guestName: string; function: string | null }[]) =>
    update((c) => {
      const where = placeOf(to);
      const used = where.vehicleId && !c.vehicles.some((v) => v.vehicleId === where.vehicleId)
        ? [...c.vehicles, { vehicleId: where.vehicleId, alarmedAt: null, departedAt: null, returnedAt: null, kilometres: null }]
        : c.vehicles;
      const present = new Set(c.personnel.flatMap((p) => (p.personId ? [p.personId] : [])));
      const added = entries.filter((entry) => !entry.personId || !present.has(entry.personId)).map((entry) => ({ ...blank(where), ...entry }));
      return { ...c, vehicles: used, personnel: [...c.personnel, ...added] };
    });
  const add = () => {
    if (!place) return;
    addEntries(place, [
      ...personIds.map((id) => ({ personId: id, guestName: '', function: fn })),
      ...(guest.trim() ? [{ personId: null, guestName: guest.trim(), function: fn }] : []),
    ]);
    setPersonIds([]);
    setGuest('');
    setFn(null);
  };
  const vehicleOfPlace = place?.startsWith('v:') ? place.slice(2) : null;
  const takeOverCrew = async () => {
    if (!place || !vehicleOfPlace) return;
    setLoadingCrew(true);
    try {
      const crew = await api<PreviousCrew>(`incidents/reports/${report.id}/previous-crew?vehicleId=${vehicleOfPlace}`);
      if (!crew.personnel.length) {
        notifySuccess(t('personnel.noPreviousCrew'));
        return;
      }
      addEntries(place, crew.personnel.map((p) => ({ personId: p.personId, guestName: '', function: p.function })));
      notifySuccess(t('personnel.crewTaken', { count: crew.personnel.length, number: crew.dispatchNumber ?? '', date: formatDate(crew.alarmedAt, i18n.language) }));
    } catch (error) {
      notifyError(error);
    } finally {
      setLoadingCrew(false);
    }
  };
  const compensationOf = (index: number) => {
    const entry = content.personnel[index];
    const server = report.personnel[index];
    return server && server.personId === entry.personId && server.guestName === entry.guestName ? server.compensation : undefined;
  };

  const groups = [
    ...usedVehicleIds.map((id) => {
      const vehicle = vehicles.find((v) => v.id === id);
      return { key: `v:${id}`, vehicleId: id, title: vehicle?.designation ?? id, subtitle: [vehicle?.radioCallSign, vehicle && vehicle.departmentId !== report.departmentId ? names.department(vehicle.departmentId) : ''].filter(Boolean).join(' · '), seats: vehicle?.seats, standby: false };
    }),
    ...usedStationIds.map((id) => ({ key: `s:${id}`, vehicleId: null, title: t('personnel.standby'), subtitle: stations.find((s) => s.id === id)?.name ?? '', seats: undefined, standby: true })),
    ...(content.personnel.some((p) => !targetOf(p)) ? [{ key: '', vehicleId: null, title: t('personnel.withoutPlace'), subtitle: '', seats: undefined, standby: false }] : []),
  ];
  const personnelFindings = mergeFindings(findings).filter((f) => (f.level === 'error' || !f.acknowledged) && (f.subject !== null || ['no-personnel', 'crew-exceeded'].includes(f.rule)));
  const editingEntry = editing !== null ? content.personnel[editing] : undefined;
  const timeOf = (iso: string) => formatTime(iso, i18n.language);

  return (
    <Stack gap="md">
      {personnelFindings.map((f) => (
        <Notice key={`${f.rule}-${f.subject}`} kind={f.level === 'error' ? 'error' : 'warning'}>{findingText(f)}</Notice>
      ))}
      {!disabled && (
        <Panel>
          <Stack gap="sm">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select
                label={t('personnel.addTo')}
                placeholder={t('personnel.addVehicleFirst')}
                data={targets}
                value={place}
                onChange={setTarget}
                searchable
                allowDeselect={false}
                className={classes.touch}
              />
              <Select
                label={t('person.function')}
                data={functions.map((f) => ({ value: f.key, label: localized(f.name) }))}
                value={fn}
                onChange={setFn}
                clearable
                searchable
                className={classes.touch}
              />
            </SimpleGrid>
            <MultiSelect
              label={t('personnel.search')}
              placeholder={t('personnel.searchPlaceholder')}
              description={t('personnel.searchHint')}
              data={candidates.map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}${p.personnelNumber ? ` (${p.personnelNumber})` : ''}` }))}
              value={personIds}
              onChange={setPersonIds}
              searchable
              clearable
              hidePickedOptions
              className={classes.touch}
            />
            <TextInput label={t('personnel.guest')} placeholder={t('personnel.guestPlaceholder')} value={guest} onChange={(e) => setGuest(e.currentTarget.value)} className={classes.touch} />
            <Group gap="sm">
              <Button size="md" className={classes.touch} disabled={!place || (!personIds.length && !guest.trim())} onClick={add} leftSection={<IconPlus size={16} />}>
                {t('personnel.add', { count: personIds.length + (guest.trim() ? 1 : 0) })}
              </Button>
              {vehicleOfPlace && (
                <Button size="md" variant="default" className={classes.touch} loading={loadingCrew} onClick={() => void takeOverCrew()} leftSection={<IconUsersGroup size={16} />}>
                  {t('personnel.takeOverCrew')}
                </Button>
              )}
            </Group>
          </Stack>
        </Panel>
      )}
      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
        {groups.map((group) => {
          const members = content.personnel.map((p, index) => ({ p, index })).filter(({ p }) => targetOf(p) === group.key);
          const own = group.vehicleId ? vehicleEntry(group.vehicleId) : null;
          return (
            <Paper key={group.key} className={classes.vehicle} data-standby={group.standby || undefined}>
              <Group justify="space-between" align="start" className={classes.vehicleHead}>
                <div>
                  <Text fw={700}>{group.title}</Text>
                  {group.subtitle && <Text size="xs" c="dimmed">{group.subtitle}</Text>}
                  {own && (own.alarmedAt || own.departedAt || own.returnedAt) && (
                    <Group gap={4} mt={2}>
                      <StatusBadge>{t('personnel.vehicleOwnTimes')}</StatusBadge>
                      <Text size="xs" c="dimmed">
                        {timeOf(own.alarmedAt ?? content.times.alarmedAt)} – {timeOf(own.returnedAt ?? content.times.returnedAt)}
                      </Text>
                    </Group>
                  )}
                </div>
                <Stack gap={2} align="end">
                  <Text fw={700} c={group.seats && members.length > group.seats ? 'brand' : undefined}>
                    {group.seats ? t('personnel.seats', { count: members.length, seats: group.seats }) : t('personnel.count', { count: members.length })}
                  </Text>
                  {group.vehicleId && (
                    <Button size="compact-sm" variant="subtle" leftSection={<IconClock size={14} />} onClick={() => setEditingVehicle(group.vehicleId)}>
                      {t('personnel.vehicleTimes')}
                    </Button>
                  )}
                </Stack>
              </Group>
              {!members.length && <Text size="sm" c="dimmed" p="sm">{t('personnel.emptyVehicle')}</Text>}
              {members.map(({ p, index }) => {
                const problems = findings.filter((f) => f.subject === (p.personId ?? `guest:${p.guestName}`));
                const compensation = compensationOf(index);
                return (
                  <div key={`${p.personId ?? p.guestName}-${index}`} className={classes.personRow} data-problem={problems.some((f) => f.level === 'error') || undefined}>
                    <UnstyledButton className={classes.person} onClick={() => setEditing(index)}>
                    <span className={classes.fn}>{functionAbbreviation(p.function)}</span>
                    <span className={classes.name}>
                      {nameOf(p)}
                      {p.breathingApparatus && <StatusBadge tone="done">{t('personnel.breathing')}</StatusBadge>}
                      {p.chemicalSuit && <StatusBadge tone="done">{t('personnel.chemicalSuit')}</StatusBadge>}
                      {p.guestName && <StatusBadge>{t('personnel.guestBadge')}</StatusBadge>}
                      {p.duringWorkingHours && <StatusBadge>{t('personnel.workingHours')}</StatusBadge>}
                      {(p.from || p.to) && <StatusBadge>{t('personnel.ownTimes')}</StatusBadge>}
                    </span>
                    <span className={classes.amount}>{compensation ? `${compensation.hours} h · ${formatMoney(compensation.amount, i18n.language)}` : '…'}</span>
                    </UnstyledButton>
                    {!disabled && !p.standbyStationId && (
                      <span className={classes.quick}>
                        <StandbyAction variant="icon" stations={standbyStations} onChoose={(id) => toStandby(index, id)} />
                      </span>
                    )}
                  </div>
                );
              })}
            </Paper>
          );
        })}
      </SimpleGrid>
      <Panel title={t('personnel.total')} aside={<Text fw={700} c="brand">{t('report.personnelSummary', { count: report.personnel.length, amount: formatMoney(report.compensationTotal, i18n.language) })}</Text>}>
        <Text size="sm" c="dimmed">{t('personnel.totalHint')}</Text>
      </Panel>
      {editingEntry && editing !== null && (
        <PersonDialog
          key={editing}
          name={nameOf(editingEntry)}
          entry={editingEntry}
          targets={targets}
          standbyStations={standbyStations}
          compensation={compensationOf(editing)}
          times={content.times}
          vehicles={content.vehicles}
          disabled={disabled}
          onClose={() => setEditing(null)}
          onRemove={() => {
            update((c) => ({ ...c, personnel: c.personnel.filter((_, i) => i !== editing) }));
            setEditing(null);
          }}
          onSave={(entry) => {
            update((c) => {
              const used = entry.vehicleId && !c.vehicles.some((v) => v.vehicleId === entry.vehicleId)
                ? [...c.vehicles, { vehicleId: entry.vehicleId, alarmedAt: null, departedAt: null, returnedAt: null, kilometres: null }]
                : c.vehicles;
              return { ...c, vehicles: used, personnel: c.personnel.map((p, i) => (i === editing ? entry : p)) };
            });
            setEditing(null);
          }}
        />
      )}
      {editingVehicle && (
        <VehicleDialog
          key={editingVehicle}
          name={names.vehicle(editingVehicle) || editingVehicle}
          entry={vehicleEntry(editingVehicle)}
          times={content.times}
          disabled={disabled}
          onClose={() => setEditingVehicle(null)}
          onSave={(entry) => {
            update((c) => ({
              ...c,
              vehicles: c.vehicles.some((v) => v.vehicleId === entry.vehicleId)
                ? c.vehicles.map((v) => (v.vehicleId === entry.vehicleId ? entry : v))
                : [...c.vehicles, entry],
            }));
            setEditingVehicle(null);
          }}
        />
      )}
    </Stack>
  );
}
