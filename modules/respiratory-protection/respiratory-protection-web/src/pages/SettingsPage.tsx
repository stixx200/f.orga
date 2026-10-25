import { Button, Checkbox, Group, NumberInput, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { FitnessRule } from '@forga/respiratory-protection-contracts';
import { send, useTranslation } from '@forga/web-sdk';
import { PageHeader, Panel, useAction } from '@forga/web-ui';
import { keys, useRule } from '../api';

const CONDITIONS = ['examination', 'briefing', 'stressExercise', 'exercise', 'chemicalSuit'] as const;

function RuleForm({ value }: { value: FitnessRule }) {
  const { t } = useTranslation('respiratory-protection');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState(value);
  const set = <K extends keyof FitnessRule>(key: K, v: FitnessRule[K]) => setForm((f) => ({ ...f, [key]: v }));
  const save = useAction((rule: FitnessRule) => send('PUT', 'core/settings/respiratory-protection.rule', rule), { success: t('settings.saved'), invalidate: [keys.rule, keys.all] });
  return (
    <Stack gap="md">
      <Panel title={t('settings.conditions')}>
        <Stack gap="xs">
          <Text size="sm" c="dimmed">{t('settings.conditionsHint')}</Text>
          {CONDITIONS.map((c) => <Checkbox key={c} label={t(`settings.condition.${c}`)} checked={form[c]} onChange={(e) => set(c, e.currentTarget.checked)} />)}
          <Checkbox label={t('settings.incidentReplacesExercise')} checked={form.incidentReplacesExercise} onChange={(e) => set('incidentReplacesExercise', e.currentTarget.checked)} disabled={!form.exercise} />
        </Stack>
      </Panel>
      <Panel title={t('settings.values')}>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <Select
            label={t('settings.window')}
            data={(['twelve-months', 'calendar-year'] as const).map((w) => ({ value: w, label: t(`settings.windows.${w}`) }))}
            value={form.window}
            onChange={(v) => v && set('window', v as FitnessRule['window'])}
            allowDeselect={false}
          />
          <Select
            label={t('settings.examinationInterval')}
            description={t('settings.examinationIntervalHint')}
            data={[{ value: 'by-age', label: t('settings.byAge') }, ...[1, 2, 3].map((y) => ({ value: String(y), label: t('settings.years', { count: y }) }))]}
            value={String(form.examinationInterval)}
            onChange={(v) => v && set('examinationInterval', v === 'by-age' ? 'by-age' : (Number(v) as 1 | 2 | 3))}
            allowDeselect={false}
          />
          <NumberInput label={t('settings.minKilojoules')} value={form.minKilojoules} onChange={(v) => set('minKilojoules', Number(v) || 0)} min={0} />
          <NumberInput label={t('settings.minKilojoulesFrom50', { age: form.olderFromAge })} value={form.minKilojoulesFrom50} onChange={(v) => set('minKilojoulesFrom50', Number(v) || 0)} min={0} />
          <NumberInput label={t('settings.minimumAge')} value={form.minimumAge} onChange={(v) => set('minimumAge', Number(v) || 0)} min={0} max={99} />
          <NumberInput label={t('settings.olderFromAge')} description={t('settings.olderFromAgeHint')} value={form.olderFromAge} onChange={(v) => set('olderFromAge', Number(v) || 0)} min={0} max={99} />
          <NumberInput label={t('settings.examinationMonths', { age: form.olderFromAge })} description={t('settings.examinationIntervalHint')} value={form.examinationMonths} onChange={(v) => set('examinationMonths', Number(v) || 1)} min={1} max={120} disabled={form.examinationInterval !== 'by-age'} />
          <NumberInput label={t('settings.examinationMonthsOlder', { age: form.olderFromAge })} value={form.examinationMonthsOlder} onChange={(v) => set('examinationMonthsOlder', Number(v) || 1)} min={1} max={120} disabled={form.examinationInterval !== 'by-age'} />
          <NumberInput label={t('settings.examinationMonthsOlderLight', { age: form.olderFromAge })} value={form.examinationMonthsOlderLight} onChange={(v) => set('examinationMonthsOlderLight', Number(v) || 1)} min={1} max={120} disabled={form.examinationInterval !== 'by-age'} />
          <NumberInput label={t('settings.trackKilojoules')} description={t('settings.trackHint')} value={form.trackKilojoules ?? ''} onChange={(v) => set('trackKilojoules', v === '' ? null : Number(v))} min={0} max={1000} />
          <NumberInput label={t('settings.trackMinutes')} description={t('settings.trackHint')} value={form.trackMinutes ?? ''} onChange={(v) => set('trackMinutes', v === '' ? null : Number(v))} min={0} max={1440} />
          <NumberInput label={t('settings.leadDays')} description={t('settings.leadDaysHint')} value={form.leadDays} onChange={(v) => set('leadDays', Number(v) || 0)} min={0} max={365} />
        </SimpleGrid>
      </Panel>
      <Group justify="space-between">
        <Button variant="default" onClick={() => setForm(FitnessRule.parse({}))}>{t('settings.reset')}</Button>
        <Button loading={save.isPending} onClick={() => save.mutate(form)}>{common('actions.save')}</Button>
      </Group>
    </Stack>
  );
}

/** Administration: the fitness rule (default per FwDV 7). */
export function SettingsPage() {
  const { t } = useTranslation('respiratory-protection');
  const { data, isSuccess } = useRule();
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('settings.title') }]} title={t('settings.title')} subtitle={t('settings.subtitle')} />
      {isSuccess && <RuleForm value={FitnessRule.parse(data ?? {})} />}
    </Stack>
  );
}
