import { Button, Group, SegmentedControl, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { CompensationCheck, CompensationProblem } from '@forga/incidents-contracts';
import { api, apiUrl, formatDate, useTranslation, withQuery } from '@forga/web-sdk';
import { ActionBar, DataTable, KpiTile, Notice, PageHeader, Panel, StatusBadge } from '@forga/web-ui';

const iso = (d: Date) => d.toISOString().slice(0, 10);

function monthRange(offset: number): [string, string] {
  const now = new Date();
  const first = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset, 1));
  const last = new Date(Date.UTC(now.getFullYear(), now.getMonth() + offset + 1, 0));
  return [iso(first), iso(last)];
}

/** Payout run: check the reports of a period for personnel problems, then export the compensation as Excel. */
export function CompensationPage() {
  const { t, i18n } = useTranslation('incidents');
  const [initial] = useState(() => monthRange(-1));
  const [from, setFrom] = useState<string | null>(initial[0]);
  const [to, setTo] = useState<string | null>(initial[1]);
  const [includeUnreleased, setIncludeUnreleased] = useState(false);
  const { data: check, isFetching } = useQuery({
    queryKey: ['incidents', 'compensation', 'check', from, to],
    queryFn: () => api<CompensationCheck>(withQuery('incidents/compensation/check', { from, to })),
    enabled: Boolean(from && to),
  });
  const problems = check?.problems ?? [];
  const errors = problems.filter((p) => p.code !== 'not-released');
  const notReleased = problems.filter((p) => p.code === 'not-released');
  const groups = [...new Set(errors.map((p) => p.code))];
  const setRange = ([a, b]: [string, string]) => {
    setFrom(a);
    setTo(b);
  };

  return (
    <Stack gap="lg" pb={80}>
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('compensation.title') }]} title={t('compensation.title')} subtitle={t('compensation.subtitle')} />
      <Panel>
        <Group align="end" wrap="wrap">
          <SegmentedControl
            data={[
              { value: '-1', label: t('compensation.lastMonth') },
              { value: '0', label: t('compensation.thisMonth') },
            ]}
            onChange={(v) => setRange(monthRange(Number(v)))}
            defaultValue="-1"
          />
          <DateInput label={t('compensation.from')} value={from} onChange={setFrom} valueFormat="DD.MM.YYYY" w={160} />
          <DateInput label={t('compensation.to')} value={to} onChange={setTo} valueFormat="DD.MM.YYYY" w={160} />
          <Switch label={t('compensation.includeUnreleased')} checked={includeUnreleased} onChange={(e) => setIncludeUnreleased(e.currentTarget.checked)} mb={8} />
        </Group>
      </Panel>
      {check && (
        <>
          <SimpleGrid cols={{ base: 2, md: 4 }}>
            <KpiTile value={check.reportsChecked} label={t('compensation.checked')} />
            <KpiTile value={check.reportsReleased} label={t('compensation.released')} />
            <KpiTile value={errors.length} label={t('compensation.errors')} attention={errors.length > 0} />
            <KpiTile value={notReleased.length} label={t('compensation.notReleased')} hint={t('compensation.notReleasedHint')} />
          </SimpleGrid>
          {errors.length === 0 ? (
            <Notice kind="done">{t('compensation.noProblems')}</Notice>
          ) : (
            <Notice kind="error">{t('compensation.problemsFound', { count: errors.length })}</Notice>
          )}
          {groups.map((code) => (
            <Panel key={code} title={t(`compensation.codes.${code}`, { defaultValue: t(`rules.${code}`, { person: '…', department: '…', dispatchNumber: '…', count: '…', seats: '…', defaultValue: code }) })}>
              <ProblemTable problems={errors.filter((p) => p.code === code)} language={i18n.language} />
            </Panel>
          ))}
          {notReleased.length > 0 && (
            <Panel title={t('compensation.notReleasedTitle', { count: notReleased.length })}>
              <ProblemTable problems={notReleased} language={i18n.language} />
            </Panel>
          )}
        </>
      )}
      <ActionBar info={isFetching ? t('loading') : errors.length ? t('compensation.exportBlocked') : t('compensation.exportReady')}>
        <Button
          component="a"
          href={from && to ? apiUrl('incidents/compensation/export', { from, to, includeUnreleased: includeUnreleased ? 'true' : 'false', lang: i18n.language }) : undefined}
          data-disabled={!from || !to || errors.length > 0 || undefined}
          onClick={(e) => (!from || !to || errors.length > 0) && e.preventDefault()}
        >
          {t('compensation.export')}
        </Button>
      </ActionBar>
    </Stack>
  );
}

function ProblemTable({ problems, language }: { problems: CompensationProblem[]; language: string }) {
  const { t } = useTranslation('incidents');
  return (
    <DataTable<CompensationProblem>
      rows={problems}
      rowKey={(p) => `${p.reportId}-${p.code}-${p.person ?? ''}`}
      columns={[
        { key: 'date', header: t('fields.alarmedAt'), render: (p) => formatDate(p.alarmedAt, language) },
        { key: 'incident', header: t('review.incident'), render: (p) => <Text component={Link} to={`/incidents/reports/${p.reportId}`} size="sm" fw={700} c="brand">{p.dispatchNumber}</Text> },
        { key: 'department', header: t('fields.department'), render: (p) => `${p.department} · ${p.reportNumber}` },
        { key: 'person', header: t('compensation.person'), render: (p) => p.person ?? '' },
        { key: 'status', header: t('fields.status'), render: (p) => <StatusBadge>{t(`status.${p.status}`)}</StatusBadge> },
      ]}
    />
  );
}
