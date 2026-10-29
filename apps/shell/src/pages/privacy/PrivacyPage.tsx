import { Anchor, Button, Checkbox, Chip, Group, SimpleGrid, Stack, Tabs, Text } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { type ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { PrivacyRequest, Session } from '@forga/core-contracts';
import { can, formatDate, useTranslation } from '@forga/web-sdk';
import { DataTable, KpiTile, PageHeader, Panel, StatusBadge, type Tone } from '@forga/web-ui';
import { useDepartments } from '../admin/data';
import { daysUntil, PRIVACY, useRequests, useRestricted, useUninformed } from './api';
import { InformationDialog, RequestDialog } from './dialogs';
import { BreachesTab } from './BreachesTab';
import { PrivacySettings } from './PrivacySettings';
import { RegisterTab } from './RegisterTab';
import { ThirdPartyAccessDialog } from '../../privacy/ThirdParties';

type Tab = 'requests' | 'information' | 'register' | 'breaches' | 'settings';

export const STATUS_TONES: Record<PrivacyRequest['status'], Tone> = { received: 'warning', 'in-review': 'primary', extended: 'warning', done: 'done', rejected: 'neutral' };

/** "Verwaltung → Datenschutz": requests, information under Art. 13/14 and the settings. */
export function PrivacyPage({ tab, session }: { tab: Tab; session: Session }) {
  const { t } = useTranslation('shell');
  const navigate = useNavigate();
  const manager = can(session, PRIVACY);
  const paths: Record<Tab, string> = { requests: '/admin/privacy', information: '/admin/privacy/information', register: '/admin/privacy/register', breaches: '/admin/privacy/breaches', settings: '/admin/privacy/settings' };
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('nav.administration') }, { label: t('privacy.title') }]} title={t('privacy.title')} />
      <Tabs value={tab} onChange={(value) => value && navigate(paths[value as Tab])}>
        <Tabs.List>
          {manager && <Tabs.Tab value="requests">{t('privacy.tabs.requests')}</Tabs.Tab>}
          {manager && <Tabs.Tab value="information">{t('privacy.tabs.information')}</Tabs.Tab>}
          {manager && <Tabs.Tab value="register">{t('privacy.tabs.register')}</Tabs.Tab>}
          {manager && <Tabs.Tab value="breaches">{t('privacy.tabs.breaches')}</Tabs.Tab>}
          <Tabs.Tab value="settings">{t('privacy.tabs.settings')}</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      {tab === 'requests' && <RequestsTab />}
      {tab === 'information' && <InformationTab />}
      {tab === 'register' && <RegisterTab />}
      {tab === 'breaches' && <BreachesTab />}
      {tab === 'settings' && <PrivacySettings session={session} />}
    </Stack>
  );
}

/** Who made the request: the person of the master data, or the third party with "another person" (L14). */
export function requestSubject(request: PrivacyRequest, t: (key: string) => string): string {
  if (request.thirdParty) return `${request.thirdParty.name} (${t('minimisation.requests.thirdParty')})`;
  return request.personName ?? t('privacy.requests.unknownPerson');
}

/** Badge with the deadline: red when overdue, yellow within 7 days. */
export function DeadlineBadge({ request }: { request: PrivacyRequest }) {
  const { i18n } = useTranslation('shell');
  const open = ['received', 'in-review', 'extended'].includes(request.status);
  const days = daysUntil(request.deadline);
  const tone: Tone = !open ? 'neutral' : days < 0 ? 'error' : days <= 7 ? 'warning' : 'neutral';
  return <StatusBadge tone={tone}>{formatDate(request.deadline, i18n.language)}</StatusBadge>;
}

