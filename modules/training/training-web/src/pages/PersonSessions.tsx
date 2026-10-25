import { Group, Select, Text } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Session } from '@forga/training-contracts';
import { formatDateTime, useTranslation } from '@forga/web-sdk';
import { DataTable, Panel } from '@forga/web-ui';
import { useSessions, useTypeName } from '../api';

type Row = { session: Session; status: string; breathingApparatus: boolean };

/** Tab "Dienste" in the person file of the master data module (extension point `masterdata.person.tab`). */
export function PersonSessions({ personId }: { personId?: unknown }) {
  const { t, i18n } = useTranslation('training');
  const typeName = useTypeName();
  const [thisYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState(String(thisYear));
  const { data = [], isLoading } = useSessions({ from: `${year}-01-01`, to: `${year}-12-31` });
  const rows: Row[] = data.flatMap((session) => session.attendance.filter((a) => a.personId === personId).map((a) => ({ session, status: a.status, breathingApparatus: a.breathingApparatus })));
  const present = rows.filter((r) => r.status === 'present').length;
  return (
    <Panel
      title={t('person.title', { year })}
      aside={
        <Group gap="md">
          <Text size="sm" c="dimmed">{t('person.summary', { present, total: rows.length })}</Text>
          <Select aria-label={t('person.year')} w={100} size="xs" data={[0, 1, 2, 3].map((n) => String(thisYear - n))} value={year} onChange={(v) => v && setYear(v)} allowDeselect={false} />
        </Group>
      }
    >
      <DataTable<Row>
        rows={rows}
        rowKey={(r) => r.session.id}
        empty={isLoading ? t('loading') : t('person.empty')}
        columns={[
          { key: 'date', header: t('fields.startsAt'), render: (r) => formatDateTime(r.session.startsAt, i18n.language) },
          { key: 'title', header: t('fields.title'), render: (r) => <Link to={`/training/sessions/${r.session.id}`} style={{ textDecoration: 'none' }}><Text fw={700} size="sm" c="brand">{r.session.title}</Text><Text size="xs" c="dimmed">{typeName(r.session.type)}</Text></Link> },
          { key: 'status', header: t('fields.status'), render: (r) => t(`attendance.${r.status}`) },
          { key: 'ba', header: t('attendance.ba'), render: (r) => (r.breathingApparatus ? '✓' : '') },
        ]}
      />
    </Panel>
  );
}
