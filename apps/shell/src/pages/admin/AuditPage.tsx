import { Anchor, Select, SimpleGrid, Stack, Tabs, Text, TextInput, Tooltip } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useDebouncedValue } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { Fragment, type ReactNode, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { AuditEntry, AuditFilters, AuditReference } from '@forga/core-contracts';
import { api, can, extensionsOf, formatDate, formatDateTime, useLocalized, useSession, useTranslation, withQuery } from '@forga/web-sdk';
import { DataTable, PageHeader } from '@forga/web-ui';

/** Starting the action filter on a prefix (e.g. `?action=events.` from a task) selects all actions of that area. */
function initialAction(): string | null {
  return new URLSearchParams(window.location.search).get('action');
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Texts of actions and detail keys: first those of the module the action belongs to (`<module>:audit.…`), then the
 * shell's own (`audit.…`); `null` if neither knows it.
 */
function useAuditTexts() {
  const { t, i18n } = useTranslation('shell');
  const text = (kind: 'actions' | 'keys', code: string, action: string): string | null => {
    const namespace = action.slice(0, Math.max(action.indexOf('.'), 0));
    for (const key of [...(namespace ? [`${namespace}:audit.${kind}.${code}`] : []), `shell:audit.${kind}.${code}`]) {
      if (i18n.exists(key)) return t(key);
    }
    return null;
  };
  return {
    action: (code: string) => text('actions', code, code),
    key: (key: string, action: string) => text('keys', key, action),
  };
}

/** A record the entry refers to: its name (linked if the viewer may open it); the ID on hover. */
function Reference({ id, reference }: { id: string; reference: AuditReference }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  let content: ReactNode;
  if (reference.label === null) {
    content = (
      <Text span inherit c="dimmed" fs="italic">
        {reference.anonymized ? t('audit.anonymized') : t('audit.deleted', { id: id.slice(0, 8) })}
      </Text>
    );
  } else {
    const label = typeof reference.label === 'string' ? reference.label : localized(reference.label);
    content = reference.to ? (
      <Anchor component={Link} to={reference.to} inherit>
        {label}
      </Anchor>
    ) : (
      <Text span inherit>
        {label}
      </Text>
    );
  }
  return (
    <Tooltip label={t('audit.rawId', { id })} withinPortal>
      <span>{content}</span>
    </Tooltip>
  );
}

function joined(parts: ReactNode[], separator: string): ReactNode {
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 && separator}
      {part}
    </Fragment>
  ));
}

/** Readable value of a detail: references by name, dates formatted, lists and nested objects spelled out. */
function DetailValue({ value, entry }: { value: unknown; entry: AuditEntry }) {
  const { t, i18n } = useTranslation('shell');
  const texts = useAuditTexts();
  if (value === null || value === undefined || value === '') return <>–</>;
  if (typeof value === 'string') {
    const reference = entry.references[value];
    if (reference) return <Reference id={value} reference={reference} />;
    if (ISO_DATE_TIME.test(value)) return <>{formatDateTime(value, i18n.language)}</>;
    if (ISO_DATE.test(value)) return <>{formatDate(value, i18n.language)}</>;
    return <>{value}</>;
  }
  if (typeof value === 'boolean') return <>{value ? t('audit.yes') : t('audit.no')}</>;
  if (typeof value === 'number') return <>{value.toLocaleString(i18n.language)}</>;
  if (Array.isArray(value)) {
    if (!value.length) return <>–</>;
    const nested = value.some((v) => v && typeof v === 'object');
    return <>{joined(value.map((v, index) => (nested ? <Fragment key={index}>(<DetailValue value={v} entry={entry} />)</Fragment> : <DetailValue key={index} value={v} entry={entry} />)), nested ? ' ' : ', ')}</>;
  }
  if (typeof value === 'object') {
    return (
      <>
        {joined(
          Object.entries(value as Record<string, unknown>).map(([key, v]) => (
            <Fragment key={key}>
              <KeyLabel name={key} label={texts.key(key, entry.action)} />: <DetailValue value={v} entry={entry} />
            </Fragment>
          )),
          ', ',
        )}
      </>
    );
  }
  return <>{String(value)}</>;
}

