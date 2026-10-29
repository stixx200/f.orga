import { Button, Group, NumberInput, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { useState } from 'react';
import type { InfoTerminalSettings } from '@forga/info-terminal-contracts';
import { send, useTranslation } from '@forga/web-sdk';
import { PageHeader, Panel, useAction } from '@forga/web-ui';
import { SETTINGS_KEY, useSettings } from '../api';

type Field = Exclude<keyof InfoTerminalSettings, 'searchAllPersons'>;
const FIELDS: { key: Field; min: number; max: number }[] = [
  { key: 'afterEndMinutes', min: 0, max: 1440 },
  { key: 'openEndHours', min: 1, max: 48 },
  { key: 'maxAlarmAgeHours', min: 1, max: 48 },
  { key: 'idleSeconds', min: 15, max: 600 },
  { key: 'notSeenWarningDays', min: 1, max: 365 },
];

function SettingsForm({ initial }: { initial: InfoTerminalSettings }) {
  const { t } = useTranslation('info-terminal');
  const [form, setForm] = useState(initial);
  const save = useAction((value: InfoTerminalSettings) => send('PUT', 'core/settings/info-terminal.general', value), { success: t('settings.saved'), invalidate: [SETTINGS_KEY] });
  const invalid = form.maxAlarmAgeHours > form.openEndHours;
  return (
    <Panel title={t('settings.windows')} maw={760}>
      <Stack gap="md">
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {FIELDS.map(({ key, min, max }) => (
            <NumberInput
              key={key}
              label={t(`settings.${key}`)}
              description={t(`settings.${key}Hint`)}
              value={form[key]}
              min={min}
              max={max}
              allowDecimal={false}
              error={key === 'maxAlarmAgeHours' && invalid ? t('settings.maxAlarmAgeInvalid') : undefined}
              onChange={(value) => setForm((f) => ({ ...f, [key]: Number(value) || min }))}
            />
          ))}
        </SimpleGrid>
        <Switch
          label={t('settings.searchAllPersons')}
          description={t('settings.searchAllPersonsHint')}
          checked={form.searchAllPersons}
          onChange={(e) => setForm((f) => ({ ...f, searchAllPersons: e.currentTarget.checked }))}
        />
        <Text size="sm" c="dimmed">{t('settings.hint')}</Text>
        <Group justify="flex-end">
          <Button loading={save.isPending} disabled={invalid} onClick={() => save.mutate(form)}>{t('settings.save')}</Button>
        </Group>
      </Stack>
    </Panel>
  );
}

/** Settings `info-terminal.general`: booking windows, idle time, warning for terminals not seen. */
export function SettingsPage() {
  const { t } = useTranslation('info-terminal');
  const { data } = useSettings();
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('administration') }, { label: t('module') }]} title={t('settings.title')} />
      {data && <SettingsForm initial={data} />}
    </Stack>
  );
}
