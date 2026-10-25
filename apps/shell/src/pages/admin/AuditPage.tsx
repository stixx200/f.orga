import { Code, Select, Stack, Text, TextInput, Group } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { api, can, formatDateTime, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, PageHeader } from '@forga/web-ui';
import { useUsers } from './data';

interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string | null;
  impersonatorId: string | null;
  action: string;
  details: Record<string, unknown> | null;
}

/** The latest security-relevant actions: logins, role and user changes, releases, imports. */
export function AuditPage() {
  const { t, i18n } = useTranslation('shell');
  const session = useSession().data;
  const [limit, setLimit] = useState('200');
  const [query, setQuery] = useState('');
  const { data: entries = [] } = useQuery({ queryKey: ['core', 'audit', limit], queryFn: () => api<AuditEntry[]>(`core/audit?limit=${limit}`) });
  const { data: users = [] } = useUsers(can(session, 'core.users.manage'));
  const userName = (id: string | null) => (id ? (users.find((u) => u.id === id)?.displayName ?? id.slice(0, 8)) : t('audit.system'));
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => !q || e.action.toLowerCase().includes(q) || JSON.stringify(e.details ?? {}).toLowerCase().includes(q) || userName(e.userId).toLowerCase().includes(q));
    // oxlint-disable-next-line react/exhaustive-deps -- userName depends on users only
  }, [entries, query, users]);

  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('nav.administration') }, { label: t('nav.audit') }]} title={t('nav.audit')} subtitle={t('audit.subtitle')} />
      <Group grow align="end" maw={720}>
        <TextInput type="search" label={t('audit.search')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
        <Select label={t('audit.limit')} data={['200', '500', '1000']} value={limit} onChange={(value) => setLimit(value ?? '200')} allowDeselect={false} />
      </Group>
      <DataTable
        rows={rows}
        rowKey={(e) => e.id}
        columns={[
          { key: 'time', header: t('audit.time'), width: 170, render: (e) => formatDateTime(e.timestamp, i18n.language) },
          { key: 'user', header: t('audit.user'), width: 200, render: (e) => (e.impersonatorId ? t('audit.impersonated', { admin: userName(e.impersonatorId), user: userName(e.userId) }) : userName(e.userId)) },
          { key: 'action', header: t('audit.action'), render: (e) => <Code>{e.action}</Code> },
          {
            key: 'details',
            header: t('audit.details'),
            render: (e) => <Text size="xs" c="dimmed" style={{ wordBreak: 'break-word' }}>{e.details ? JSON.stringify(e.details) : ''}</Text>,
          },
        ]}
      />
    </Stack>
  );
}
