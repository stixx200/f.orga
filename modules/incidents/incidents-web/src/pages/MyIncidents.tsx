import { Group, Select, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { MyIncidents as MyIncidentsData, PersonAssignment } from '@forga/incidents-contracts';
import { api, formatDateTime, useTranslation } from '@forga/web-sdk';
import { DataTable, Panel } from '@forga/web-ui';
import { ReportStatusBadge } from '../parts';

/** "My area": the own incidents of a year with hours (extension point `core.me.sections`, always the own person). */
export function MyIncidents() {
  const { t, i18n } = useTranslation('incidents');
  const [thisYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState(String(thisYear));
  const { data, isLoading } = useQuery({
    queryKey: ['incidents', 'me', year],
    queryFn: () => api<MyIncidentsData>(`incidents/me?year=${year}`),
  });
  const hours = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(data?.hours ?? 0);

  return (
    <Panel title={t('me.title', { year })} aside={data && <Text size="sm" c="dimmed">{t('me.summary', { count: data.incidents, hours })}</Text>}>
      <Stack gap="sm">
        <Group>
          <Select aria-label={t('incidents.year')} data={[0, 1, 2, 3].map((i) => String(thisYear - i))} value={year} onChange={(v) => v && setYear(v)} allowDeselect={false} w={120} />
        </Group>
        <DataTable<PersonAssignment>
          exportable={false}
          rows={data?.assignments ?? []}
          rowKey={(a) => `${a.reportId}-${a.from}`}
          empty={isLoading ? t('loading') : t('person.noIncidents')}
          columns={[
            { key: 'date', header: t('fields.alarmedAt'), render: (a) => formatDateTime(a.from, i18n.language) },
            { key: 'keyword', header: t('fields.keyword'), render: (a) => <Text size="sm" fw={700}>{`${a.alarmKeyword} · ${a.dispatchNumber}`}</Text> },
            { key: 'department', header: t('fields.department'), render: (a) => a.department + (a.standby ? ` · ${t('personnel.standby')}` : '') },
            { key: 'status', header: t('fields.status'), render: (a) => <ReportStatusBadge status={a.status} /> },
            { key: 'hours', header: t('person.hours'), align: 'right', render: (a) => a.hours },
          ]}
        />
      </Stack>
    </Panel>
  );
}
