import { Text } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Incident } from '@forga/incidents-contracts';
import { can, formatDateTime, localDate, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, KpiTile, Panel } from '@forga/web-ui';
import { RELEASE, REVIEW, useIncidents, useNames, useSettings } from './api';
import { useForeignBufferCleanup } from './report/editor';
import { DepartmentBadge, incidentStatus, keywordLabel, locationLabel, ReportStatusBadge } from './parts';

/** Number of reports in the given status among the incidents returned (optionally only of some departments). */
const countReports = (incidents: Incident[], status: string, departments: (id: string) => boolean = () => true) =>
  incidents.flatMap((i) => i.reports).filter((r) => r.status === status && departments(r.departmentId)).length;

/** The setting `compensationRelease` (two-step release) as the server applies it: on unless switched off. */
const twoStepRelease = (settings: { compensationRelease?: boolean } | undefined) => settings?.compensationRelease ?? true;

/** Releasers review all departments, pre-reviewers (`incidents.reports.review`) theirs. */
function useReviewer() {
  const session = useSession().data;
  const releaser = can(session, RELEASE);
  return { releaser, reviewer: releaser || can(session, REVIEW), reviews: (departmentId: string) => releaser || can(session, REVIEW, departmentId) };
}

export function ReviewTile() {
  const { t } = useTranslation('incidents');
  const { reviewer, reviews } = useReviewer();
  const { data = [] } = useIncidents({ status: 'review' }, reviewer);
  if (!reviewer) return null;
  const count = countReports(data, 'review', reviews);
  return <KpiTile value={count} label={t('dashboard.review')} hint={t('dashboard.reviewHint')} to="/incidents/review" attention={count > 0} />;
}

/** Second step of the release: reports released for compensation wait for the release for billing. */
export function BillingTile() {
  const { t } = useTranslation('incidents');
  const { data: settings } = useSettings();
  const twoSteps = twoStepRelease(settings);
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

/**
 * Counter at "Zur Prüfung" in the menu: reports for review (pre-reviewers: of their departments) and, for releasers
 * with two steps, for billing.
 */
export function useNavigationBadges(): Record<string, number | undefined> {
  // Runs for every logged-in user: unsaved report content of other users is removed from this browser.
  useForeignBufferCleanup();
  const { releaser, reviewer, reviews } = useReviewer();
  const { data: settings } = useSettings();
  const twoSteps = releaser && twoStepRelease(settings);
  const { data = [] } = useIncidents({ status: 'review' }, reviewer);
  const { data: billing = [] } = useIncidents({ status: 'released-compensation' }, twoSteps);
  const count = countReports(data, 'review', reviews) + (twoSteps ? countReports(billing, 'released-compensation') : 0);
  return { review: reviewer ? count || undefined : undefined };
}