function RequestsTab() {
  const { t, i18n } = useTranslation('shell');
  const navigate = useNavigate();
  const [state, setState] = useState<'open' | 'closed' | 'all'>('open');
  const [creating, setCreating] = useState(false);
  const [thirdParty, setThirdParty] = useState(false);
  const { data: open = [] } = useRequests('open');
  const { data: requests = [], isLoading } = useRequests(state);
  const { data: restricted = [] } = useRestricted();
  const { data: uninformed = [] } = useUninformed();
  const dueSoon = open.filter((r) => daysUntil(r.deadline) <= 7);
  const oldest = open.map((r) => r.receivedOn).toSorted()[0];
  return (
    <Stack gap="lg">
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
        <KpiTile value={dueSoon.length} label={t('privacy.requests.kpiDue')} attention={dueSoon.length > 0} hint={dueSoon[0] ? `${t(`privacy.kinds.${dueSoon[0].kind}`)} · ${requestSubject(dueSoon[0], t)}` : undefined} />
        <KpiTile value={open.length} label={t('privacy.requests.kpiOpen')} hint={oldest ? t('privacy.requests.kpiOldest', { date: formatDate(oldest, i18n.language) }) : undefined} />
        <KpiTile value={restricted.length} label={t('privacy.requests.kpiRestricted')} />
        <KpiTile value={uninformed.length} label={t('privacy.requests.kpiUninformed')} to="/admin/privacy/information" attention={uninformed.length > 0} />
      </SimpleGrid>
      <Group justify="space-between">
        <Chip.Group multiple={false} value={state} onChange={(value) => setState(value as typeof state)}>
          <Group gap="xs">
            {(['open', 'closed', 'all'] as const).map((s) => (
              <Chip key={s} value={s} radius="sm">
                {t(`privacy.requests.filters.${s}`)}
                {s === 'open' ? ` (${open.length})` : ''}
              </Chip>
            ))}
          </Group>
        </Chip.Group>
        <Group gap="xs">
          <Button variant="default" onClick={() => setThirdParty(true)}>{t('minimisation.thirdParties.open')}</Button>
          <Button onClick={() => setCreating(true)}>{t('privacy.requests.create')}</Button>
        </Group>
      </Group>
      <DataTable
        rows={requests}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/admin/privacy/requests/${r.id}`)}
        highlight={(r) => ['received', 'in-review', 'extended'].includes(r.status) && daysUntil(r.deadline) <= 7}
        empty={isLoading ? null : t('privacy.requests.empty')}
        columns={[
          { key: 'kind', header: t('privacy.requests.columns.kind'), render: (r) => <Anchor component={Link} to={`/admin/privacy/requests/${r.id}`}>{t(`privacy.kinds.${r.kind}`)}</Anchor> },
          { key: 'person', header: t('privacy.requests.columns.person'), render: (r) => requestSubject(r, t) },
          { key: 'received', header: t('privacy.requests.columns.received'), render: (r) => `${formatDate(r.receivedOn, i18n.language)} · ${t(`privacy.channels.${r.channel}`)}` },
          { key: 'deadline', header: t('privacy.requests.columns.deadline'), render: (r) => <DeadlineBadge request={r} /> },
          { key: 'status', header: t('privacy.requests.columns.status'), render: (r) => <StatusBadge tone={STATUS_TONES[r.status]}>{t(`privacy.statuses.${r.status}`)}</StatusBadge> },
          { key: 'assignee', header: t('privacy.requests.columns.assignee'), render: (r) => r.assigneeName ?? '–' },
        ]}
      />
      <Text size="xs" c="dimmed">{t('privacy.requests.taskHint')}</Text>
      <RestrictedPanel />
      {creating && <RequestDialog onClose={() => setCreating(false)} onCreated={(r) => navigate(`/admin/privacy/requests/${r.id}`)} />}
      {thirdParty && <ThirdPartyAccessDialog onClose={() => setThirdParty(false)} />}
    </Stack>
  );
}

function RestrictedPanel() {
  const { t, i18n } = useTranslation('shell');
  const { data: restricted = [] } = useRestricted();
  return (
    <Panel title={t('privacy.requests.restrictedTitle')}>
      <DataTable
        rows={restricted}
        rowKey={(p) => p.id}
        empty={t('privacy.requests.restrictedEmpty')}
        columns={[
          { key: 'person', header: t('privacy.requests.restrictedColumns.person'), render: (p) => <Anchor component={Link} to={`/masterdata/persons/${p.id}?tab=privacy`}>{`${p.lastName}, ${p.firstName}`}</Anchor> },
          { key: 'reason', header: t('privacy.requests.restrictedColumns.reason'), render: (p) => t(`privacy.reasons.${p.restriction.reason}`) },
          { key: 'since', header: t('privacy.requests.restrictedColumns.since'), render: (p) => formatDate(p.restriction.restrictedAt, i18n.language) },
          { key: 'until', header: t('privacy.requests.restrictedColumns.until'), render: (p) => (p.restriction.until ? formatDate(p.restriction.until, i18n.language) : '–') },
        ]}
      />
    </Panel>
  );
}

/** Persons without recorded information under Art. 13/14, with a bulk action. */
function InformationTab() {
  const { t, i18n } = useTranslation('shell');
  const { data: persons = [], isLoading } = useUninformed();
  const { data: departments = [] } = useDepartments();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [recording, setRecording] = useState(false);
  const department = (id: string | null) => departments.find((d) => d.id === id)?.name ?? '';
  const allSelected = persons.length > 0 && persons.every((p) => selected.has(p.id));
  const toggle = (id: string, on: boolean) => setSelected((current) => {
    const next = new Set(current);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });
  return (
    <Panel title={t('privacy.information.title')}>
      <Stack gap="md">
        <Text size="sm">{t('privacy.information.intro')}</Text>
        <Group>
          <Button component="a" href={`/api/core/privacy/notice.pdf?language=${i18n.language}`} target="_blank" variant="default" leftSection={<IconDownload size={16} />}>
            {t('privacy.information.pdf')}
          </Button>
          <Button disabled={!selected.size} onClick={() => setRecording(true)}>{t('privacy.information.record', { count: selected.size })}</Button>
        </Group>
        <DataTable
          rows={persons}
          rowKey={(p) => p.id}
          empty={isLoading ? null : t('privacy.information.empty')}
          columns={[
            {
              key: 'select',
              header: '',
              width: 40,
              render: (p) => <Checkbox aria-label={t('privacy.information.select', { name: `${p.firstName} ${p.lastName}` })} checked={selected.has(p.id)} onChange={(e) => toggle(p.id, e.currentTarget.checked)} />,
            },
            { key: 'name', header: t('privacy.information.columns.name'), render: (p) => <Anchor component={Link} to={`/masterdata/persons/${p.id}?tab=privacy`}>{`${p.lastName}, ${p.firstName}`}</Anchor> },
            { key: 'department', header: t('privacy.information.columns.department'), render: (p) => department(p.primaryDepartmentId) },
            { key: 'joinedOn', header: t('privacy.information.columns.joinedOn'), render: (p) => formatDate(p.joinedOn, i18n.language) },
          ]}
        />
        {persons.length > 0 && (
          <Checkbox label={t('privacy.information.selectAll')} checked={allSelected} onChange={(e) => setSelected(e.currentTarget.checked ? new Set(persons.map((p) => p.id)) : new Set())} />
        )}
      </Stack>
      {recording && <InformationDialog personIds={[...selected]} onClose={() => setRecording(false)} onDone={() => setSelected(new Set())} />}
    </Panel>
  );
}

/** A label with its value, as in the data lists of the mockups. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Group gap="md" wrap="nowrap" align="flex-start">
      <Text size="sm" c="dimmed" w={180} style={{ flexShrink: 0 }}>{label}</Text>
      <Text size="sm" component="div">{children}</Text>
    </Group>
  );
}
