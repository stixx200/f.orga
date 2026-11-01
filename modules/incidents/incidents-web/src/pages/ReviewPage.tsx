import { Button, Checkbox, Chip, Grid, Group, Stack, Text } from '@mantine/core';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { Incident, ReleaseManyResult, Report, ReportStatus } from '@forga/incidents-contracts';
import { api, formatDateTime, formatMoney, send, useTranslation } from '@forga/web-sdk';
import { ActionBar, ConfirmDialog, DataTable, EmptyState, Notice, PageHeader, Panel, StatusBadge, useAction, useRevealOnSelect } from '@forga/web-ui';
import { keys, useIncidents, useNames, useReportAccess, useSettings } from '../api';
import { DepartmentBadge, keywordLabel, notifyReleaseResult, ReportStatusBadge } from '../parts';
import { mergeFindings, useFindingText } from '../report/findings';
import { WorkflowActions } from '../WorkflowActions';

type Row = { incident: Incident; summary: Incident['reports'][number]; report?: Report };

function Detail({ row, onDone }: { row: Row; onDone: () => void }) {
  const { t, i18n } = useTranslation('incidents');
  const names = useNames();
  const findingText = useFindingText();
  const { report, incident, summary } = row;
  if (!report) return null;
  const findings = mergeFindings(report.findings);
  const acknowledged = findings.filter((f) => f.level === 'warning' && f.acknowledged);
  const errors = findings.filter((f) => f.level === 'error');
  const standby = report.personnel.filter((p) => p.standbyStationId).length;
  return (
    <Panel title={`${names.owner(summary)} · ${keywordLabel(incident)}`} aside={<ReportStatusBadge status={report.status} locked={report.locked} />}>
      <Stack gap="sm">
        <Text size="sm"><Text span c="dimmed">{t('report.time')}: </Text>{formatDateTime(report.times.alarmedAt, i18n.language)} – {formatDateTime(report.times.returnedAt, i18n.language)}</Text>
        <Text size="sm"><Text span c="dimmed">{t('report.author')}: </Text>{names.person(report.authorPersonId) || '–'}</Text>
        <Text size="sm"><Text span c="dimmed">{t('report.personnel')}: </Text>{t('review.personnel', { count: report.personnel.length, standby })}</Text>
        <Text size="sm"><Text span c="dimmed">{t('review.compensation')}: </Text><strong>{formatMoney(report.compensationTotal, i18n.language)}</strong></Text>
        {errors.map((f) => <Notice key={`${f.rule}-${f.subject}`} kind="error">{findingText(f)}</Notice>)}
        {acknowledged.map((f) => (
          <Notice key={`${f.rule}-${f.subject}`} kind="warning">
            {findingText(f)} {t('review.reason', { reason: f.reason === 'released' ? t('check.releasedReason') : f.reason })}
          </Notice>
        ))}
        <Button component={Link} to={`/incidents/reports/${report.id}`} variant="subtle" px={0} style={{ alignSelf: 'flex-start' }}>{t('review.open')}</Button>
        <WorkflowActions report={report} onDone={onDone} />
      </Stack>
    </Panel>
  );
}

/**
 * Submitted reports waiting for release, and reports released for compensation waiting for billing. Pre-reviewers
 * (`incidents.reports.review`) see the submitted reports of their departments and return them or remind authors.
 */
