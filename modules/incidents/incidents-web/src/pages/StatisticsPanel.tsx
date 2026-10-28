import { Button, Checkbox, Group, NumberInput, Radio, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { type Incident, type IncidentStatisticsInput, TechnicalCategory } from '@forga/incidents-contracts';
import { send, useTranslation } from '@forga/web-sdk';
import { Notice, Panel, useAction } from '@forga/web-ui';
import { keys } from '../api';

type Statistics = IncidentStatisticsInput;

/** Statistics as the server accepts them, or `null` while required answers are missing. */
export function completeStatistics(s: Statistics | null): Statistics | null {
  if (!s?.mainType) return null;
  if (s.mainType === 'fire' && !s.fireSize) return null;
  if (s.mainType === 'technical-assistance' && !s.technicalCategory) return null;
  if (s.mainType === 'false-alarm' && !s.falseAlarmType) return null;
  if ((s.rescuedSmokeInhalation ?? 0) > (s.rescued ?? 0)) return null;
  return s;
}

/**
 * Statistics of the incident: once per incident, not per report. The writers of its reports enter them while one of
 * their reports is a draft, releasers until the annual statistics of the year are closed. Changes are saved once all
 * required answers are given.
 */
export function StatisticsPanel({ incident }: { incident: Incident }) {
  const { t } = useTranslation('incidents');
  const { t: common } = useTranslation('common');
  const [draft, setDraft] = useState<Statistics | null>(null);
  const save = useAction(
    (statistics: Statistics | null) => send<Incident>('PUT', `incidents/incidents/${incident.id}/statistics`, { statistics, version: incident.version }),
    {
      success: t('statistics.saved'),
      // The findings of the primary report depend on the statistics of the incident.
      invalidate: [keys.incidents, ['incidents', 'reports']],
      onSuccess: () => setDraft(null),
    },
  );
  const editable = incident.statisticsEditable;
  const disabled = !editable;
  const suggestion = incident.statisticsSuggestion;

  if (!incident.statisticsCounted && !incident.statistics) {
    return (
      <Panel title={t('statistics.title')}>
        <Text size="sm">{t('statistics.notCounted')}</Text>
      </Panel>
    );
  }

  const value: Statistics | null = draft ?? incident.statistics ?? null;
  const change = (patch: Partial<Statistics>) => {
    const base: Statistics = value ?? { mainType: suggestion?.mainType ?? 'fire', ownMunicipality: suggestion?.ownMunicipality ?? true };
    setDraft({ ...base, ...patch } as Statistics);
  };
  const accept = () => {
    if (!suggestion) return;
    change({
      ownMunicipality: suggestion.ownMunicipality,
      mainType: suggestion.mainType ?? 'other',
      technicalCategory: suggestion.technicalCategory,
      falseAlarmType: suggestion.falseAlarmType,
    });
  };
  const count = (key: 'rescued' | 'rescuedSmokeInhalation' | 'dead' | 'animalsRescued', hint?: string) => (
    <NumberInput label={t(`statistics.${key}`)} description={hint} value={value?.[key] ?? 0} onChange={(v) => change({ [key]: Number(v) || 0 })} min={0} disabled={disabled || !value} />
  );
  const complete = draft ? completeStatistics(draft) : null;

  return (
    <Panel title={t('statistics.title')}>
      <Stack gap="lg">
        <Text size="xs" c="dimmed">{t(editable ? 'statistics.hint' : 'statistics.readOnly')}</Text>
        {!incident.statisticsCounted && <Notice kind="info">{t('statistics.notCounted')}</Notice>}
        {!incident.statistics && !draft && suggestion && (
          <Notice kind="info" action={editable && <Button size="xs" variant="outline" onClick={accept}>{t('statistics.accept')}</Button>}>
            {t('statistics.suggestion', {
              mainType: suggestion.mainType ? t(`statistics.mainTypes.${suggestion.mainType}`) : '–',
              place: t(suggestion.ownMunicipality ? 'statistics.own' : 'statistics.overland'),
            })}
          </Notice>
        )}
        {draft && !complete && <Notice kind="error">{t('statistics.incomplete')}</Notice>}
        <Radio.Group label={t('statistics.place')} value={value ? String(value.ownMunicipality ?? true) : ''} onChange={(v) => change({ ownMunicipality: v === 'true' })}>
          <Group mt={4}>
            <Radio value="true" label={t('statistics.own')} disabled={disabled} />
            <Radio value="false" label={t('statistics.overland')} disabled={disabled} />
          </Group>
        </Radio.Group>
        <Radio.Group label={t('statistics.mainType')} description={t('statistics.mainTypeHint')} value={value?.mainType ?? ''} onChange={(v) => change({ mainType: v as Statistics['mainType'], fireSize: null, technicalCategory: null, falseAlarmType: null })}>
          <Group mt={4}>
            {(['fire', 'technical-assistance', 'false-alarm', 'other'] as const).map((m) => <Radio key={m} value={m} label={t(`statistics.mainTypes.${m}`)} disabled={disabled} />)}
          </Group>
        </Radio.Group>
        {value?.mainType === 'fire' && (
          <Radio.Group label={t('statistics.fireSize')} value={value.fireSize ?? ''} onChange={(v) => change({ fireSize: v as Statistics['fireSize'] })}>
            <SimpleGrid cols={{ base: 1, sm: 2 }} mt={4}>
              {(['small-a', 'small-b', 'medium', 'large'] as const).map((s) => (
                <Radio key={s} value={s} label={t(`statistics.fireSizes.${s}`)} description={t(`statistics.fireSizeHints.${s}`)} disabled={disabled} />
              ))}
            </SimpleGrid>
          </Radio.Group>
        )}
        {value?.mainType === 'technical-assistance' && (
          <Radio.Group label={t('statistics.technicalCategory')} description={t('statistics.technicalHint')} value={value.technicalCategory ?? ''} onChange={(v) => change({ technicalCategory: v as Statistics['technicalCategory'] })}>
            <SimpleGrid cols={{ base: 1, sm: 2 }} mt={4}>
              {TechnicalCategory.options.map((c, i) => <Radio key={c} value={c} label={`${i + 1} ${t(`statistics.technical.${c}`)}`} disabled={disabled} />)}
            </SimpleGrid>
          </Radio.Group>
        )}
        {value?.mainType === 'false-alarm' && (
          <Radio.Group label={t('statistics.falseAlarmType')} value={value.falseAlarmType ?? ''} onChange={(v) => change({ falseAlarmType: v as Statistics['falseAlarmType'] })}>
            <Group mt={4}>
              {(['good-faith', 'malicious', 'fire-alarm-system'] as const).map((f) => <Radio key={f} value={f} label={t(`statistics.falseAlarm.${f}`)} disabled={disabled} />)}
            </Group>
          </Radio.Group>
        )}
        <div>
          <Title order={3} size="h5" mb={4}>{t('statistics.flags')}</Title>
          <Group>
            {(['vehicleFire', 'trafficAccident', 'disasterPreAlarm', 'disasterOperation'] as const).map((flag) => (
              <Checkbox key={flag} label={t(`statistics.${flag}`)} checked={value?.[flag] ?? false} onChange={(e) => change({ [flag]: e.currentTarget.checked })} disabled={disabled || !value} />
            ))}
          </Group>
        </div>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
          {count('rescued')}
          {count('rescuedSmokeInhalation', t('statistics.smokeHint'))}
          {count('dead')}
          {count('animalsRescued')}
        </SimpleGrid>
        <Text size="xs" c="dimmed">{t('statistics.ownForces')}</Text>
        {editable && (
          <Group justify="flex-end">
            {incident.statistics && <Button variant="subtle" loading={save.isPending} onClick={() => save.mutate(null)}>{t('statistics.remove')}</Button>}
            {draft && <Button variant="default" onClick={() => setDraft(null)}>{common('actions.cancel')}</Button>}
            <Button disabled={!complete} loading={save.isPending} onClick={() => complete && save.mutate(complete)}>{t('statistics.save')}</Button>
          </Group>
        )}
      </Stack>
    </Panel>
  );
}
