import { Button, Checkbox, Group, Radio, SegmentedControl, Select, Stack, Table, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Language } from '@forga/core-contracts';
import { type AccessReport, type AccessReportChannel, type AccessReportCreate, type AccessReportHandOver, type AccessReportSectionSummary, type MyAccessReport, OPEN_REQUEST_STATUSES, type PersonPrivacy } from '@forga/privacy-contracts';
import { api, apiUrl, formatDate, formatDateTime, openAfterStepUp, send, useTranslation } from '@forga/web-sdk';
import { DataTable, EmptyState, Notice, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';

const KEY = ['core', 'access-reports'] as const;
export const MY_ACCESS_REPORTS_KEY = ['core', 'me', 'access-reports'] as const;
const CHANNELS: AccessReportChannel[] = ['self-service', 'in-person', 'post'];

const file = (report: AccessReport, inline: boolean) => apiUrl(`privacy/access-reports/${report.id}/file`, inline ? { inline: '1' } : {});
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

/** Dialog „Auskunft nach Art. 15 erstellen“: language, JSON attachment, the areas with their number of entries. */
function CreateDialog({ personId, opened, onClose }: { personId: string; opened: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation('privacy');
  const [language, setLanguage] = useState<Language>(i18n.language === 'en' ? 'en' : 'de');
  const [includeJson, setIncludeJson] = useState(false);
  // Open access requests of the person; the report answers the oldest by default.
  const { data: personPrivacy } = useQuery({ queryKey: ['privacy', 'persons', personId], queryFn: () => api<PersonPrivacy>(`privacy/persons/${personId}`), enabled: opened });
  const openRequests = (personPrivacy?.requests ?? []).filter((r) => r.kind === 'access' && OPEN_REQUEST_STATUSES.includes(r.status)).toSorted((a, b) => a.receivedOn.localeCompare(b.receivedOn));
  const [requestId, setRequestId] = useState<string | null | undefined>(undefined);
  const chosen = requestId === undefined ? (openRequests[0]?.id ?? null) : requestId;
  const { data: preview, isLoading } = useQuery({
    queryKey: [...KEY, 'preview', personId, language],
    queryFn: () => api<AccessReportSectionSummary[]>(`privacy/access-reports/preview?personId=${personId}&language=${language}`),
    enabled: opened,
  });
  const create = useAction((input: AccessReportCreate) => send<AccessReport>('POST', 'privacy/access-reports', input), {
    invalidate: [KEY, ['privacy']],
    success: t('accessReport.started'),
    onSuccess: onClose,
  });
  return (
    <ResponsiveDialog
      opened={opened}
      onClose={onClose}
      title={t('accessReport.dialogTitle')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{t('accessReport.cancel')}</Button>
          <Button loading={create.isPending} onClick={() => create.mutate({ personId, language, includeJson, requestId: chosen })}>{t('accessReport.submit')}</Button>
        </>
      }
    >
      <Stack gap="md">
        <Select
          label={t('accessReport.request')}
          allowDeselect={false}
          value={chosen ?? 'none'}
          onChange={(value) => setRequestId(!value || value === 'none' ? null : value)}
          data={[
            ...openRequests.map((r) => ({ value: r.id, label: t('accessReport.requestOption', { date: formatDate(r.receivedOn, i18n.language), channel: t(`privacy.channels.${r.channel}`), due: formatDate(r.deadline, i18n.language) }) })),
            { value: 'none', label: t('accessReport.noRequest') },
          ]}
        />
        <Stack gap={4}>
          <Text size="sm" fw={500}>{t('accessReport.language')}</Text>
          <SegmentedControl value={language} onChange={(value) => setLanguage(value as Language)} data={[{ value: 'de', label: t('accessReport.languages.de') }, { value: 'en', label: t('accessReport.languages.en') }]} />
        </Stack>
        <Text size="sm">{t('accessReport.scope')}</Text>
        {isLoading ? (
          <Text size="sm" c="dimmed">{t('accessReport.counting')}</Text>
        ) : (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('accessReport.area')}</Table.Th>
                <Table.Th ta="right">{t('accessReport.entries')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(preview ?? []).map((s) => (
                <Table.Tr key={s.key}>
                  <Table.Td>
                    {s.title} {s.health && <StatusBadge tone="warning">{t('accessReport.health')}</StatusBadge>}
                  </Table.Td>
                  <Table.Td ta="right">{s.entries}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
        <Checkbox checked={includeJson} onChange={(e) => setIncludeJson(e.currentTarget.checked)} label={t('accessReport.json')} />
        <Notice kind="info">{t('accessReport.thirdParties')}</Notice>
      </Stack>
    </ResponsiveDialog>
  );
}

/** Button „Auskunft erstellen …“ in the header of the person file (extension point `masterdata.person.actions`). */
export function AccessReportButton({ personId }: { personId: string }) {
  const { t } = useTranslation('privacy');
  const [opened, setOpened] = useState(false);
  return (
    <>
      <Button variant="default" onClick={() => setOpened(true)}>{t('accessReport.create')}</Button>
      {opened && <CreateDialog personId={personId} opened={opened} onClose={() => setOpened(false)} />}
    </>
  );
}

/** Dialog „Übergabe vermerken“: day and way; „in Mein Bereich“ tells the person by e-mail. */
function HandOverDialog({ report, onClose }: { report: AccessReport; onClose: () => void }) {
  const { t } = useTranslation('privacy');
  // A third party has no account: no "My area".
  const channels = report.personId ? CHANNELS : CHANNELS.filter((c) => c !== 'self-service');
  const [channel, setChannel] = useState<AccessReportChannel>(report.channel ?? channels[0]);
  const [date, setDate] = useState<string | null>(today());
  const [closeRequest, setCloseRequest] = useState(Boolean(report.requestId));
  const handOver = useAction((input: AccessReportHandOver) => send<AccessReport>('POST', `privacy/access-reports/${report.id}/hand-over`, input), {
    // The request may be closed with the handover.
    invalidate: [KEY, ['privacy']],
    success: t('accessReport.handedOverSaved'),
    onSuccess: onClose,
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('accessReport.handOverTitle')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{t('accessReport.cancel')}</Button>
          <Button loading={handOver.isPending} disabled={!date} onClick={() => handOver.mutate({ channel, date: date ?? undefined, closeRequest: Boolean(report.requestId) && closeRequest })}>{t('accessReport.save')}</Button>
        </>
      }
    >
      <Stack gap="md">
        <DateInput label={t('accessReport.handedOverOn')} value={date} onChange={(value) => setDate(value)} valueFormat="DD.MM.YYYY" />
        <Radio.Group label={t('accessReport.way')} value={channel} onChange={(value) => setChannel(value as AccessReportChannel)}>
          <Stack gap={6} mt={6}>
            {channels.map((c) => <Radio key={c} value={c} label={t(`accessReport.channels.${c}`)} />)}
          </Stack>
        </Radio.Group>
        {channel === 'self-service' && <Text size="sm" c="dimmed">{t('accessReport.provideHint')}</Text>}
        {report.requestId && <Checkbox checked={closeRequest} onChange={(e) => setCloseRequest(e.currentTarget.checked)} label={t('accessReport.closeRequest')} />}
      </Stack>
    </ResponsiveDialog>
  );
}

/** „Erstellte Auskünfte“ in the tab „Datenschutz“ of the person file. */
/** Access reports with state, view, download and „Übergabe vermerken“. */
export function ReportsTable({ reports }: { reports: AccessReport[] }) {
  const { t, i18n } = useTranslation('privacy');
  const [handing, setHanding] = useState<AccessReport | null>(null);
  const state = (r: AccessReport) => {
    if (r.status === 'pending') return <StatusBadge tone="neutral">{t('accessReport.status.pending')}</StatusBadge>;
    if (r.status === 'failed') return <StatusBadge tone="error">{t('accessReport.status.failed')}</StatusBadge>;
    const handed = r.channel ? `${t(`accessReport.channels.${r.channel}`)} ${formatDate(r.handedOverOn, i18n.language)}` : null;
    if (r.status === 'expired') return <Text size="sm">{[handed, t('accessReport.status.expired')].filter(Boolean).join(' · ')}</Text>;
    return handed ? <Text size="sm">{handed}</Text> : <StatusBadge tone="warning">{t('accessReport.status.ready')}</StatusBadge>;
  };
  return (
    <>
      <DataTable
        exportable={false}
        rows={reports}
        rowKey={(r) => r.id}
        columns={[
          { key: 'created', header: t('accessReport.created'), render: (r) => [formatDateTime(r.createdAt, i18n.language), r.createdBy].filter(Boolean).join(' · ') },
          { key: 'language', header: t('accessReport.language'), render: (r) => t(`accessReport.languages.${r.language}`) + (r.includeJson ? ' + JSON' : '') },
          { key: 'handover', header: t('accessReport.handover'), render: state },
          {
            key: 'actions',
            header: '',
            render: (r) =>
              r.status === 'ready' && (
                <Group gap={4} justify="flex-end" wrap="nowrap">
                  <Button size="xs" variant="subtle" onClick={() => void openAfterStepUp(file(r, true), true)}>{t('accessReport.view')}</Button>
                  <Button size="xs" variant="subtle" onClick={() => void openAfterStepUp(file(r, false))}>{t('accessReport.download')}</Button>
                  <Button size="xs" variant="default" onClick={() => setHanding(r)}>{t('accessReport.handOver')}</Button>
                </Group>
              ),
          },
        ]}
      />
      {reports.some((r) => r.status === 'ready') && <Text size="xs" c="dimmed" mt="sm">{t('accessReport.storedFor')}</Text>}
      {handing && <HandOverDialog report={handing} onClose={() => setHanding(null)} />}
    </>
  );
}

function usePersonReports(personId: string) {
  return useQuery({
    queryKey: [...KEY, personId],
    queryFn: () => api<AccessReport[]>(`privacy/access-reports?personId=${personId}`),
    // While a report is being generated, ask again until it is ready.
    refetchInterval: (query) => ((query.state.data ?? []).some((r) => r.status === 'pending') ? 2000 : false),
  });
}

/** „Erstellte Auskünfte“ in the tab „Datenschutz“ of the person file. */
export function AccessReportsPanel({ personId }: { personId: string }) {
  const { t } = useTranslation('privacy');
  const { data: reports = [] } = usePersonReports(personId);
  return (
    <Panel title={t('accessReport.documents')} aside={<AccessReportButton personId={personId} />}>
      {reports.length === 0 ? <EmptyState title={t('accessReport.none')} /> : <ReportsTable reports={reports} />}
    </Panel>
  );
}

/** The access reports answering a data subject request (page of the request). */
export function RequestAccessReports({ personId, requestId }: { personId: string; requestId: string }) {
  const { t } = useTranslation('privacy');
  const { data = [] } = usePersonReports(personId);
  const reports = data.filter((r) => r.requestId === requestId);
  return (
    <Panel title={t('accessReport.forRequest')} aside={<AccessReportButton personId={personId} />}>
      {reports.length === 0 ? <Text size="sm">{t('accessReport.noneForRequest')}</Text> : <ReportsTable reports={reports} />}
    </Panel>
  );
}

/** The reports of a request, also about a third party (L14); `aside` creates one. */
export function useRequestReports(requestId: string) {
  return useQuery({
    queryKey: [...KEY, 'request', requestId],
    queryFn: () => api<AccessReport[]>(`privacy/access-reports?requestId=${requestId}`),
    refetchInterval: (query) => ((query.state.data ?? []).some((r) => r.status === 'pending') ? 2000 : false),
  });
}

export const ACCESS_REPORTS_KEY = KEY;

/** "Mein Bereich": access reports provided to the member, to download after login. */
export function MyAccessReports() {
  const { t, i18n } = useTranslation('privacy');
  const { data: reports = [] } = useQuery({
    queryKey: MY_ACCESS_REPORTS_KEY,
    queryFn: () => api<MyAccessReport[]>('privacy/me/access-reports'),
    refetchInterval: (query) => ((query.state.data ?? []).some((r) => r.status === 'pending') ? 2000 : false),
  });
  if (!reports.length) return null;
  return (
    <Panel title={t('accessReport.mine.title')}>
      <Stack gap="sm">
        <Text size="sm">{t('accessReport.mine.text')}</Text>
        {reports.map((r) => (
          r.status === 'pending' ? (
            <Notice key={r.id} kind="info">{t('accessReport.mine.pending')}</Notice>
          ) : (
            <Notice
              key={r.id}
              kind="done"
              action={<Button size="xs" component="a" href={apiUrl(`privacy/me/access-reports/${r.id}/file`)}>{t('accessReport.mine.download')}</Button>}
            >
              {t('accessReport.mine.ready', { created: formatDate(r.createdAt, i18n.language), until: formatDate(r.expiresAt, i18n.language) })}
            </Notice>
          )
        ))}
      </Stack>
    </Panel>
  );
}
