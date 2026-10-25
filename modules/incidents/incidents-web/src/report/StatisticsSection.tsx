import { Button, Checkbox, Group, NumberInput, Radio, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';
import { type IncidentStatisticsInput, type Report, TechnicalCategory } from '@forga/incidents-contracts';
import { useTranslation } from '@forga/web-sdk';
import { Notice, Panel } from '@forga/web-ui';
import { completeStatistics, type Content } from './editor';

type Statistics = IncidentStatisticsInput;

/**
 * Statistics of the primary report. Changes are saved with the report once all required answers are given; an
 * unfinished change is shown as an error of the step. Releasers change the statistics of a released report
 * separately (`onSaveSeparately`), without releasing it again.
 */
export function StatisticsSection({ content, report, draft, setDraft, update, disabled, primaryReportId, onSaveSeparately, saving }: {
  content: Content;
  report: Report;
  draft: Statistics | null;
  setDraft: (value: Statistics | null) => void;
  update: (change: (c: Content) => Content) => void;
  disabled: boolean;
  primaryReportId?: string;
  onSaveSeparately?: (statistics: Statistics) => void;
  saving?: boolean;
}) {
  const { t } = useTranslation('incidents');
  if (!report.primary) {
    return (
      <Notice kind="info" action={primaryReportId && <Button component={Link} to={`/incidents/reports/${primaryReportId}`} size="xs" variant="outline">{t('statistics.openPrimary')}</Button>}>
        {t('statistics.secondary')}
      </Notice>
    );
  }
  const suggestion = report.statisticsSuggestion;
  const value: Statistics | null = draft ?? content.statistics ?? null;
  const change = (patch: Partial<Statistics>) => {
    const base: Statistics = value ?? { mainType: suggestion?.mainType ?? 'fire', ownMunicipality: suggestion?.ownMunicipality ?? true };
    const next = { ...base, ...patch } as Statistics;
    setDraft(next);
    const complete = completeStatistics(next);
    if (complete && !onSaveSeparately) update((c) => ({ ...c, statistics: complete }));
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
  const incomplete = value && !completeStatistics(value);
  const separate = onSaveSeparately && draft && completeStatistics(draft);

  return (
    <Stack gap="md">
      {!content.statistics && suggestion && (
        <Notice kind="info" action={!disabled && <Button size="xs" variant="outline" onClick={accept}>{t('statistics.accept')}</Button>}>
          {t('statistics.suggestion', {
            mainType: suggestion.mainType ? t(`statistics.mainTypes.${suggestion.mainType}`) : '–',
            place: t(suggestion.ownMunicipality ? 'statistics.own' : 'statistics.overland'),
          })}
        </Notice>
      )}
      {incomplete && <Notice kind="error">{t('statistics.incomplete')}</Notice>}
      {onSaveSeparately && (
        <Notice kind="info" action={<Button size="xs" disabled={!separate} loading={saving} onClick={() => separate && onSaveSeparately(separate)}>{t('statistics.save')}</Button>}>
          {t('statistics.separateHint')}
        </Notice>
      )}
      <Panel>
        <Stack gap="lg">
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
        </Stack>
      </Panel>
    </Stack>
  );
}