/** Translated name of a detail key; unknown keys appear as they are, muted. */
function KeyLabel({ name, label }: { name: string; label: string | null }) {
  return label ? (
    <>{label}</>
  ) : (
    <Text span inherit c="dimmed" ff="monospace">
      {name}
    </Text>
  );
}

function Details({ entry }: { entry: AuditEntry }) {
  const { t } = useTranslation('shell');
  const texts = useAuditTexts();
  const details = Object.entries(entry.details ?? {});
  if (!details.length) return null;
  return (
    <Stack gap={2}>
      {details.map(([key, value]) => (
        <Text key={key} size="xs" style={{ wordBreak: 'break-word' }}>
          <Text span inherit c="dimmed">
            <KeyLabel name={key} label={texts.key(key, entry.action)} />:
          </Text>{' '}
          {/* Persons named by an export (data breaches): only their number, the IDs stay in the entry. */}
          {key === 'personIds' && Array.isArray(value) ? t('audit.personCount', { count: value.length }) : <DetailValue value={value} entry={entry} />}
        </Text>
      ))}
    </Stack>
  );
}

/**
 * "Verwaltung → Audit-Log": the audit log and further protocols of the modules as tabs (extension point
 * `core.audit.tabs`, e.g. the read log of the module `privacy` at `?tab=privacy`).
 */
export function AuditPage() {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const session = useSession().data;
  const [search, setSearch] = useSearchParams();
  const tabs = extensionsOf('core.audit.tabs').filter((e) => !e.permission || can(session, e.permission));
  const requested = search.get('tab');
  const tab = tabs.some((e) => e.module === requested) ? requested! : 'audit';
  if (!tabs.length) {
    return (
      <Stack gap="lg">
        <PageHeader breadcrumbs={[{ label: t('nav.administration') }, { label: t('nav.audit') }]} title={t('nav.audit')} subtitle={t('audit.subtitle')} />
        <AuditLogView />
      </Stack>
    );
  }
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('nav.administration') }, { label: t('nav.audit') }]} title={t('nav.audit')} subtitle={t('audit.subtitle')} />
      <Tabs value={tab} onChange={(value) => setSearch(value && value !== 'audit' ? { tab: value } : {}, { replace: true })} keepMounted={false}>
        <Tabs.List mb="lg">
          <Tabs.Tab value="audit">{t('audit.tab')}</Tabs.Tab>
          {tabs.map((e) => <Tabs.Tab key={e.module} value={e.module}>{localized(e.label)}</Tabs.Tab>)}
        </Tabs.List>
        <Tabs.Panel value="audit"><AuditLogView /></Tabs.Panel>
        {tabs.map((e) => {
          const Tab = e.component;
          return <Tabs.Panel key={e.module} value={e.module}><Tab /></Tabs.Panel>;
        })}
      </Tabs>
    </Stack>
  );
}

/** Security-relevant actions, filtered on the server: period, user, action and words in the details. */
function AuditLogView() {
  const { t, i18n } = useTranslation('shell');
  const texts = useAuditTexts();
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
  const actionName = (code: string) => texts.action(code) ?? code;
  const name = (id: string | null, resolved: string | null) => (id ? (resolved ?? t('audit.unknownUser')) : t('audit.system'));
  const actionOptions = [
    ...(action && !options?.actions.includes(action) ? [{ value: action, label: action }] : []),
    ...(options?.actions ?? []).map((a) => ({ value: a, label: actionName(a) })),
  ];

  return (
    <Stack gap="lg">
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
          {
            key: 'action',
            header: t('audit.action'),
            width: 260,
            // The technical code only on hover, for support and for searching.
            render: (e) => {
              const label = texts.action(e.action);
              return (
                <Tooltip label={e.action} withinPortal disabled={!label}>
                  <Text size="sm" ff={label ? undefined : 'monospace'}>
                    {label ?? e.action}
                  </Text>
                </Tooltip>
              );
            },
          },
          { key: 'details', header: t('audit.details'), render: (e) => <Details entry={e} /> },
        ]}
      />
    </Stack>
  );
}
