import { Code, Group, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, formatDateTime, useTranslation, withQuery } from '@forga/web-sdk';
import { DataTable, PageHeader } from '@forga/web-ui';

interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string | null;
  userName: string | null;
  impersonatorId: string | null;
  impersonatorName: string | null;
  action: string;
  details: Record<string, unknown> | null;
}

interface AuditFilters {
  actions: string[];
  users: { id: string; name: string }[];
}

/** Starting the action filter on a prefix (e.g. `?action=events.` from a task) selects all actions of that area. */
function initialAction(): string | null {
  return new URLSearchParams(window.location.search).get('action');
}

function detailValue(value: unknown): string {
  if (value === null || value === undefined) return '–';
  if (Array.isArray(value)) return value.map(detailValue).join(', ');
  if (typeof value === 'object') return Object.entries(value as Record<string, unknown>).map(([k, v]) => `${k}: ${detailValue(v)}`).join(', ');
  return String(value);
}

/** Security-relevant actions, filtered on the server: period, user, action and words in the details. */
export function AuditPage() {
  const { t, i18n } = useTranslation('shell');
  const [limit, setLimit] = useState('200');
  const [query, setQuery] = useState('');
  const [debounced] = useDebouncedValue(query, 300);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [action, setAction] = useState<string | null>(initialAction);
  const filters = { limit, from, to, userId, action, q: debounced.trim() };
  const { data: entries = [] } = useQuery({ queryKey: ['core', 'audit', filters], queryFn: () => api<AuditEntry[]>(withQuery('core/audit', filters)) });
  const { data: options } = useQuery({ queryKey: ['core', 'audit', 'filters'], queryFn: () => api<AuditFilters>('core/audit/filters') });
  // Core actions are translated; actions of modules and plugins are shown with their code.
  const actionName = (code: string) => t(`audit.actions.${code}`, { defaultValue: code });
  const name = (id: string | null, resolved: string | null) => (id ? (resolved ?? t('audit.unknownUser')) : t('audit.system'));
  const actionOptions = [
    ...(action && !options?.actions.includes(action) ? [{ value: action, label: action }] : []),
    ...(options?.actions ?? []).map((a) => ({ value: a, label: actionName(a) })),
  ];

  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('nav.administration') }, { label: t('nav.audit') }]} title={t('nav.audit')} subtitle={t('audit.subtitle')} />
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 6 }}>
        <DateInput label={t('audit.from')} value={from} onChange={setFrom} valueFormat="DD.MM.YYYY" clearable />
        <DateInput label={t('audit.to')} value={to} onChange={setTo} valueFormat="DD.MM.YYYY" clearable />
        <Select label={t('audit.user')} placeholder={t('audit.allUsers')} data={(options?.users ?? []).map((u) => ({ value: u.id, label: u.name }))} value={userId} onChange={setUserId} searchable clearable />
        <Select label={t('audit.action')} placeholder={t('audit.allActions')} data={actionOptions} value={action} onChange={setAction} searchable clearable />
        <TextInput type="search" label={t('audit.search')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
        <Select label={t('audit.limit')} data={['200', '500', '1000']} value={limit} onChange={(value) => setLimit(value ?? '200')} allowDeselect={false} />
      </SimpleGrid>
      <DataTable
        rows={entries}
        rowKey={(e) => e.id}
        columns={[
          { key: 'time', header: t('audit.time'), width: 170, render: (e) => formatDateTime(e.timestamp, i18n.language) },
          {
            key: 'user',
            header: t('audit.user'),
            width: 200,
            render: (e) => (e.impersonatorId ? t('audit.impersonated', { admin: name(e.impersonatorId, e.impersonatorName), user: name(e.userId, e.userName) }) : name(e.userId, e.userName)),
          },
          { key: 'action', header: t('audit.action'), render: (e) => <Group gap={6} wrap="nowrap"><Text size="sm">{actionName(e.action)}</Text>{actionName(e.action) === e.action ? null : <Code fz="xs">{e.action}</Code>}</Group> },
          {
            key: 'details',
            header: t('audit.details'),
            render: (e) => (
              <Text size="xs" c="dimmed" style={{ wordBreak: 'break-word' }}>
                {Object.entries(e.details ?? {}).map(([key, value]) => `${key}: ${detailValue(value)}`).join(' · ')}
              </Text>
            ),
          },
        ]}
      />
    </Stack>
  );
}
