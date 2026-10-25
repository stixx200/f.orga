import { Button, Group, MultiSelect, NumberInput, SimpleGrid, Stack, TagsInput, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { BW_MEMBERSHIP_TEMPLATE, MEMBERSHIP_AGE_BOUNDS, MembershipSettings } from '@forga/masterdata-contracts';
import { send, useLocalized, useTranslation } from '@forga/web-sdk';
import { Notice, PageHeader, Panel, useAction } from '@forga/web-ui';
import { useCatalog, useMembershipRules } from '../api';

type Rules = MembershipSettings;
const AGES = ['minimumAgeYouth', 'minimumAgeOperational', 'minimumAgeIncidents', 'youthEndAge', 'veteransApplicationAge', 'ageLimitOperational'] as const;

function RulesForm({ value }: { value: Rules }) {
  const { t } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: qualifications = [] } = useCatalog('qualification');
  const [form, setForm] = useState(value);
  const [template, setTemplate] = useState(false);
  const set = <K extends keyof Rules>(key: K, v: Rules[K]) => setForm((f) => ({ ...f, [key]: v }));
  const save = useAction((rules: Rules) => send('PUT', 'core/settings/masterdata.membership', rules), {
    success: t('settings.saved'),
    invalidate: [['core', 'settings', 'masterdata.membership']],
  });
  const bounds = (key: (typeof AGES)[number] | 'probationMonths' | 'maxDeputies'): readonly [number, number] =>
    key === 'probationMonths' ? [0, 60] : key === 'maxDeputies' ? [0, 10] : MEMBERSHIP_AGE_BOUNDS[key];
  const outOfRange = (key: (typeof AGES)[number] | 'probationMonths' | 'maxDeputies') => form[key] < bounds(key)[0] || form[key] > bounds(key)[1];
  const number = (key: (typeof AGES)[number] | 'probationMonths' | 'maxDeputies') => (
    <NumberInput
      key={key}
      label={t(`settings.${key}`)}
      value={form[key]}
      onChange={(v) => set(key, Number(v) || 0)}
      min={bounds(key)[0]}
      max={bounds(key)[1]}
      allowNegative={false}
      allowDecimal={false}
      error={outOfRange(key) ? t('settings.range', { min: bounds(key)[0], max: bounds(key)[1] }) : undefined}
    />
  );
  const invalid = [...AGES, 'probationMonths', 'maxDeputies'].some((key) => outOfRange(key as (typeof AGES)[number]));
  return (
    <Stack gap="md">
      <Panel title={t('settings.admission')}>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {number('probationMonths')}
          <TextInput label={t('settings.admissionDecidedBy')} description={t('settings.admissionDecidedByHint')} value={form.admissionDecidedBy} onChange={(e) => set('admissionDecidedBy', e.currentTarget.value)} />
          <MultiSelect
            label={t('settings.probationQualifications')}
            description={t('settings.probationQualificationsHint')}
            data={qualifications.map((q) => ({ value: q.key, label: localized(q.name) }))}
            value={form.probationQualifications}
            onChange={(v) => set('probationQualifications', v)}
            searchable
            clearable
          />
        </SimpleGrid>
      </Panel>
      <Panel title={t('settings.ages')}>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>{AGES.map((key) => number(key))}</SimpleGrid>
      </Panel>
      <Panel title={t('settings.organization')}>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {number('maxDeputies')}
          <TagsInput
            label={t('settings.jubileeYears')}
            description={t('settings.jubileeYearsHint')}
            value={form.jubileeYears.map(String)}
            onChange={(v) => set('jubileeYears', [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n <= 100))].toSorted((a, b) => a - b))}
          />
        </SimpleGrid>
      </Panel>
      {template && <Notice kind="info">{t('settings.bwApplied')}</Notice>}
      <Group justify="space-between">
        <Group gap="xs">
          <Button variant="default" onClick={() => setForm(MembershipSettings.parse({}))}>{t('settings.reset')}</Button>
          {/* Template values, not legal advice: the user compares them with the own statute before saving. */}
          <Button
            variant="default"
            onClick={() => {
              setForm({ ...form, ...BW_MEMBERSHIP_TEMPLATE, probationQualifications: [...BW_MEMBERSHIP_TEMPLATE.probationQualifications] });
              setTemplate(true);
            }}
          >
            {t('settings.applyBw')}
          </Button>
        </Group>
        <Button loading={save.isPending} disabled={invalid} onClick={() => save.mutate(form)}>{common('actions.save')}</Button>
      </Group>
    </Stack>
  );
}

/** Administration: the rules of the local fire brigade statute (probation, ages, deputies, anniversaries). */
export function SettingsPage() {
  const { t } = useTranslation('masterdata');
  const { data, isSuccess } = useMembershipRules();
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('settings.title') }]} title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <Text size="sm" c="dimmed">{t('settings.hint')}</Text>
      {isSuccess && <RulesForm value={MembershipSettings.parse(data ?? {})} />}
    </Stack>
  );
}
