import { Button, Group, NumberInput, Radio, Select, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { type Compensation, hasCrewTimes, inheritedTimes } from '@forga/incidents-contracts';
import { formatDateTime, formatMoney, fromLocalInput, toLocalInput, useLocalized, useTranslation } from '@forga/web-sdk';
import { ResponsiveDialog } from '@forga/web-ui';
import { useFunctions } from '../api';
import { type Content, type Personnel, vehicleOf } from './editor';
import { StandbyAction } from './StandbyAction';

export interface Target {
  value: string;
  label: string;
}

/** `v:<vehicle>`, `s:<station>` or empty for the place of a person in the report. */
export const targetOf = (p: Pick<Personnel, 'vehicleId' | 'standbyStationId'>) =>
  p.vehicleId ? `v:${p.vehicleId}` : p.standbyStationId ? `s:${p.standbyStationId}` : '';

export const placeOf = (target: string): Pick<Personnel, 'vehicleId' | 'standbyStationId'> => ({
  vehicleId: target.startsWith('v:') ? target.slice(2) : null,
  standbyStationId: target.startsWith('s:') ? target.slice(2) : null,
});

/**
 * Function, place, times, breathing apparatus and compensation details of one person in the report. Without own
 * times the person follows the vehicle (if it has own times), else the report; one click puts the person on standby.
 */
export function PersonDialog({ name, entry, targets, standbyStations, compensation, times, vehicles, disabled, onSave, onRemove, onClose }: {
  name: string;
  entry: Personnel;
  targets: Target[];
  /** Stations of the report's department for the standby action. */
  standbyStations: { id: string; name: string }[];
  compensation?: Compensation;
  times: { alarmedAt: string; returnedAt: string };
  vehicles: Content['vehicles'];
  disabled: boolean;
  onSave: (entry: Personnel) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('incidents');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: functions = [] } = useFunctions();
  const [draft, setDraft] = useState<Personnel>(entry);
  const set = <K extends keyof Personnel>(key: K, value: Personnel[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const damage = draft.killed ? 'killed' : draft.injured ? 'injured' : 'none';
  // Times the person follows without own ones: those of the vehicle at the chosen place, else those of the report.
  const vehicle = vehicleOf({ vehicles }, draft);
  const inherited = inheritedTimes(times, vehicle);
  const [own, setOwn] = useState(Boolean(entry.from || entry.to));
  const time = (key: 'from' | 'to', fallback: string) => (
    <TextInput
      label={t(`person.${key}`)}
      type="datetime-local"
      value={toLocalInput(draft[key] ?? fallback)}
      onChange={(e) => {
        const value = e.currentTarget.value ? fromLocalInput(e.currentTarget.value) : null;
        set(key, value === fallback ? null : value);
      }}
      disabled={disabled}
    />
  );

  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={name}
      size="lg"
      actions={
        <Group justify="space-between">
          {!disabled ? <Button variant="subtle" onClick={onRemove}>{t('person.remove')}</Button> : <span />}
          <Group>
            <Button variant="default" onClick={onClose}>{common(disabled ? 'actions.close' : 'actions.cancel')}</Button>
            {!disabled && <Button onClick={() => onSave(draft)}>{t('person.apply')}</Button>}
          </Group>
        </Group>
      }
    >
      <Stack gap="sm">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Group gap="xs" align="end" wrap="nowrap">
            <Select
              label={t('person.place')}
              data={targets}
              value={targetOf(draft)}
              onChange={(value) => setDraft((d) => ({ ...d, ...placeOf(value ?? '') }))}
              placeholder={t('person.noPlace')}
              clearable
              disabled={disabled}
              flex={1}
            />
            {!disabled && !draft.standbyStationId && (
              <StandbyAction variant="button" stations={standbyStations} onChoose={(id) => setDraft((d) => ({ ...d, vehicleId: null, standbyStationId: id }))} />
            )}
          </Group>
          <Select
            label={t('person.function')}
            data={functions.filter((f) => f.active).map((f) => ({ value: f.key, label: localized(f.name) }))}
            value={draft.function ?? null}
            onChange={(value) => set('function', value)}
            clearable
            disabled={disabled}
          />
        </SimpleGrid>
        <Switch
          label={t('person.ownTimes')}
          checked={own}
          onChange={(e) => {
            const checked = e.currentTarget.checked;
            setOwn(checked);
            if (!checked) setDraft((d) => ({ ...d, from: null, to: null }));
          }}
          disabled={disabled}
        />
        {own ? (
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {time('from', inherited.from)}
            {time('to', inherited.to)}
          </SimpleGrid>
        ) : (
          <Text size="sm" c="dimmed">
            {t(hasCrewTimes(vehicle) ? 'person.followsVehicle' : 'person.followsReport', {
              from: formatDateTime(inherited.from, i18n.language),
              to: formatDateTime(inherited.to, i18n.language),
            })}
          </Text>
        )}
        <Switch label={t('person.breathingApparatus')} checked={draft.breathingApparatus ?? false} onChange={(e) => set('breathingApparatus', e.currentTarget.checked)} disabled={disabled} />
        {draft.breathingApparatus && (
          <Group align="end">
            <NumberInput label={t('person.breathingMinutes')} value={draft.breathingMinutes ?? ''} onChange={(value) => set('breathingMinutes', value === '' ? null : Number(value))} min={0} maw={240} disabled={disabled} />
            <Select
              label={t('person.breathingDevice')}
              data={(['compressed-air', 'rebreather', 'filter'] as const).map((d) => ({ value: d, label: t(`person.devices.${d}`) }))}
              value={draft.breathingDevice ?? null}
              onChange={(value) => set('breathingDevice', value as Personnel['breathingDevice'])}
              clearable
              disabled={disabled}
              maw={220}
            />
            <Switch label={t('person.chemicalSuit')} checked={draft.chemicalSuit ?? false} onChange={(e) => set('chemicalSuit', e.currentTarget.checked)} disabled={disabled} mb={8} />
          </Group>
        )}
        <Switch label={t('person.lossOfEarnings')} checked={draft.lossOfEarnings ?? false} onChange={(e) => set('lossOfEarnings', e.currentTarget.checked)} disabled={disabled} />
        <Switch label={t('person.duringWorkingHours')} checked={draft.duringWorkingHours ?? false} onChange={(e) => set('duringWorkingHours', e.currentTarget.checked)} disabled={disabled} />
        <Radio.Group
          label={t('person.damage')}
          value={damage}
          onChange={(value) => setDraft((d) => ({ ...d, injured: value === 'injured', killed: value === 'killed' }))}
        >
          <Group mt={4}>
            {(['none', 'injured', 'killed'] as const).map((v) => <Radio key={v} value={v} label={t(`person.damageOptions.${v}`)} disabled={disabled} />)}
          </Group>
        </Radio.Group>
        {compensation && (
          <Text size="sm" c="dimmed">
            {compensation.rate === null
              ? t('person.noRate')
              : t('person.compensation', { hours: compensation.hours, rate: formatMoney(compensation.rate, i18n.language), amount: formatMoney(compensation.amount, i18n.language) })}
          </Text>
        )}
      </Stack>
    </ResponsiveDialog>
  );
}
