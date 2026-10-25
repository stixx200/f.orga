import { Button, Checkbox, Select, SimpleGrid, Stack, Text, Textarea } from '@mantine/core';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Incident, RemindResult, Report } from '@forga/incidents-contracts';
import { api, apiUrl, can, formatDate, send, useSession, useTranslation } from '@forga/web-sdk';
import { ActionBar, ConfirmDialog, DataTable, EmptyState, KpiTile, notifySuccess, PageHeader, Panel, StatusBadge, useAction } from '@forga/web-ui';
import { keys, personName, RELEASE, REVIEW, useIncidents, useNames, usePersons, WRITE } from '../api';
import { blocking, findingText, mergeFindings, openWarnings } from '../report/findings';

type Row = { incident: Incident; summary: Incident['reports'][number]; report?: Report };

const DAY = 86_400_000;

/** Open reports (drafts and returned ones) by author, with hints, author assignment and reminder e-mails. */
export function OpenReportsPage() {
  const { t, i18n } = useTranslation('incidents');
  const session = useSession().data;
  const names = useNames();
  const { data: persons = [] } = usePersons();
  const { data: drafts = [], isLoading } = useIncidents({ status: 'draft' });
  const { data: review = [] } = useIncidents({ status: 'review' });
  const summaries = drafts.flatMap((incident) => incident.reports.filter((r) => r.status === 'draft').map((summary) => ({ incident, summary })));
  const details = useQueries({ queries: summaries.map(({ summary }) => ({ queryKey: keys.report(summary.id), queryFn: () => api<Report>(`incidents/reports/${summary.id}`) })) });
  const rows: Row[] = summaries.map((s, i) => ({ ...s, report: details[i]?.data }));
  const [now] = useState(() => Date.now());
  const [reminding, setReminding] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [message, setMessage] = useState('');

  const authors = [...new Set(rows.map((r) => r.summary.authorPersonId).filter((id): id is string => Boolean(id)))];
  const withoutAuthor = rows.filter((r) => !r.summary.authorPersonId);
  const withoutPrimary = drafts.filter((i) => !i.reports.some((r) => r.primary)).length;
  const reviewCount = review.flatMap((i) => i.reports).filter((r) => r.status === 'review').length;
  const releaser = can(session, RELEASE);
  // Releasers remind all authors, pre-reviewers (department commanders) the authors of their departments.
  const reminder = releaser || can(session, REVIEW);

  const assign = useAction(({ reportId, personId }: { reportId: string; personId: string }) => send<Report>('POST', `incidents/reports/${reportId}/author`, { authorPersonId: personId }), {
    success: t('open.assigned'),
    invalidate: [keys.incidents],
  });
  const remind = useAction(() => send<RemindResult>('POST', 'incidents/open-reports/remind', { personIds: chosen, message }), {
    onSuccess: (result) => {
      setReminding(false);
      notifySuccess(t('open.reminded', { count: result.sent.length }) + (result.missingEmail.length ? ` ${t('open.missingEmail', { names: result.missingEmail.join(', ') })}` : ''));
    },
  });

  const table = (list: Row[]) => (
    <DataTable<Row>
      rows={list}
      rowKey={(r) => r.summary.id}
      highlight={(r) => (r.report ? blocking(r.report.findings).length > 0 : false)}
      columns={[
        {
          key: 'incident',
          header: t('review.incident'),
          render: (r) => (
            <>
              <Text component={Link} to={`/incidents/reports/${r.summary.id}`} fw={700} size="sm" c="brand">{`${r.incident.alarmKeyword} ${r.incident.alarmMessage}`.trim()}</Text>
              <Text size="xs" c="dimmed">{t('open.alarm', { date: formatDate(r.incident.alarmedAt, i18n.language) })}</Text>
            </>
          ),
        },
        { key: 'department', header: t('fields.department'), render: (r) => <>{names.department(r.summary.departmentId)} {r.summary.primary && <StatusBadge tone="primary">{t('open.primary')}</StatusBadge>}</> },
        { key: 'age', header: t('open.openSince'), render: (r) => t('open.days', { count: Math.max(0, Math.floor((now - new Date(r.incident.alarmedAt).getTime()) / DAY)) }) },
        {
          key: 'hints',
          header: t('review.notes'),
          render: (r) => {
            if (!r.report) return '…';
            const open = [...blocking(mergeFindings(r.report.findings)), ...openWarnings(mergeFindings(r.report.findings))];
            const returned = r.report.returnComment ? `${t('open.returned')}: ${r.report.returnComment}` : '';
            return open.length || returned ? <Text size="xs">{[returned, ...open.slice(0, 3).map((f) => findingText(f, t))].filter(Boolean).join(' · ')}</Text> : <StatusBadge tone="done">{t('open.ready')}</StatusBadge>;
          },
        },
        {
          key: 'assign',
          header: t('report.author'),
          // Every row: also an assigned author can be changed (e.g. on holiday), by writers of the department and releasers.
          render: (r: Row) =>
            (can(session, WRITE, r.summary.departmentId) || releaser) && !r.summary.locked ? (
              <Select
                aria-label={t(r.summary.authorPersonId ? 'open.change' : 'open.assign')}
                placeholder={t(r.summary.authorPersonId ? 'open.change' : 'open.assign')}
                data={persons
                  .filter((p) => p.departmentIds.includes(r.summary.departmentId) && p.status !== 'left' && p.id !== r.summary.authorPersonId)
                  .map((p) => ({ value: p.id, label: personName(p) }))}
                value={null}
                onChange={(v) => v && assign.mutate({ reportId: r.summary.id, personId: v })}
                searchable
                size="xs"
                w={220}
              />
            ) : null,
        },
      ]}
    />
  );

  return (
    <Stack gap="lg" pb={80}>
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('open.title') }]} title={t('open.title')} />
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <KpiTile value={rows.length} label={t('open.kpiOpen')} hint={t('open.kpiOpenHint')} attention={rows.length > 0} />
        <KpiTile value={reviewCount} label={t('open.kpiReview')} hint={t('open.kpiReviewHint')} to={releaser ? '/incidents/review' : undefined} />
        <KpiTile value={withoutPrimary} label={t('open.kpiNoPrimary')} hint={t('open.kpiNoPrimaryHint')} attention={withoutPrimary > 0} />
        <KpiTile value={withoutAuthor.length} label={t('open.kpiNoAuthor')} hint={t('open.kpiNoAuthorHint')} attention={withoutAuthor.length > 0} />
      </SimpleGrid>
      {!isLoading && !rows.length && <EmptyState title={t('open.empty')} />}
      {authors.map((id) => {
        const person = persons.find((p) => p.id === id);
        const own = rows.filter((r) => r.summary.authorPersonId === id);
        return (
          <Panel key={id} title={person ? personName(person) : t('personnel.unknownPerson')} aside={<Text size="sm" c="dimmed">{[person?.email, t('open.reports', { count: own.length })].filter(Boolean).join(' · ')}</Text>}>
            {table(own)}
          </Panel>
        );
      })}
      {withoutAuthor.length > 0 && <Panel title={t('open.withoutAuthor')}>{table(withoutAuthor)}</Panel>}
      <ActionBar info={t('open.footer')}>
        <Button component="a" href={apiUrl('core/lists/incidents.open-reports/export/xlsx', { lang: i18n.language })} variant="default">Excel</Button>
        {reminder && authors.length > 0 && (
          <Button
            onClick={() => {
              setChosen(authors.filter((a) => persons.find((p) => p.id === a)?.email));
              setReminding(true);
            }}
          >
            {t('open.remind')}
          </Button>
        )}
      </ActionBar>
      {reminding && (
        <ConfirmDialog opened onClose={() => setReminding(false)} title={t('open.remindTitle')} description={t('open.remindText')} confirmLabel={t('open.send', { count: chosen.length })} loading={remind.isPending} onConfirm={() => remind.mutate(undefined)}>
          <Checkbox.Group value={chosen} onChange={setChosen} my="sm">
            <Stack gap={6}>
              {authors.map((id) => {
                const person = persons.find((p) => p.id === id);
                const count = rows.filter((r) => r.summary.authorPersonId === id).length;
                return (
                  <Checkbox
                    key={id}
                    value={id}
                    disabled={!person?.email}
                    label={`${person ? personName(person) : id} · ${t('open.reports', { count })}`}
                    description={person?.email || t('open.noEmail')}
                  />
                );
              })}
            </Stack>
          </Checkbox.Group>
          <Textarea label={t('open.message')} value={message} onChange={(e) => setMessage(e.currentTarget.value)} autosize minRows={2} />
        </ConfirmDialog>
      )}
    </Stack>
  );
}
