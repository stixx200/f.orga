import { Button, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { Link } from 'react-router';
import type { Incident } from '@forga/incidents-contracts';
import { formatDateTime, fromLocalInput, toLocalInput, useLocalized, useTranslation } from '@forga/web-sdk';
import { Panel } from '@forga/web-ui';
import { personName, useKeywords, usePersons } from '../api';
import { locationLabel } from '../parts';
import type { Content } from './editor';

type Times = Content['times'];

/** Duration as "2 h 43 min → 3 started hours". */
function durationText(times: Times, t: (key: string, options?: Record<string, unknown>) => string): string {
  const minutes = Math.round((new Date(times.returnedAt).getTime() - new Date(times.alarmedAt).getTime()) / 60_000);
  if (!(minutes > 0)) return '';
  return t('times.duration', { hours: Math.floor(minutes / 60), minutes: minutes % 60, started: Math.ceil(minutes / 60) });
}

export function TimesSection({ content, incident, departmentId, update, disabled }: {
  content: Content;
  incident: Incident;
  departmentId: string;
  update: (change: (c: Content) => Content) => void;
  disabled: boolean;
}) {
  const { t, i18n } = useTranslation('incidents');
  const localized = useLocalized();
  const { data: keywords = [] } = useKeywords();
  const { data: persons = [] } = usePersons();
  const keyword = keywords.find((k) => k.key === incident.alarmKeyword);
  const setTime = (key: keyof Times, value: string, required: boolean) => {
    if (!value && required) return;
    update((c) => ({ ...c, times: { ...c.times, [key]: value ? fromLocalInput(value) : null } }));
  };
  const field = (key: keyof Times, required = false, description?: string) => (
    <TextInput
      label={t(`times.${key}`)}
      type="datetime-local"
      value={toLocalInput(content.times[key])}
      onChange={(e) => setTime(key, e.currentTarget.value, required)}
      required={required}
      description={description}
      disabled={disabled}
    />
  );
  const authors = persons.filter((p) => p.departmentIds.includes(departmentId) || p.id === content.authorPersonId);

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      <Panel title={t('times.title')}>
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          {field('alarmedAt', true)}
          {field('departedAt')}
          {field('arrivedAt')}
          {field('endedAt')}
          {field('returnedAt', true, durationText(content.times, t))}
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt="sm">{t('times.hint')}</Text>
      </Panel>
      <Panel title={t('times.incident')}>
        <Stack gap="xs">
          <Text size="sm"><Text span c="dimmed">{t('fields.keyword')}: </Text>{incident.alarmKeyword}{keyword ? ` – ${localized(keyword.name)}` : ''}</Text>
          <Text size="sm"><Text span c="dimmed">{t('fields.alarmedAt')}: </Text>{formatDateTime(incident.alarmedAt, i18n.language)}</Text>
          <Text size="sm"><Text span c="dimmed">{t('fields.location')}: </Text>{locationLabel(incident) || '–'}</Text>
          <Text size="sm"><Text span c="dimmed">{t('fields.dispatchNumber')}: </Text>{incident.dispatchNumber}</Text>
          <Button component={Link} to={`/incidents/incidents/${incident.id}`} variant="subtle" size="xs" px={0} style={{ alignSelf: 'flex-start' }}>
            {t('times.editIncident')}
          </Button>
          <Select
            label={t('report.author')}
            data={authors.map((p) => ({ value: p.id, label: personName(p) }))}
            value={content.authorPersonId}
            onChange={(value) => update((c) => ({ ...c, authorPersonId: value }))}
            searchable
            clearable
            disabled={disabled}
          />
        </Stack>
      </Panel>
    </SimpleGrid>
  );
}
