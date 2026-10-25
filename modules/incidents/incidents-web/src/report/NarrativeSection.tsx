import { Autocomplete, Checkbox, Group, SimpleGrid, Stack, Switch, Textarea, TextInput } from '@mantine/core';
import { useTranslation } from '@forga/web-sdk';
import { Panel } from '@forga/web-ui';
import { personName, usePersons } from '../api';
import type { Content } from './editor';

const CONDITIONS = ['rain', 'snow', 'ice', 'storm', 'heat', 'thunderstorm', 'fog'] as const;

export function NarrativeSection({ content, update, disabled }: { content: Content; update: (change: (c: Content) => Content) => void; disabled: boolean }) {
  const { t } = useTranslation('incidents');
  const { data: persons = [] } = usePersons();
  const inReport = new Set(content.personnel.flatMap((p) => (p.personId ? [p.personId] : [])));
  const commanders = persons.filter((p) => inReport.has(p.id)).map(personName);
  const set = <K extends keyof Content>(key: K, value: Content[K]) => update((c) => ({ ...c, [key]: value }));

  return (
    <Panel>
      <Stack gap="md">
        <Textarea label={t('narrative.situation')} value={content.situation} onChange={(e) => set('situation', e.currentTarget.value)} autosize minRows={3} disabled={disabled} required />
        <Textarea label={t('narrative.actions')} value={content.actions} onChange={(e) => set('actions', e.currentTarget.value)} autosize minRows={4} disabled={disabled} required />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label={t('narrative.cause')} value={content.cause} onChange={(e) => set('cause', e.currentTarget.value)} disabled={disabled} />
          <Autocomplete label={t('narrative.commander')} data={commanders} value={content.incidentCommander} onChange={(value) => set('incidentCommander', value)} disabled={disabled} />
        </SimpleGrid>
        <Switch
          label={t('narrative.weatherInfluence')}
          checked={content.weather.influence}
          onChange={(e) => set('weather', { ...content.weather, influence: e.currentTarget.checked })}
          disabled={disabled}
        />
        {content.weather.influence && (
          <Checkbox.Group value={content.weather.conditions} onChange={(value) => set('weather', { ...content.weather, conditions: value as Content['weather']['conditions'] })}>
            <Group>
              {CONDITIONS.map((c) => <Checkbox key={c} value={c} label={t(`narrative.weather.${c}`)} disabled={disabled} />)}
            </Group>
          </Checkbox.Group>
        )}
      </Stack>
    </Panel>
  );
}
