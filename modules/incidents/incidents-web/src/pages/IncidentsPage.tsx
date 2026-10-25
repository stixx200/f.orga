import { Button, Chip, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { Incident, ReportStatus } from '@forga/incidents-contracts';
import { can, formatDateTime, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, matchesSearch, PageHeader } from '@forga/web-ui';
import { type IncidentFilter, READ, RELEASE, useDepartments, useIncidents, useNames, WRITE } from '../api';
import { CreateIncidentDialog } from './CreateIncidentDialog';
import { DepartmentBadge, incidentStatus, keywordLabel, locationLabel, ReportStatusBadge } from '../parts';

type View = 'all' | 'mine' | 'draft' | 'review' | 'released' | 'withoutStatistics';

const VIEWS: View[] = ['all', 'mine', 'draft', 'review', 'released', 'withoutStatistics'];
const STATUS_OF_VIEW: Partial<Record<View, ReportStatus>> = { draft: 'draft', review: 'review' };

/**
 * Incidents of the chosen year with their reports; search over number, keyword and location.
 * `?view=…&year=…` opens a view directly, e.g. the incidents without statistics from the annual statistics.
 */
export function IncidentsPage() {
  const { t, i18n } = useTranslation('incidents');
  const navigate = useNavigate();
  const session = useSession().data;
  const names = useNames();
  const [params] = useSearchParams();
  const [view, setView] = useState<View>(() => (VIEWS.includes(params.get('view') as View) ? (params.get('view') as View) : 'all'));
  const [thisYear] = useState(() => String(new Date().getFullYear()));
  const [year, setYear] = useState(() => params.get('year') ?? thisYear);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const filter: IncidentFilter = {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
    departmentId: departmentId ?? undefined,
    status: STATUS_OF_VIEW[view],
    mine: view === 'mine',
    withoutStatistics: view === 'withoutStatistics',
  };
  const { data: incidents = [], isLoading } = useIncidents(filter);
  const writable = can(session, WRITE) || can(session, 'incidents.reports.release');

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return incidents
      .filter((i) => view !== 'released' || i.reports.every((r) => r.status.startsWith('released')))
      .filter((i) => matchesSearch([i.dispatchNumber, i.alarmKeyword, i.alarmMessage, locationLabel(i)], q));
  }, [incidents, query, view]);
  const years = Array.from({ length: 4 }, (_, i) => String(Number(thisYear) - i));
  // All departments the user may read, not only those of the incidents already filtered.
  const { data: departments = [] } = useDepartments();
  const departmentOptions = departments
    .filter((d) => session?.permissions[RELEASE] === 'brigade' || can(session, READ, d.id))
    .map((d) => ({ value: d.id, label: d.name }));

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('incidents.title') }]}
        title={t('incidents.title')}
        actions={writable && <Button onClick={() => setCreating(true)}>{t('incidents.create')}</Button>}
      />
      <Chip.Group value={view} onChange={(value) => setView(value as View)}>
        <Group gap="xs">
          {VIEWS.map((v) => (
            <Chip key={v} value={v} radius="xs">{t(`incidents.views.${v}`)}</Chip>
          ))}
        </Group>
      </Chip.Group>
      <Group grow align="end">
        <TextInput type="search" label={t('incidents.search')} placeholder={t('incidents.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
        <Select label={t('incidents.year')} data={years} value={year} onChange={(value) => setYear(value ?? year)} allowDeselect={false} />
        <Select label={t('fields.department')} placeholder={t('incidents.allDepartments')} data={departmentOptions} value={departmentId} onChange={setDepartmentId} clearable />
      </Group>
      <DataTable<Incident>
        rows={rows}
        rowKey={(i) => i.id}
        onRowClick={(i) => navigate(`/incidents/incidents/${i.id}`)}
        empty={isLoading ? t('loading') : t('incidents.empty')}
        columns={[
          {
            key: 'keyword',
            header: t('fields.keyword'),
            render: (i) => (
              <>
                <Text fw={700} size="sm" c="brand">{keywordLabel(i)}</Text>
                <Text size="xs" c="dimmed">{i.dispatchNumber}</Text>
              </>
            ),
          },
          { key: 'alarm', header: t('fields.alarmedAt'), render: (i) => formatDateTime(i.alarmedAt, i18n.language) },
          { key: 'location', header: t('fields.location'), render: (i) => locationLabel(i) },
          {
            key: 'reports',
            header: t('incidents.reports'),
            render: (i) => (
              <Group gap={4}>
                {i.reports.map((r) => <DepartmentBadge key={r.id} name={names.department(r.departmentId)} primary={r.primary} />)}
              </Group>
            ),
          },
          {
            key: 'status',
            header: t('fields.status'),
            render: (i) => {
              const status = incidentStatus(i);
              return status && <ReportStatusBadge status={status} locked={i.reports.length > 0 && i.reports.every((r) => r.locked)} />;
            },
          },
        ]}
      />
      <Text size="xs" c="dimmed">{t('incidents.legend', { count: rows.length })}</Text>
      {creating && <CreateIncidentDialog opened onClose={() => setCreating(false)} />}
    </Stack>
  );
}
