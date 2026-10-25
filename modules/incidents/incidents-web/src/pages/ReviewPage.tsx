import { Button, Chip, Grid, Group, Stack, Text } from '@mantine/core';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Incident, Report, ReportStatus } from '@forga/incidents-contracts';
import { api, formatDateTime, formatMoney, useTranslation } from '@forga/web-sdk';
import { DataTable, EmptyState, Notice, PageHeader, Panel, StatusBadge } from '@forga/web-ui';
import { keys, useIncidents, useNames } from '../api';
import { DepartmentBadge, keywordLabel, ReportStatusBadge } from '../parts';
import { findingText, mergeFindings } from '../report/findings';
import { WorkflowActions } from '../WorkflowActions';

type Row = { incident: Incident; summary: Incident['reports'][number]; report?: Report };

function Detail({ row, onDone }: { row: Row; onDone: () => void }) {
  const { t, i18n } = useTranslation('incidents');
  const names = useNames();
  const { report, incident, summary } = row;
  if (!report) return null;
  const findings = mergeFindings(report.findings);
  const acknowledged = findings.filter((f) => f.level === 'warning' && f.acknowledged);
  const errors = findings.filter((f) => f.level === 'error');
  const standby = report.personnel.filter((p) => p.standbyStationId).length;
  return (
    <Panel title={`${names.department(summary.departmentId)} · ${keywordLabel(incident)}`} aside={<ReportStatusBadge status={report.status} locked={report.locked} />}>
      <Stack gap="sm">
        <Text size="sm"><Text span c="dimmed">{t('report.time')}: </Text>{formatDateTime(report.times.alarmedAt, i18n.language)} – {formatDateTime(report.times.returnedAt, i18n.language)}</Text>
        <Text size="sm"><Text span c="dimmed">{t('report.author')}: </Text>{names.person(report.authorPersonId) || '–'}</Text>
        <Text size="sm"><Text span c="dimmed">{t('report.personnel')}: </Text>{t('review.personnel', { count: report.personnel.length, standby })}</Text>
        <Text size="sm"><Text span c="dimmed">{t('review.compensation')}: </Text><strong>{formatMoney(report.compensationTotal, i18n.language)}</strong></Text>
        {errors.map((f) => <Notice key={`${f.rule}-${f.subject}`} kind="error">{findingText(f, t)}</Notice>)}
        {acknowledged.map((f) => (
          <Notice key={`${f.rule}-${f.subject}`} kind="warning">
            {findingText(f, t)} {t('review.reason', { reason: f.reason === 'released' ? t('check.releasedReason') : f.reason })}
          </Notice>
        ))}
        <Button component={Link} to={`/incidents/reports/${report.id}`} variant="subtle" px={0} style={{ alignSelf: 'flex-start' }}>{t('review.open')}</Button>
        <WorkflowActions report={report} onDone={onDone} />
      </Stack>
    </Panel>
  );
}

/** Submitted reports waiting for release, and reports released for compensation waiting for billing. */
export function ReviewPage() {
  const { t, i18n } = useTranslation('incidents');
  const names = useNames();
  const [status, setStatus] = useState<ReportStatus>('review');
  const [selected, setSelected] = useState<string | null>(null);
  const { data: incidents = [], isLoading } = useIncidents({ status });
  const summaries = incidents.flatMap((incident) => incident.reports.filter((r) => r.status === status).map((summary) => ({ incident, summary })));
  const details = useQueries({
    queries: summaries.map(({ summary }) => ({ queryKey: keys.report(summary.id), queryFn: () => api<Report>(`incidents/reports/${summary.id}`) })),
  });
  const rows: Row[] = summaries.map((s, i) => ({ ...s, report: details[i]?.data }));
  const current = rows.find((r) => r.summary.id === selected) ?? rows[0];

  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('review.title') }]} title={t('review.title')} />
      <Chip.Group value={status} onChange={(value) => { setStatus(value as ReportStatus); setSelected(null); }}>
        <Group gap="xs">
          <Chip value="review" radius="xs">{t('review.views.review')}</Chip>
          <Chip value="released-compensation" radius="xs">{t('review.views.compensation')}</Chip>
        </Group>
      </Chip.Group>
      {!isLoading && !rows.length ? (
        <EmptyState title={t(status === 'review' ? 'review.empty' : 'review.emptyCompensation')} text={status === 'review' ? t('review.emptyText') : undefined} />
      ) : (
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, lg: 7 }}>
            <DataTable<Row>
              rows={rows}
              rowKey={(r) => r.summary.id}
              selectedKey={current?.summary.id}
              onRowClick={(r) => setSelected(r.summary.id)}
              columns={[
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
                { key: 'department', header: t('fields.department'), render: (r) => <DepartmentBadge name={names.department(r.summary.departmentId)} primary={r.summary.primary} /> },
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
          <Grid.Col span={{ base: 12, lg: 5 }}>
            {current && <Detail key={current.summary.id} row={current} onDone={() => setSelected(null)} />}
          </Grid.Col>
        </Grid>
      )}
    </Stack>
  );
}
