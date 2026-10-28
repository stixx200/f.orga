import { Button, Group, NumberInput, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { fromLocalInput, toLocalInput, useTranslation } from '@forga/web-sdk';
import { ResponsiveDialog } from '@forga/web-ui';
import type { Content } from './editor';

export type VehicleEntry = Content['vehicles'][number];
type TimeKey = 'alarmedAt' | 'departedAt' | 'returnedAt';

/**
 * Own alarm, departure and return times and the kilometres of one vehicle of the report. Empty times (and times equal
 * to the report's) are stored as `null`: the vehicle then follows the report. Its crew follows the alarm (e.g. alerted
 * later) and the return of the vehicle; the departure only counts for the vehicle itself.
 */
export function VehicleDialog({ name, entry, times, disabled, onSave, onClose }: {
  name: string;
  entry: VehicleEntry;
  times: Content['times'];
  disabled: boolean;
  onSave: (entry: VehicleEntry) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation('incidents');
  const { t: common } = useTranslation('common');
  const [draft, setDraft] = useState<VehicleEntry>(entry);
  const defaults: Record<TimeKey, string> = {
    alarmedAt: times.alarmedAt,
    departedAt: times.departedAt ?? times.alarmedAt,
    returnedAt: times.returnedAt,
  };
  const own = Boolean(draft.alarmedAt || draft.departedAt || draft.returnedAt);
  const time = (key: TimeKey, description?: string) => (
    <TextInput
      label={t(`personnel.${key}`)}
      description={description}
      type="datetime-local"
      value={toLocalInput(draft[key] ?? defaults[key])}
      onChange={(e) => {
        const value = e.currentTarget.value ? fromLocalInput(e.currentTarget.value) : null;
        setDraft((d) => ({ ...d, [key]: value === defaults[key] ? null : value }));
      }}
      disabled={disabled}
    />
  );

  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('personnel.vehicleTimesTitle', { vehicle: name })}
      actions={
        <Group justify="space-between">
          {!disabled && own ? (
            <Button variant="subtle" onClick={() => setDraft((d) => ({ ...d, alarmedAt: null, departedAt: null, returnedAt: null }))}>{t('personnel.resetTimes')}</Button>
          ) : (
            <span />
          )}
          <Group>
            <Button variant="default" onClick={onClose}>{common(disabled ? 'actions.close' : 'actions.cancel')}</Button>
            {!disabled && <Button onClick={() => onSave(draft)}>{t('person.apply')}</Button>}
          </Group>
        </Group>
      }
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{t('personnel.vehicleTimesHint')}</Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          {time('alarmedAt', t('personnel.alarmedAtHint'))}
          {time('departedAt')}
          {time('returnedAt')}
        </SimpleGrid>
        <NumberInput
          label={t('personnel.kilometres')}
          value={draft.kilometres ?? ''}
          onChange={(value) => setDraft((d) => ({ ...d, kilometres: value === '' ? null : Math.max(0, Math.round(Number(value))) }))}
          min={0}
          allowDecimal={false}
          maw={240}
          disabled={disabled}
        />
      </Stack>
    </ResponsiveDialog>
  );
}
