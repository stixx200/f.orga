import { Group, Progress, Select, Stack, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Participation } from '@forga/training-contracts';
import { api, withQuery, useTranslation } from '@forga/web-sdk';
import { DataTable, PageHeader } from '@forga/web-ui';
import { personName, useDepartments, usePersons } from '../api';

type Row = Participation & { name: string };

/** Participation rate per person in a period: base for honours, promotions and the annual report. */
export function ParticipationPage() {
  const { t } = useTranslation('training');
  const [year] = useState(() => new Date().getFullYear());
  const [from, setFrom] = useState<string | null>(`${year}-01-01`);
  const [to, setTo] = useState<string | null>(`${year}-12-31`);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const { data: departments = [] } = useDepartments();
  const { data: persons = [] } = usePersons();
  const filter = { from: from ?? undefined, to: to ?? undefined, departmentId: departmentId ?? undefined };
  const { data = [], isLoading } = useQuery({ queryKey: ['training', 'participation', filter], queryFn: () => api<Participation[]>(withQuery('training/participation', filter)) });
  const rows: Row[] = data
    .map((p) => { const person = persons.find((x) => x.id === p.personId); return { ...p, name: person ? personName(person) : '–' }; })
    .toSorted((a, b) => b.rate - a.rate || a.name.localeCompare(b.name));

  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('participation.title') }]} title={t('participation.title')} subtitle={t('participation.subtitle')} />
      <Group align="end">
        <DateInput label={t('participation.from')} value={from} onChange={setFrom} valueFormat="DD.MM.YYYY" />
        <DateInput label={t('participation.to')} value={to} onChange={setTo} valueFormat="DD.MM.YYYY" />
        <Select label={t('fields.department')} placeholder={t('sessions.allDepartments')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} clearable />
      </Group>
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.personId}
        empty={isLoading ? t('loading') : t('participation.empty')}
        columns={[
          { key: 'name', header: t('attendance.person'), render: (r) => <Text fw={700} size="sm">{r.name}</Text> },
          { key: 'present', header: t('participation.present'), align: 'right', render: (r) => `${r.present} / ${r.sessions}` },
          { key: 'excused', header: t('participation.excused'), align: 'right', render: (r) => r.excused },
          { key: 'hours', header: t('participation.hours'), align: 'right', render: (r) => r.hours.toLocaleString() },
          {
            key: 'rate',
            header: t('participation.rate'),
            width: 200,
            render: (r) => (
              <Group gap="xs" wrap="nowrap">
                <Progress value={r.rate} w={110} color={r.rate >= 50 ? 'green' : r.rate >= 30 ? 'yellow' : 'red'} />
                <Text size="sm">{r.rate} %</Text>
              </Group>
            ),
          },
        ]}
      />
    </Stack>
  );
}
