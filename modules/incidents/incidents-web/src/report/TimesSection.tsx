import { Button, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { Link } from 'react-router';
import type { Incident } from '@forga/incidents-contracts';
import { formatDateTime, fromLocalInput, toLocalInput, useLocalized, useTranslation } from '@forga/web-sdk';
import { Notice, Panel } from '@forga/web-ui';
import { personName, type ReportOwner, useAuthors, useKeywords, usePersons } from '../api';
import { locationLabel } from '../parts';
import type { Content } from './editor';

type Times = Content['times'];

/** Duration as "2 h 43 min → 3 started hours". */
function durationText(times: Times, t: (key: string, options?: Record<string, unknown>) => string): string {
  const minutes = Math.round((new Date(times.returnedAt).getTime() - new Date(times.alarmedAt).getTime()) / 60_000);
  if (!(minutes > 0)) return '';
  return t('times.duration', { hours: Math.floor(minutes / 60), minutes: minutes % 60, started: Math.ceil(minutes / 60) });
}

export function TimesSection({ content, incident, owner, update, disabled }: {
  content: Content;
  incident: Incident;
  /** Department or brigade-wide unit of the report. */
  owner: ReportOwner;
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
    // Changing the end confirms it; the default (alarm + 1 h) stays unconfirmed until then.
    update((c) => ({ ...c, endConfirmed: c.endConfirmed || key === 'returnedAt', times: { ...c.times, [key]: value ? fromLocalInput(value) : null } }));
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
  // Only persons who can write the report (account with permission) are offered; others would never see it.
  const { data: writers } = useAuthors(disabled ? null : owner);
  const candidates = writers ? new Set(writers) : null;
  const member = (p: (typeof persons)[number]) => (owner.departmentId ? p.departmentIds.includes(owner.departmentId) : false);
  const authors = persons.filter((p) => (candidates ? candidates.has(p.id) : member(p)) || p.id === content.authorPersonId);
  const authorCannotWrite = Boolean(candidates && content.authorPersonId && !candidates.has(content.authorPersonId));

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
      <Panel title={t('times.title')}>
        <SimpleGrid cols={{ base: 1, xl: 2 }}>
          {field('alarmedAt', true)}
          {field('departedAt')}
          {field('arrivedAt')}
          {field('endedAt')}
          {field('returnedAt', true, durationText(content.times, t))}
        </SimpleGrid>
        {!content.endConfirmed && (
          <Stack mt="sm">
            <Notice kind="warning" action={!disabled && <Button size="xs" variant="outline" onClick={() => update((c) => ({ ...c, endConfirmed: true }))}>{t('times.confirmEnd')}</Button>}>
              {t('times.endUnconfirmed')}
            </Notice>
          </Stack>
        )}
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
            error={authorCannotWrite ? t('report.authorCannotWrite') : undefined}
          />
        </Stack>
      </Panel>
    </SimpleGrid>
  );
}
