import { Text } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Incident } from '@forga/incidents-contracts';
import { can, formatDateTime, localDate, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, KpiTile, Panel } from '@forga/web-ui';
import { RELEASE, useIncidents, useNames, useSettings } from './api';
import { DepartmentBadge, incidentStatus, keywordLabel, locationLabel, ReportStatusBadge } from './parts';

/** Number of reports in the given status among the incidents returned. */
const countReports = (incidents: Incident[], status: string) => incidents.flatMap((i) => i.reports).filter((r) => r.status === status).length;

export function ReviewTile() {
  const { t } = useTranslation('incidents');
  const { data = [] } = useIncidents({ status: 'review' });
  const count = countReports(data, 'review');
  return <KpiTile value={count} label={t('dashboard.review')} hint={t('dashboard.reviewHint')} to="/incidents/review" attention={count > 0} />;
}

/** Second step of the release: reports released for compensation wait for the release for billing. */
export function BillingTile() {
  const { t } = useTranslation('incidents');
  const { data: settings } = useSettings();
  const twoSteps = settings?.compensationRelease ?? false;
  const { data = [] } = useIncidents({ status: 'released-compensation' }, twoSteps);
  if (!twoSteps) return null;
  const count = countReports(data, 'released-compensation');
  return <KpiTile value={count} label={t('dashboard.billing')} hint={t('dashboard.billingHint')} to="/incidents/review?status=released-compensation" attention={count > 0} />;
}

export function MyOpenTile() {
  const { t } = useTranslation('incidents');
  const { data = [] } = useIncidents({ status: 'draft', mine: true });
  const count = countReports(data, 'draft');
  return <KpiTile value={count} label={t('dashboard.myOpen')} hint={t('dashboard.myOpenHint')} to="/incidents/incidents" attention={count > 0} />;
}

export function RecentIncidents() {
  const { t, i18n: { language } } = useTranslation('incidents');
  const names = useNames();
  const [from] = useState(() => localDate(new Date(Date.now() - 60 * 86_400_000)));
  const { data = [] } = useIncidents({ from });
  return (
    <Panel title={t('dashboard.recent')} aside={<Text component={Link} to="/incidents/incidents" size="sm" c="brand" fw={700}>{t('dashboard.all')}</Text>}>
      <DataTable<Incident>
        exportable={false}
        rows={data.slice(0, 5)}
        rowKey={(i) => i.id}
        empty={t('incidents.empty')}
        columns={[
          {
            key: 'keyword',
            header: t('fields.keyword'),
            render: (i) => (
              <Link to={`/incidents/incidents/${i.id}`} style={{ textDecoration: 'none' }}>
                <Text fw={700} size="sm" c="brand">{keywordLabel(i)}</Text>
                <Text size="xs" c="dimmed">{locationLabel(i)}</Text>
              </Link>
            ),
          },
          { key: 'alarm', header: t('fields.alarmedAt'), render: (i) => formatDateTime(i.alarmedAt, language) },
          { key: 'reports', header: t('incidents.reports'), render: (i) => i.reports.map((r) => <DepartmentBadge key={r.id} name={names.department(r.departmentId)} primary={r.primary} />) },
          { key: 'status', header: t('fields.status'), render: (i) => { const s = incidentStatus(i); return s && <ReportStatusBadge status={s} />; } },
        ]}
      />
    </Panel>
  );
}

/** Counter at "Zur Prüfung" in the menu for users who release reports: for review and, with two steps, for billing. */
export function useNavigationBadges(): Record<string, number | undefined> {
  const session = useSession().data;
  const releaser = can(session, RELEASE);
  const { data: settings } = useSettings();
  const twoSteps = releaser && (settings?.compensationRelease ?? false);
  const { data = [] } = useIncidents({ status: 'review' }, releaser);
  const { data: billing = [] } = useIncidents({ status: 'released-compensation' }, twoSteps);
  const count = countReports(data, 'review') + (twoSteps ? countReports(billing, 'released-compensation') : 0);
  return { review: releaser ? count || undefined : undefined };
}