export function ReviewPage() {
  const { t, i18n } = useTranslation('incidents');
  const names = useNames();
  const access = useReportAccess();
  const releaser = access.releaser;
  const [params] = useSearchParams();
  const [status, setStatus] = useState<ReportStatus>(() => (releaser && params.get('status') === 'released-compensation' ? 'released-compensation' : 'review'));
  const [selected, setSelected] = useState<string | null>(null);
  const detail = useRevealOnSelect(selected);
  const { data: incidents = [], isLoading } = useIncidents({ status });
  const summaries = incidents.flatMap((incident) =>
    incident.reports.filter((r) => r.status === status && access.review(r)).map((summary) => ({ incident, summary })),
  );
  const details = useQueries({
    queries: summaries.map(({ summary }) => ({ queryKey: keys.report(summary.id), queryFn: () => api<Report>(`incidents/reports/${summary.id}`) })),
  });
  const rows: Row[] = summaries.map((s, i) => ({ ...s, report: details[i]?.data }));
  const current = rows.find((r) => r.summary.id === selected) ?? rows[0];
  // Several error-free reports are released together.
  const { data: settings } = useSettings();
  const level = status === 'review' && (settings?.compensationRelease ?? true) ? 'compensation' : 'billing';
  const [chosen, setChosen] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const releasable = (r: Row) => Boolean(r.report) && !r.report!.findings.some((f) => f.level === 'error');
  const picked = rows.filter((r) => chosen.includes(r.summary.id) && releasable(r));
  const releaseMany = useAction((reportIds: string[]) => send<ReleaseManyResult>('POST', 'incidents/reports/release', { reportIds, level }), {
    invalidate: [keys.incidents, ['incidents', 'reports']],
    onSuccess: (result) => {
      setConfirming(false);
      setChosen([]);
      notifyReleaseResult(result, (reportId) => {
        const row = rows.find((r) => r.summary.id === reportId);
        return row ? `${keywordLabel(row.incident)} · ${names.owner(row.summary)} ${row.summary.number}` : reportId;
      }, t);
    },
  });

  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('review.title') }]} title={t('review.title')} />
      {releaser && (
        <Chip.Group value={status} onChange={(value) => { setStatus(value as ReportStatus); setSelected(null); setChosen([]); }}>
          <Group gap="xs">
            <Chip value="review" radius="xs">{t('review.views.review')}</Chip>
            <Chip value="released-compensation" radius="xs">{t('review.views.compensation')}</Chip>
          </Group>
        </Chip.Group>
      )}
      {!releaser && <Text size="sm" c="dimmed">{t('review.preReviewHint')}</Text>}
      {!isLoading && !rows.length ? (
        <EmptyState title={t(status === 'review' ? 'review.empty' : 'review.emptyCompensation')} text={status === 'review' ? t('review.emptyText') : undefined} />
      ) : (
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, lg: 7 }}>
            {releaser && (
              <Group justify="flex-end" mb="xs">
                <Button size="xs" variant="subtle" disabled={!rows.some(releasable)} onClick={() => setChosen(rows.filter(releasable).map((r) => r.summary.id))}>
                  {t('review.chooseAll')}
                </Button>
              </Group>
            )}
            <DataTable<Row>
              rows={rows}
              rowKey={(r) => r.summary.id}
              selectedKey={current?.summary.id}
              onRowClick={(r) => setSelected(r.summary.id)}
              columns={[
                {
                  key: 'choose',
                  header: '',
                  render: (r) => releaser && (
                    <Checkbox
                      aria-label={t('review.choose')}
                      disabled={!releasable(r)}
                      checked={chosen.includes(r.summary.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        setChosen((c) => (checked ? [...c, r.summary.id] : c.filter((id) => id !== r.summary.id)));
                      }}
                    />
                  ),
                },
                {
                  key: 'incident',
                  header: t('review.incident'),
                  render: (r) => (
                    <>
                      <Text fw={700} size="sm" c="brand">{keywordLabel(r.incident)}</Text>
                      <Text size="xs" c="dimmed">{r.incident.dispatchNumber} · {formatDateTime(r.incident.alarmedAt, i18n.language)}</Text>
                    </>
                  ),
                },
                { key: 'department', header: t('fields.department'), render: (r) => <DepartmentBadge name={names.owner(r.summary)} primary={r.summary.primary} unit={Boolean(r.summary.unit)} /> },
                { key: 'author', header: t('report.author'), render: (r) => names.person(r.summary.authorPersonId) || '–' },
                { key: 'personnel', header: t('report.personnel'), align: 'right', render: (r) => r.report?.personnel.length ?? '' },
                { key: 'amount', header: t('review.amount'), align: 'right', render: (r) => (r.report ? formatMoney(r.report.compensationTotal, i18n.language) : '') },
                {
                  key: 'notes',
                  header: t('review.notes'),
                  render: (r) => {
                    if (!r.report) return null;
                    const findings = mergeFindings(r.report.findings);
                    const errors = findings.filter((f) => f.level === 'error').length;
                    const warnings = findings.filter((f) => f.level === 'warning').length;
                    if (errors) return <StatusBadge tone="error">{t('review.errors', { count: errors })}</StatusBadge>;
                    if (warnings) return <StatusBadge tone="warning">{t('review.warnings', { count: warnings })}</StatusBadge>;
                    return <StatusBadge tone="done">{t('review.none')}</StatusBadge>;
                  },
                },
              ]}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, lg: 5 }} ref={detail}>
            {current && <Detail key={current.summary.id} row={current} onDone={() => setSelected(null)} />}
          </Grid.Col>
        </Grid>
      )}
      {releaser && picked.length > 0 && (
        <ActionBar info={t('review.chosen', { count: picked.length })}>
          <Button onClick={() => setConfirming(true)}>{t(level === 'compensation' ? 'review.releaseChosenCompensation' : 'review.releaseChosenBilling', { count: picked.length })}</Button>
        </ActionBar>
      )}
      <ConfirmDialog
        opened={confirming}
        onClose={() => setConfirming(false)}
        title={t('workflow.releaseTitle')}
        description={t('review.releaseChosenText', { count: picked.length })}
        confirmLabel={t('workflow.releaseNow')}
        loading={releaseMany.isPending}
        onConfirm={() => releaseMany.mutate(picked.map((r) => r.summary.id))}
      />
    </Stack>
  );
}
