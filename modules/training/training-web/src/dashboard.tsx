import { Text } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Session } from '@forga/training-contracts';
import { formatDateTime, localDate, useTranslation } from '@forga/web-sdk';
import { DataTable, KpiTile, Panel } from '@forga/web-ui';
import { useSessions, useTypeName } from './api';
import { SessionStatusBadge } from './parts';

const day = (offset: number) => localDate(new Date(Date.now() + offset * 86_400_000));

/** Held sessions waiting to be closed. */
export function OpenSessionsTile() {
  const { t } = useTranslation('training');
  const [from] = useState(() => day(-120));
  const [to] = useState(() => day(0));
  const { data = [] } = useSessions({ from, to });
  const count = data.filter((s) => s.status === 'held').length;
  return <KpiTile value={count} label={t('dashboard.toClose')} hint={t('dashboard.toCloseHint')} to="/training/sessions" attention={count > 0} />;
}

export function UpcomingSessions() {
  const { t, i18n } = useTranslation('training');
  const typeName = useTypeName();
  const [from] = useState(() => day(0));
  const [to] = useState(() => day(30));
  const { data = [] } = useSessions({ from, to });
  return (
    <Panel title={t('dashboard.upcoming')} aside={<Text component={Link} to="/training/sessions" size="sm" c="brand" fw={700}>{t('dashboard.all')}</Text>}>
      <DataTable<Session>
        exportable={false}
        rows={data.slice(0, 5)}
        rowKey={(s) => s.id}
        empty={t('dashboard.none')}
        columns={[
          { key: 'date', header: t('fields.startsAt'), render: (s) => formatDateTime(s.startsAt, i18n.language) },
          { key: 'title', header: t('fields.title'), render: (s) => <Link to={`/training/sessions/${s.id}`} style={{ textDecoration: 'none' }}><Text fw={700} size="sm" c="brand">{s.title}</Text><Text size="xs" c="dimmed">{typeName(s.type)}</Text></Link> },
          { key: 'status', header: t('fields.status'), render: (s) => <SessionStatusBadge status={s.status} /> },
        ]}
      />
    </Panel>
  );
}
