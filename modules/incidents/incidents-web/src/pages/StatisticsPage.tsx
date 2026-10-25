import { Button, Group, NumberInput, Select, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { type AnnualStatistics, STATISTICS_QUESTIONS, type StatisticsValue } from '@forga/incidents-contracts';
import { api, apiUrl, formatDateTime, send, useTranslation } from '@forga/web-sdk';
import { ActionBar, ConfirmDialog, DataTable, Notice, PageHeader, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';

const COLUMNS = ['D', 'F', 'G', 'H'] as const;
type Column = (typeof COLUMNS)[number];
/** Checks about reports lead to the incidents concerned. */
const CHECK_LINKS: Record<string, (year: string) => string> = {
  'statistics.primaryReportsWithoutStatistics': (year) => `/incidents/incidents?view=withoutStatistics&year=${year}`,
  'statistics.unreleasedPrimaryReports': () => '/incidents/review',
};

type Line = { question: string; text: string; section: string; values: Partial<Record<Column, StatisticsValue>> };

/** Annual statistics for the state portal: computed values, corrections, checks, closing and export. */
export function StatisticsPage() {
  const { t, i18n } = useTranslation('incidents');
  const { t: common } = useTranslation('common');
  const [thisYear] = useState(() => new Date().getFullYear());
  const [year, setYear] = useState(String(thisYear));
  const [section, setSection] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<{ question: string; column: Column; value: number | null } | null>(null);
  const [closing, setClosing] = useState(false);
  const key = ['incidents', 'statistics', year];
  const { data: stats } = useQuery({ queryKey: key, queryFn: () => api<AnnualStatistics>(`incidents/statistics/${year}`) });
  const correct = useAction(
    (input: { question: string; column: Column; value: number | null }) => send('PUT', `incidents/statistics/${year}/corrections`, { corrections: { [`${input.question}:${input.column}`]: input.value } }),
    { success: t('annual.corrected'), invalidate: [key], onSuccess: () => setCorrecting(null) },
  );
  // With open checks the dialog asks first; the server needs `force` then.
  const close = useAction((force: boolean) => send('POST', `incidents/statistics/${year}/close`, { force }), { success: t('annual.closedNotice'), invalidate: [key], onSuccess: () => setClosing(false) });
  const reopen = useAction(() => send('POST', `incidents/statistics/${year}/reopen`), { invalidate: [key] });

  const sections = [...new Set(Object.values(STATISTICS_QUESTIONS).map((q) => q.section))];
  const lines: Line[] = Object.entries(STATISTICS_QUESTIONS)
    .filter(([, q]) => !section || q.section === section)
    .map(([question, q]) => ({
      question,
      text: q.text,
      section: q.section,
      values: Object.fromEntries((stats?.values ?? []).filter((v) => v.question === question).map((v) => [v.column, v])),
    }));
  const failed = stats?.checks.filter((c) => !c.ok) ?? [];
  const closed = Boolean(stats?.closedAt);

  return (
    <Stack gap="lg" pb={80}>
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('annual.title') }]} title={t('annual.titleYear', { year })} badges={closed ? <StatusBadge tone="done">{t('annual.closed')}</StatusBadge> : <StatusBadge tone="warning">{t('annual.preliminary')}</StatusBadge>} />
      <Group align="end">
        <Select label={t('incidents.year')} data={[0, 1, 2, 3].map((i) => String(thisYear - i))} value={year} onChange={(v) => v && setYear(v)} allowDeselect={false} w={140} />
        <Select label={t('annual.section')} placeholder={t('annual.allSections')} data={sections} value={section} onChange={setSection} clearable w={360} />
      </Group>
      <Notice kind="info">{t('annual.info', { date: stats?.referenceDate ?? `${year}-12-31` })}</Notice>
      {closed && <Notice kind="done">{t('annual.closedBy', { by: stats?.closedBy ?? '', at: formatDateTime(stats?.closedAt, i18n.language) })}</Notice>}
      {closed && stats?.changedSinceClose && <Notice kind="warning">{t('annual.changedSinceClose')}</Notice>}
      <Panel title={t('annual.checks')}>
        <Stack gap="xs">
          {failed.map((c) => (
            <Notice
              key={c.code}
              kind="error"
              action={CHECK_LINKS[c.code] && <Button component={Link} to={CHECK_LINKS[c.code](year)} size="xs" variant="outline">{t('annual.showIncidents')}</Button>}
            >
              {t(`annual.checkCodes.${c.code}`, { ...c.params, defaultValue: c.code })}
            </Notice>
          ))}
          {stats && !failed.length && <Notice kind="done">{t('annual.checksOk')}</Notice>}
        </Stack>
      </Panel>
      <DataTable<Line>
        rows={lines}
        rowKey={(l) => l.question}
        highlight={(l) => Object.values(l.values).some((v) => v?.corrected !== null && v?.corrected !== undefined)}
        columns={[
          { key: 'question', header: t('annual.question'), width: 70, render: (l) => <Text fw={700} size="sm">{l.question}</Text> },
          { key: 'text', header: t('annual.text'), render: (l) => l.text },
          ...COLUMNS.map((column) => ({
            key: column,
            header: t(`annual.columns.${column}`),
            align: 'right' as const,
            render: (l: Line) => {
              const v = l.values[column];
              return (
                <Button
                  variant="subtle"
                  size="compact-sm"
                  disabled={closed}
                  onClick={() => setCorrecting({ question: l.question, column, value: v?.corrected ?? v?.value ?? 0 })}
                  title={v?.corrected !== null && v?.corrected !== undefined ? t('annual.correctedFrom', { computed: v.computed }) : undefined}
                >
                  {v ? v.value : '–'}
                  {v?.corrected !== null && v?.corrected !== undefined ? ' *' : ''}
                </Button>
              );
            },
          })),
        ]}
      />
      <Text size="xs" c="dimmed">{t('annual.legend')}</Text>
      <ActionBar info={failed.length ? t('annual.openChecks', { count: failed.length }) : t('annual.noOpenChecks')}>
        <Button component="a" href={apiUrl(`incidents/statistics/${year}/export`)} variant="default">{t('annual.export')}</Button>
        {closed ? (
          <Button variant="default" loading={reopen.isPending} onClick={() => reopen.mutate(undefined)}>{t('annual.reopen')}</Button>
        ) : (
          <Button onClick={() => setClosing(true)}>{t('annual.close')}</Button>
        )}
      </ActionBar>
      {correcting && (
        <ResponsiveDialog
          opened
          onClose={() => setCorrecting(null)}
          title={t('annual.correctTitle', { question: correcting.question, column: t(`annual.columns.${correcting.column}`) })}
          actions={
            <Group justify="space-between">
              <Button variant="subtle" onClick={() => correct.mutate({ ...correcting, value: null })}>{t('annual.removeCorrection')}</Button>
              <Group>
                <Button variant="default" onClick={() => setCorrecting(null)}>{common('actions.cancel')}</Button>
                <Button loading={correct.isPending} onClick={() => correct.mutate(correcting)}>{common('actions.save')}</Button>
              </Group>
            </Group>
          }
        >
          <Text size="sm" mb="sm">{STATISTICS_QUESTIONS[correcting.question]?.text}</Text>
          <NumberInput label={t('annual.value')} value={correcting.value ?? 0} onChange={(v) => setCorrecting({ ...correcting, value: Number(v) || 0 })} min={0} />
        </ResponsiveDialog>
      )}
      <ConfirmDialog
        opened={closing}
        onClose={() => setClosing(false)}
        title={t('annual.closeTitle', { year })}
        description={failed.length ? t('annual.closeWithChecks', { count: failed.length }) : t('annual.closeText')}
        confirmLabel={t('annual.close')}
        loading={close.isPending}
        onConfirm={() => close.mutate(failed.length > 0)}
      />
    </Stack>
  );
}
