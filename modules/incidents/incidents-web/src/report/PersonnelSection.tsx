import { Button, Group, Paper, Select, SimpleGrid, Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import type { Finding, Report } from '@forga/incidents-contracts';
import { formatMoney, useLocalized, useTranslation } from '@forga/web-sdk';
import { Notice, Panel, StatusBadge } from '@forga/web-ui';
import { personName, useFunctions, usePersons, useStations, useVehicles } from '../api';
import type { Content, Personnel } from './editor';
import { findingText, mergeFindings } from './findings';
import { PersonDialog, placeOf, type Target, targetOf } from './PersonDialog';
import classes from './report.module.css';

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

/** Personnel by vehicle and standby; persons are searched and added to a vehicle or standby in one step. */
export function PersonnelSection({ content, report, update, disabled, findings }: {
  content: Content;
  report: Report;
  update: (change: (c: Content) => Content) => void;
  disabled: boolean;
  findings: Finding[];
}) {
  const { t, i18n } = useTranslation('incidents');
  const localized = useLocalized();
  const { data: persons = [] } = usePersons();
  const { data: vehicles = [] } = useVehicles();
  const { data: stations = [] } = useStations();
  const { data: functions = [] } = useFunctions();
  const [personId, setPersonId] = useState<string | null>(null);
  const [guest, setGuest] = useState('');
  const [vehicleToAdd, setVehicleToAdd] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);

  const ownVehicles = vehicles.filter((v) => v.departmentId === report.departmentId);
  const usedVehicleIds = [...new Set([...content.vehicles.map((v) => v.vehicleId), ...content.personnel.flatMap((p) => (p.vehicleId ? [p.vehicleId] : []))])];
  const ownStations = stations.filter((s) => s.departmentId === report.departmentId);
  const usedStationIds = [...new Set(content.personnel.flatMap((p) => (p.standbyStationId ? [p.standbyStationId] : [])))];
  const targets: Target[] = [
    ...[...new Set([...usedVehicleIds, ...ownVehicles.map((v) => v.id)])].map((id) => ({ value: `v:${id}`, label: vehicles.find((v) => v.id === id)?.designation ?? id })),
    ...[...new Set([...usedStationIds, ...ownStations.map((s) => s.id)])].map((id) => ({ value: `s:${id}`, label: t('personnel.standbyAt', { station: stations.find((s) => s.id === id)?.name ?? '' }) })),
  ];
  const quickTargets = [
    ...usedVehicleIds.map((id) => ({ value: `v:${id}`, label: vehicles.find((v) => v.id === id)?.designation ?? id })),
    ...(ownStations[0] ? [{ value: `s:${ownStations[0].id}`, label: t('personnel.standby') }] : []),
  ];

  const inReport = new Set(content.personnel.flatMap((p) => (p.personId ? [p.personId] : [])));
  const candidates = persons
    .filter((p) => !inReport.has(p.id) && p.status !== 'youth' && p.status !== 'veterans')
    .toSorted((a, b) => Number(b.departmentIds.includes(report.departmentId)) - Number(a.departmentIds.includes(report.departmentId)) || a.lastName.localeCompare(b.lastName));
  const nameOf = (p: Personnel) => p.guestName || (persons.find((x) => x.id === p.personId) ? personName(persons.find((x) => x.id === p.personId)!) : t('personnel.unknownPerson'));
  const functionAbbreviation = (key: string | null | undefined) => {
    const entry = functions.find((f) => f.key === key);
    return (entry?.attributes['abbreviation'] as string | undefined) || (entry ? localized(entry.name) : '');
  };

  const add = (target: string) => {
    if (!personId && !guest.trim()) return;
    update((c) => {
      const place = placeOf(target);
      const used = place.vehicleId && !c.vehicles.some((v) => v.vehicleId === place.vehicleId)
        ? [...c.vehicles, { vehicleId: place.vehicleId, departedAt: null, returnedAt: null, kilometres: null }]
        : c.vehicles;
      return { ...c, vehicles: used, personnel: [...c.personnel, { ...blank(place), personId, guestName: personId ? '' : guest.trim() }] };
    });
    setPersonId(null);
    setGuest('');
  };
  const addVehicle = () => {
    if (!vehicleToAdd) return;
    update((c) => ({ ...c, vehicles: [...c.vehicles, { vehicleId: vehicleToAdd, departedAt: null, returnedAt: null, kilometres: null }] }));
    setVehicleToAdd(null);
  };
  const compensationOf = (index: number) => {
    const entry = content.personnel[index];
    const server = report.personnel[index];
    return server && server.personId === entry.personId && server.guestName === entry.guestName ? server.compensation : undefined;
  };

  const groups = [
    ...usedVehicleIds.map((id) => {
      const vehicle = vehicles.find((v) => v.id === id);
      return { key: `v:${id}`, title: vehicle?.designation ?? id, subtitle: vehicle?.radioCallSign ?? '', seats: vehicle?.seats, standby: false };
    }),
    ...usedStationIds.map((id) => ({ key: `s:${id}`, title: t('personnel.standby'), subtitle: stations.find((s) => s.id === id)?.name ?? '', seats: undefined, standby: true })),
    ...(content.personnel.some((p) => !targetOf(p)) ? [{ key: '', title: t('personnel.withoutPlace'), subtitle: '', seats: undefined, standby: false }] : []),
  ];
  const personnelFindings = mergeFindings(findings).filter((f) => (f.level === 'error' || !f.acknowledged) && (f.subject !== null || ['no-personnel', 'crew-exceeded'].includes(f.rule)));
  const editingEntry = editing !== null ? content.personnel[editing] : undefined;

  return (
    <Stack gap="md">
      {personnelFindings.map((f) => (
        <Notice key={`${f.rule}-${f.subject}`} kind={f.level === 'error' ? 'error' : 'warning'}>{findingText(f, t)}</Notice>
      ))}
      {!disabled && (
        <Panel>
          <Stack gap="sm">
            <Group align="end" gap="sm">
              <Select
                label={t('personnel.search')}
                placeholder={t('personnel.searchPlaceholder')}
                data={candidates.map((p) => ({ value: p.id, label: `${p.lastName}, ${p.firstName}${p.personnelNumber ? ` (${p.personnelNumber})` : ''}` }))}
                value={personId}
                onChange={(value) => {
                  setPersonId(value);
                  if (value) setGuest('');
                }}
                searchable
                clearable
                style={{ flex: 2, minWidth: 220 }}
              />
              <TextInput label={t('personnel.guest')} placeholder={t('personnel.guestPlaceholder')} value={guest} onChange={(e) => { setGuest(e.currentTarget.value); if (e.currentTarget.value) setPersonId(null); }} style={{ flex: 1, minWidth: 180 }} />
            </Group>
            <Group gap="xs">
              <Text size="sm" c="dimmed">{t('personnel.addTo')}</Text>
              {quickTargets.map((target) => (
                <Button key={target.value} size="xs" variant="outline" disabled={!personId && !guest.trim()} onClick={() => add(target.value)} leftSection={<IconPlus size={14} />}>
                  {target.label}
                </Button>
              ))}
              {!quickTargets.length && <Text size="sm" c="dimmed">{t('personnel.addVehicleFirst')}</Text>}
            </Group>
            <Group align="end" gap="sm">
              <Select
                label={t('personnel.addVehicle')}
                data={ownVehicles.filter((v) => !usedVehicleIds.includes(v.id)).map((v) => ({ value: v.id, label: `${v.designation}${v.radioCallSign ? ` · ${v.radioCallSign}` : ''}` }))}
                value={vehicleToAdd}
                onChange={setVehicleToAdd}
                clearable
                style={{ flex: 1, minWidth: 220 }}
              />
              <Button variant="default" disabled={!vehicleToAdd} onClick={addVehicle}>{t('personnel.addVehicleButton')}</Button>
            </Group>
          </Stack>
        </Panel>
      )}
      <SimpleGrid cols={{ base: 1, md: 2, xl: 3 }} spacing="md">
        {groups.map((group) => {
          const members = content.personnel.map((p, index) => ({ p, index })).filter(({ p }) => targetOf(p) === group.key);
          return (
            <Paper key={group.key} className={classes.vehicle} data-standby={group.standby || undefined}>
              <Group justify="space-between" align="start" className={classes.vehicleHead}>
                <div>
                  <Text fw={700}>{group.title}</Text>
                  {group.subtitle && <Text size="xs" c="dimmed">{group.subtitle}</Text>}
                </div>
                <Text fw={700} c={group.seats && members.length > group.seats ? 'brand' : undefined}>
                  {group.seats ? t('personnel.seats', { count: members.length, seats: group.seats }) : t('personnel.count', { count: members.length })}
                </Text>
              </Group>
              {!members.length && <Text size="sm" c="dimmed" p="sm">{t('personnel.emptyVehicle')}</Text>}
              {members.map(({ p, index }) => {
                const problems = findings.filter((f) => f.subject === (p.personId ?? `guest:${p.guestName}`));
                const compensation = compensationOf(index);
                return (
                  <UnstyledButton key={`${p.personId ?? p.guestName}-${index}`} className={classes.person} data-problem={problems.some((f) => f.level === 'error') || undefined} onClick={() => setEditing(index)}>
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
          compensation={compensationOf(editing)}
          times={content.times}
          disabled={disabled}
          onClose={() => setEditing(null)}
          onRemove={() => {
            update((c) => ({ ...c, personnel: c.personnel.filter((_, i) => i !== editing) }));
            setEditing(null);
          }}
          onSave={(entry) => {
            update((c) => {
              const used = entry.vehicleId && !c.vehicles.some((v) => v.vehicleId === entry.vehicleId)
                ? [...c.vehicles, { vehicleId: entry.vehicleId, departedAt: null, returnedAt: null, kilometres: null }]
                : c.vehicles;
              return { ...c, vehicles: used, personnel: c.personnel.map((p, i) => (i === editing ? entry : p)) };
            });
            setEditing(null);
          }}
        />
      )}
    </Stack>
  );
}
