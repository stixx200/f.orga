import { Group, Select, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { PersonAssignment } from '@forga/incidents-contracts';
import { api, formatDateTime, formatMoney, useTranslation } from '@forga/web-sdk';
import { DataTable, Panel } from '@forga/web-ui';
import { ReportStatusBadge } from '../parts';

/** Tab "Einsätze" in the person file of the master data module (extension point `masterdata.person.tab`). */
export function PersonIncidents({ personId }: { personId?: unknown }) {
  const { t, i18n } = useTranslation('incidents');
  const [thisYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState(String(thisYear));
  const { data = [], isLoading } = useQuery({
    queryKey: ['incidents', 'persons', personId, 'assignments', year],
    queryFn: () => api<PersonAssignment[]>(`incidents/persons/${String(personId)}/assignments?year=${year}`),
  });
  const hours = data.reduce((sum, a) => sum + a.hours, 0);
  const amount = data.reduce((sum, a) => sum + a.amount, 0);

  return (
    <Panel
      title={t('person.incidentsTitle', { year })}
      aside={<Text size="sm" c="dimmed">{t('person.incidentsSummary', { count: data.length, hours, amount: formatMoney(amount, i18n.language) })}</Text>}
    >
      <Stack gap="sm">
        <Group>
          <Select aria-label={t('incidents.year')} data={[0, 1, 2, 3].map((i) => String(thisYear - i))} value={year} onChange={(v) => v && setYear(v)} allowDeselect={false} w={120} />
        </Group>
        <DataTable<PersonAssignment>
          rows={data}
          rowKey={(a) => `${a.reportId}-${a.from}`}
          empty={isLoading ? t('loading') : t('person.noIncidents')}
          columns={[
            { key: 'date', header: t('fields.alarmedAt'), render: (a) => formatDateTime(a.from, i18n.language) },
            {
              key: 'keyword',
              header: t('fields.keyword'),
              render: (a) => (
                <Text component={Link} to={`/incidents/reports/${a.reportId}`} size="sm" fw={700} c="brand">{`${a.alarmKeyword} · ${a.dispatchNumber}`}</Text>
              ),
            },
            { key: 'department', header: t('fields.department'), render: (a) => a.department + (a.standby ? ` · ${t('personnel.standby')}` : '') },
            { key: 'status', header: t('fields.status'), render: (a) => <ReportStatusBadge status={a.status} /> },
            { key: 'hours', header: t('person.hours'), align: 'right', render: (a) => a.hours },
            { key: 'amount', header: t('person.amount'), align: 'right', render: (a) => formatMoney(a.amount, i18n.language) },
          ]}
        />
      </Stack>
    </Panel>
  );
}
