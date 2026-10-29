import { Button, Chip, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { classNames, type DriverLicenseOverviewRow, type DriverLicenseState } from '@forga/masterdata-contracts';
import { can, formatDate, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, matchesSearch, PageHeader, StatusBadge } from '@forga/web-ui';
import { today, useCatalogNames, useDepartments } from '../api';
import { SETTINGS, STATE_TONES, useLicenseFile, useLicenseOverview } from './api';
import { CheckDialog, RequestDialog } from './dialogs';

type View = 'all' | 'overdue' | 'due' | 'first-check-missing' | 'requested';
const VIEWS: View[] = ['all', 'overdue', 'due', 'first-check-missing', 'requested'];

/** `due`: a deadline within the lead time. */
const inView = (r: DriverLicenseOverviewRow, v: View) => v === 'all' || r.state === (v as DriverLicenseState);

/** Loads the file of the person of a row and opens the dialog for it. */
function RowDialog({ personId, kind, onClose }: { personId: string; kind: 'check' | 'request'; onClose: () => void }) {
  const { data: file } = useLicenseFile(personId);
  if (!file) return null;
  return kind === 'check' ? <CheckDialog file={file} onClose={onClose} /> : <RequestDialog file={file} onClose={onClose} />;
}

/**
 * "Führerschein­kontrollen": the persons of the target group in the user's departments with classes, next expiry,
 * latest check, sticker and state; filters by state, department and method of the latest check.
 */
export function DriverLicensesPage() {
  const { t, i18n } = useTranslation('masterdata');
  const navigate = useNavigate();
  const session = useSession().data;
  const { data: overview, isLoading } = useLicenseOverview();
  const { data: departments = [] } = useDepartments();
  const qualificationName = useCatalogNames('qualification');
  const [view, setView] = useState<View>('all');
  const [query, setQuery] = useState('');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [method, setMethod] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ personId: string; kind: 'check' | 'request' } | null>(null);
  const [day] = useState(today);
  const rows = useMemo(() => overview?.rows ?? [], [overview]);
  const leadDays = overview?.leadDays ?? 30;

  const filtered = useMemo(
    () =>
      rows
        .filter((r) => inView(r, view))
        .filter((r) => !departmentId || r.departmentIds.includes(departmentId))
        .filter((r) => !method || (method === 'self' ? r.lastCheck && ['transponder', 'barcode'].includes(r.lastCheck.method) : r.lastCheck?.method === method))
        .filter((r) => matchesSearch([r.firstName, r.lastName], query.trim().toLowerCase())),
    [rows, view, departmentId, method, query],
  );
  const department = (id: string | null) => departments.find((d) => d.id === id)?.shortName ?? '';
  const stateText = (r: DriverLicenseOverviewRow) => {
    if (r.state === 'requested' && r.requestDueOn) return t('licenses.states.requestedUntil', { date: formatDate(r.requestDueOn, i18n.language) });
    if (r.state === 'due' && r.dueOn) return t('licenses.states.dueIn', { count: Math.max(0, Math.round((Date.parse(r.dueOn) - Date.parse(day)) / 86_400_000)) });
    return t(`licenses.states.${r.state}`);
  };
  const target = overview
    ? t('licenses.list.target', {
        classes: overview.monitoredClasses.join(', '),
        qualifications: overview.driverQualifications.map((q) => qualificationName(q, i18n.language)).join(', ') || '–',
      })
    : '';

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('licenses.list.title') }]}
        title={t('licenses.list.title')}
        actions={
          <Group>
            <Button component={Link} to="/lists" variant="default">{t('licenses.list.proof')}</Button>
            {can(session, SETTINGS) && <Button component={Link} to="/masterdata/driver-licenses/settings" variant="default">{t('licenses.settings.open')}</Button>}
          </Group>
        }
      />
      <Chip.Group value={view} onChange={(v) => setView(v as View)}>
        <Group gap="xs">
          {VIEWS.map((v) => (
            <Chip key={v} value={v} radius="xs">{t(`licenses.list.views.${v}`, { count: rows.filter((r) => inView(r, v)).length, days: leadDays })}</Chip>
          ))}
        </Group>
      </Chip.Group>
      <Group grow align="end">
        <TextInput type="search" label={t('persons.search')} placeholder={t('licenses.list.searchPlaceholder')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} />
        <Select label={t('persons.department')} placeholder={t('persons.allDepartments')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} clearable searchable />
        <Select
          label={t('licenses.lastCheck')}
          placeholder={t('licenses.list.allMethods')}
          data={[
            { value: 'in-person', label: t('licenses.methods.in-person') },
            { value: 'self', label: t('licenses.list.selfChecks') },
            { value: 'legacy', label: t('licenses.methods.legacy') },
          ]}
          value={method}
          onChange={setMethod}
          clearable
        />
      </Group>
      <DataTable<DriverLicenseOverviewRow>
        rows={filtered}
        rowKey={(r) => r.personId}
        onRowClick={(r) => navigate(`/masterdata/persons/${r.personId}/driver-license`)}
        highlight={(r) => r.state === 'overdue' || r.state === 'classes-missing'}
        empty={isLoading ? t('loading') : t('licenses.list.empty')}
        exportName={t('licenses.list.title')}
        columns={[
          { key: 'name', header: t('persons.name'), render: (r) => <Text fw={700} size="sm" c="brand">{r.lastName}, {r.firstName}</Text> },
          { key: 'department', header: t('persons.department'), render: (r) => department(r.primaryDepartmentId) },
          { key: 'classes', header: t('licenses.classes'), render: (r) => classNames(r.classes) || '–' },
          {
            key: 'expiry',
            header: t('licenses.list.nextExpiry'),
            render: (r) =>
              r.nextExpiry ? (
                <Stack gap={2}>
                  <span>{`${formatDate(r.nextExpiry.dueOn, i18n.language)} (${r.nextExpiry.classes.join(', ')})`}</span>
                  {r.expiryToVerify && <StatusBadge tone="warning">{t('licenses.expiryToVerify')}</StatusBadge>}
                </Stack>
              ) : (
                '–'
              ),
          },
          {
            key: 'last',
            header: t('licenses.lastCheck'),
            render: (r) => (r.lastCheck ? `${formatDate(r.lastCheck.checkedOn, i18n.language)} · ${t(`licenses.methodsShort.${r.lastCheck.method}`)}` : '–'),
          },
          { key: 'token', header: t('licenses.token.panel'), render: (r) => (r.token ? t('licenses.yes') : t('licenses.no')) },
          {
            key: 'state',
            header: t('licenses.state'),
            render: (r) => (
              <Group gap={4}>
                <StatusBadge tone={STATE_TONES[r.state]}>{stateText(r)}</StatusBadge>
                {r.documentExpired && <StatusBadge tone="warning">{t('licenses.documentExpired')}</StatusBadge>}
              </Group>
            ),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            export: false,
            render: (r) => (
              <Group gap={4} justify="flex-end" wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                <Button size="compact-xs" variant="subtle" onClick={() => setDialog({ personId: r.personId, kind: 'request' })}>{t('licenses.list.requestShort')}</Button>
                <Button size="compact-xs" variant="subtle" onClick={() => setDialog({ personId: r.personId, kind: 'check' })}>{t('licenses.list.checkShort')}</Button>
              </Group>
            ),
          },
        ]}
      />
      <Text size="xs" c="dimmed">{target} {overview && t(`licenses.modeHint.${overview.mode}`)}</Text>
      {dialog && <RowDialog personId={dialog.personId} kind={dialog.kind} onClose={() => setDialog(null)} />}
    </Stack>
  );
}
