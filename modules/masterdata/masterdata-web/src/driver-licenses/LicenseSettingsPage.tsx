import { Button, Checkbox, Group, List, MultiSelect, Radio, Select, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { useState } from 'react';
import { DriverLicenseSettings, LICENSE_CLASSES } from '@forga/masterdata-contracts';
import { send, useLocalized, useTranslation } from '@forga/web-sdk';
import { Notice, PageHeader, Panel, useAction } from '@forga/web-ui';
import { useCatalog } from '../api';
import { licenseKeys, useLicenseSettings } from './api';

const months = (values: number[], current: number) => [...new Set([...values, current])].toSorted((a, b) => a - b).map(String);

function SettingsForm({ value }: { value: DriverLicenseSettings }) {
  const { t } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: qualifications = [] } = useCatalog('qualification');
  const [form, setForm] = useState(value);
  const set = <K extends keyof DriverLicenseSettings>(key: K, v: DriverLicenseSettings[K]) => setForm((f) => ({ ...f, [key]: v }));
  const periodic = form.mode === 'periodic';
  const save = useAction((settings: DriverLicenseSettings) => send('PUT', 'core/settings/masterdata.driverLicense', settings), {
    success: t('settings.saved'),
    invalidate: [licenseKeys.settings, licenseKeys.all],
  });
  const monthLabel = (m: string) => t('licenses.settings.months', { count: Number(m) });

  return (
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg" style={{ alignItems: 'start' }}>
      <Stack gap="md" style={{ gridColumn: 'span 2' }}>
        <Panel title={t('licenses.settings.when')}>
          <Stack gap="sm">
            <Radio.Group value={form.mode} onChange={(v) => set('mode', v as DriverLicenseSettings['mode'])}>
              <Stack gap="xs">
                <Radio value="on-occasion" label={t('licenses.settings.onOccasion')} description={t('licenses.settings.onOccasionHint')} />
                <Radio value="periodic" label={t('licenses.settings.periodic')} description={t('licenses.settings.periodicHint')} />
              </Stack>
            </Radio.Group>
            {periodic && <Notice kind="warning">{t('licenses.settings.dguv')}</Notice>}
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Select
                label={t('licenses.settings.interval')}
                data={months([6, 12], form.intervalMonths).map((m) => ({ value: m, label: monthLabel(m) }))}
                value={String(form.intervalMonths)}
                onChange={(v) => v && set('intervalMonths', Number(v))}
                disabled={!periodic}
                allowDeselect={false}
              />
              <Select
                label={t('licenses.settings.leadDays')}
                data={[...new Set([14, 30, 60, form.leadDays])].toSorted((a, b) => a - b).map((d) => ({ value: String(d), label: t('licenses.settings.days', { count: d }) }))}
                value={String(form.leadDays)}
                onChange={(v) => v && set('leadDays', Number(v))}
                allowDeselect={false}
              />
            </SimpleGrid>
            <Notice kind="info">{t('licenses.settings.source')}</Notice>
          </Stack>
        </Panel>
        <Panel title={t('licenses.settings.who')}>
          <Stack gap="sm">
            <MultiSelect
              label={t('licenses.settings.monitoredClasses')}
              description={t('licenses.settings.monitoredClassesHint')}
              data={[...new Set([...LICENSE_CLASSES, ...form.monitoredClasses])]}
              value={form.monitoredClasses}
              onChange={(v) => set('monitoredClasses', v)}
              searchable
            />
            <MultiSelect
              label={t('licenses.settings.driverQualifications')}
              description={t('licenses.settings.driverQualificationsHint')}
              data={qualifications.map((q) => ({ value: q.key, label: localized(q.name) }))}
              value={form.driverQualifications}
              onChange={(v) => set('driverQualifications', v)}
              searchable
              clearable
            />
            <Text size="xs" c="dimmed">{t('licenses.settings.statuses')}</Text>
          </Stack>
        </Panel>
        <Panel title={t('licenses.settings.selfCheck')}>
          <Stack gap="sm">
            <Text size="sm" c="dimmed">{t('licenses.settings.selfCheckText')}</Text>
            <Switch label={t('licenses.settings.selfCheckAllow')} checked={periodic && form.selfCheck} onChange={(e) => set('selfCheck', e.currentTarget.checked)} disabled={!periodic} />
            <Checkbox label={t('licenses.settings.atTerminal')} checked disabled readOnly />
            <Select
              label={t('licenses.settings.inPersonEvery')}
              description={t('licenses.settings.inPersonEveryHint')}
              data={months([6, 12, 24], form.inPersonEveryMonths).map((m) => ({ value: m, label: monthLabel(m) }))}
              value={String(form.inPersonEveryMonths)}
              onChange={(v) => v && set('inPersonEveryMonths', Number(v))}
              disabled={!periodic || !form.selfCheck}
              allowDeselect={false}
            />
            <Notice kind="warning">{t('licenses.settings.limits')}</Notice>
          </Stack>
        </Panel>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setForm(DriverLicenseSettings.parse({}))}>{t('settings.reset')}</Button>
          <Button loading={save.isPending} disabled={!form.monitoredClasses.length && !form.driverQualifications.length} onClick={() => save.mutate({ ...form, selfCheck: periodic && form.selfCheck })}>{common('actions.save')}</Button>
        </Group>
      </Stack>
      <Panel title={t('licenses.settings.result')}>
        <Stack gap="sm">
          <List spacing="xs" size="sm">
            {(['first', 'expiry', 'request', 'interval'] as const).map((k) => (
              <List.Item key={k}>
                <Text size="sm" fw={700}>{t(`licenses.settings.results.${k}`)}</Text>
                <Text size="xs" c="dimmed">{t(`licenses.settings.results.${k}Hint`)}</Text>
              </List.Item>
            ))}
          </List>
          <Text size="xs" c="dimmed">{t('licenses.settings.responsible')}</Text>
        </Stack>
      </Panel>
    </SimpleGrid>
  );
}

/** Administration → Modules → master data: when and whose driving licences are checked, and self-checks. */
export function LicenseSettingsPage() {
  const { t } = useTranslation('masterdata');
  const { data, isSuccess } = useLicenseSettings();
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('licenses.settings.title') }]} title={t('licenses.settings.title')} />
      {isSuccess && <SettingsForm value={DriverLicenseSettings.parse(data ?? {})} />}
    </Stack>
  );
}
