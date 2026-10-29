import { Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { AccessLogEntry, AccessLogFilters } from '@forga/core-contracts';
import { api, formatDate, formatTime, useLocalized, useTranslation, withQuery } from '@forga/web-sdk';
import { DataTable } from '@forga/web-ui';
import { personLabel, usePersons } from './data';

/** Read log (L15) next to the audit log: accesses to especially protected data per user, person, area and day. */
export function AccessLogView() {
  const { t, i18n } = useTranslation('shell');
  const localized = useLocalized();
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const filters = { from, to, userId, area, personId };
  const { data: rows = [] } = useQuery({ queryKey: ['core', 'access-log', filters], queryFn: () => api<AccessLogEntry[]>(withQuery('core/access-log', filters)) });
  const { data: options } = useQuery({ queryKey: ['core', 'access-log', 'filters'], queryFn: () => api<AccessLogFilters>('core/access-log/filters') });
  const { data: persons = [] } = usePersons();
  // Without access to the person list the persons of the rows are offered.
  const personOptions = persons.length
    ? persons.map((p) => ({ value: p.id, label: personLabel(p) }))
    : [...new Map(rows.filter((r) => r.personId).map((r) => [r.personId!, r.personName ?? t('transparency.accessLog.unknownPerson')])).entries()].map(([value, label]) => ({ value, label }));
  return (
    <Stack gap="lg">
      <Text size="sm">{t('transparency.accessLog.intro')}</Text>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 5 }}>
        <DateInput label={t('transparency.accessLog.from')} value={from} onChange={setFrom} valueFormat="DD.MM.YYYY" clearable />
        <DateInput label={t('transparency.accessLog.to')} value={to} onChange={setTo} valueFormat="DD.MM.YYYY" clearable />
        <Select label={t('transparency.accessLog.user')} placeholder={t('transparency.accessLog.allUsers')} data={(options?.users ?? []).map((u) => ({ value: u.id, label: u.name }))} value={userId} onChange={setUserId} searchable clearable />
        <Select label={t('transparency.accessLog.area')} placeholder={t('transparency.accessLog.allAreas')} data={(options?.areas ?? []).map((a) => ({ value: a.key, label: localized(a.label) }))} value={area} onChange={setArea} searchable clearable />
        <Select label={t('transparency.accessLog.person')} placeholder={t('transparency.accessLog.personPlaceholder')} data={personOptions} value={personId} onChange={setPersonId} searchable clearable />
      </SimpleGrid>
      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        empty={t('transparency.accessLog.empty')}
        columns={[
          { key: 'day', header: t('transparency.accessLog.columns.day'), width: 120, render: (r) => formatDate(r.day, i18n.language) },
          { key: 'time', header: t('transparency.accessLog.columns.time'), width: 120, render: (r) => (r.count > 1 ? `${formatTime(r.firstAt, i18n.language)}–${formatTime(r.lastAt, i18n.language)}` : formatTime(r.lastAt, i18n.language)) },
          { key: 'user', header: t('transparency.accessLog.columns.user'), render: (r) => r.userName ?? t('audit.unknownUser') },
          { key: 'person', header: t('transparency.accessLog.columns.person'), render: (r) => (r.personId ? (r.personName ?? t('transparency.accessLog.unknownPerson')) : t('transparency.accessLog.allPersons')) },
          { key: 'area', header: t('transparency.accessLog.columns.area'), render: (r) => localized(r.areaLabel) },
          { key: 'count', header: t('transparency.accessLog.columns.count'), align: 'right', width: 100, render: (r) => r.count },
        ]}
      />
      <Text size="xs" c="dimmed">{t('transparency.accessLog.retention')}</Text>
    </Stack>
  );
}
