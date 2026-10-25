import { Button, Group, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Incident, Report } from '@forga/incidents-contracts';
import { api, can, formatDateTime, formatMoney, fromLocalInput, send, toLocalInput, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, EmptyState, Notice, PageHeader, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { keys, RELEASE, useDepartments, useIncident, useKeywords, useNames, WRITE } from '../api';
import { DepartmentBadge, keywordLabel, locationLabel, ReportStatusBadge } from '../parts';

function EditIncidentDialog({ incident, onClose }: { incident: Incident; onClose: () => void }) {
  const { t } = useTranslation('incidents');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const { data: keywords = [] } = useKeywords();
  const [form, setForm] = useState(() => ({
    dispatchNumber: incident.internalNumber ? '' : incident.dispatchNumber,
    alarmKeyword: incident.alarmKeyword,
    alarmMessage: incident.alarmMessage,
    alarmedAt: toLocalInput(incident.alarmedAt),
    ...incident.location,
  }));
  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const save = useAction(
    () => {
      const { dispatchNumber, alarmKeyword, alarmMessage, alarmedAt, ...location } = form;
      return send<Incident>('PUT', `incidents/incidents/${incident.id}`, {
        dispatchNumber: dispatchNumber.trim() || null,
        alarmKeyword,
        alarmMessage,
        alarmedAt: fromLocalInput(alarmedAt),
        location,
      });
    },
    { success: t('incident.saved'), invalidate: [keys.incidents], onSuccess: onClose },
  );
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('incident.edit')}
      size="lg"
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select
          label={t('fields.keyword')}
          data={keywords.map((k) => ({ value: k.key, label: `${k.key} – ${localized(k.name)}` }))}
          value={form.alarmKeyword}
          onChange={(value) => value && set('alarmKeyword', value)}
          searchable
          allowDeselect={false}
        />
        <TextInput label={t('fields.alarmedAt')} type="datetime-local" value={form.alarmedAt} onChange={(e) => set('alarmedAt', e.currentTarget.value)} />
        <TextInput label={t('fields.dispatchNumber')} value={form.dispatchNumber} onChange={(e) => set('dispatchNumber', e.currentTarget.value)} />
        <TextInput label={t('fields.alarmMessage')} value={form.alarmMessage} onChange={(e) => set('alarmMessage', e.currentTarget.value)} />
        <TextInput label={t('fields.street')} value={form.street} onChange={(e) => set('street', e.currentTarget.value)} />
        <TextInput label={t('fields.houseNumber')} value={form.houseNumber} onChange={(e) => set('houseNumber', e.currentTarget.value)} />
        <TextInput label={t('fields.city')} value={form.city} onChange={(e) => set('city', e.currentTarget.value)} />
        <TextInput label={t('fields.district')} value={form.district} onChange={(e) => set('district', e.currentTarget.value)} />
        <TextInput label={t('fields.object')} value={form.object} onChange={(e) => set('object', e.currentTarget.value)} />
      </SimpleGrid>
    </ResponsiveDialog>
  );
}

function ReportCard({ summary, report, onMakePrimary }: { summary: Incident['reports'][number]; report?: Report; onMakePrimary?: () => void }) {
  const { t, i18n } = useTranslation('incidents');
  const names = useNames();
  const errors = report?.findings.filter((f) => f.level === 'error' && f.rule !== 'primary-missing').length ?? 0;
  return (
    <Panel
      title={names.departmentName(summary.departmentId)}
      aside={
        <Group gap={4}>
          <DepartmentBadge name={t(summary.primary ? 'report.primary' : 'report.secondary')} primary={summary.primary} />
          <ReportStatusBadge status={summary.status} locked={summary.locked} />
        </Group>
      }
      style={summary.primary ? { borderTop: '4px solid var(--forga-service)' } : undefined}
    >
      <Stack gap={4}>
        <Text size="sm"><Text span c="dimmed">{t('report.number')}: </Text>{summary.number}</Text>
        <Text size="sm"><Text span c="dimmed">{t('report.author')}: </Text>{names.person(summary.authorPersonId) || '–'}</Text>
        {report && (
          <>
            <Text size="sm">
              <Text span c="dimmed">{t('report.time')}: </Text>
              {formatDateTime(report.times.alarmedAt, i18n.language)} – {formatDateTime(report.times.returnedAt, i18n.language)}
            </Text>
            <Text size="sm">
              <Text span c="dimmed">{t('report.personnel')}: </Text>
              {t('report.personnelSummary', { count: report.personnel.length, amount: formatMoney(report.compensationTotal, i18n.language) })}
            </Text>
          </>
        )}
        {errors > 0 && <Notice kind="warning">{t('report.openErrors', { count: errors })}</Notice>}
      </Stack>
      <Group justify="space-between" mt="md">
        {onMakePrimary ? <Button variant="subtle" size="xs" onClick={onMakePrimary}>{t('incident.makePrimary')}</Button> : <span />}
        <Button component={Link} to={`/incidents/reports/${summary.id}`} variant="outline" size="xs">{t('incident.openReport')}</Button>
      </Group>
    </Panel>
  );
}

/** One incident with the reports of all departments involved. */
export function IncidentPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('incidents');
  const navigate = useNavigate();
  const session = useSession().data;
  const names = useNames();
  const { data: incident, error } = useIncident(id);
  const { data: departments = [] } = useDepartments();
  const reports = useQueries({
    queries: (incident?.reports ?? []).map((r) => ({ queryKey: keys.report(r.id), queryFn: () => api<Report>(`incidents/reports/${r.id}`) })),
  });
  const [editing, setEditing] = useState(false);
  const [primaryFor, setPrimaryFor] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const releaser = session?.permissions[RELEASE] === 'brigade';
  const canWrite = (department: string) => releaser || can(session, WRITE, department);

  const makePrimary = useAction((reportId: string) => send('POST', `incidents/reports/${reportId}/primary`), {
    success: t('incident.primaryChanged'),
    invalidate: [keys.incidents, ['incidents', 'reports']],
  });
  const addReport = useAction(
    (department: string) => send<Report>('POST', `incidents/incidents/${id}/reports`, { departmentId: department }),
    { invalidate: [keys.incidents], onSuccess: (report) => navigate(`/incidents/reports/${report.id}`) },
  );

  if (error) return <EmptyState title={t('incident.notFound')} />;
  if (!incident) return null;
  const missing = departments.filter((d) => d.type !== 'veterans' && d.type !== 'youth' && canWrite(d.id) && !incident.reports.some((r) => r.departmentId === d.id));
  const primary = incident.reports.find((r) => r.primary);
  const target = incident.reports.find((r) => r.id === primaryFor);

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('incidents.title'), to: '/incidents/incidents' }, { label: incident.dispatchNumber }]}
        title={keywordLabel(incident)}
        actions={(() => { const owner = incident.reports.find((r) => r.primary) ?? incident.reports[0]; return owner && canWrite(owner.departmentId); })() && <Button variant="default" onClick={() => setEditing(true)}>{t('incident.edit')}</Button>}
      />
      <Panel>
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }}>
          <div><Text size="xs" c="dimmed" fw={700}>{t('fields.dispatchNumber')}</Text><Text>{incident.dispatchNumber}</Text></div>
          <div><Text size="xs" c="dimmed" fw={700}>{t('fields.alarmedAt')}</Text><Text>{formatDateTime(incident.alarmedAt, i18n.language)}</Text></div>
          <div><Text size="xs" c="dimmed" fw={700}>{t('fields.location')}</Text><Text>{locationLabel(incident) || '–'}</Text></div>
          <div><Text size="xs" c="dimmed" fw={700}>{t('fields.alarmMessage')}</Text><Text>{incident.alarmMessage || '–'}</Text></div>
        </SimpleGrid>
        <Text size="xs" c="dimmed" mt="sm">{t(`incident.createdVia.${incident.createdVia}`)}</Text>
      </Panel>
      {!primary && incident.reports.length > 0 && <Notice kind="error">{t('incident.noPrimary')}</Notice>}
      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
        {incident.reports.map((summary, index) => (
          <ReportCard
            key={summary.id}
            summary={summary}
            report={reports[index]?.data}
            onMakePrimary={!summary.primary && canWrite(summary.departmentId) && !summary.locked ? () => setPrimaryFor(summary.id) : undefined}
          />
        ))}
      </SimpleGrid>
      {missing.length > 0 && (
        <Panel title={t('incident.addReport')}>
          <Group align="end">
            <Select label={t('fields.department')} data={missing.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} />
            <Button variant="outline" disabled={!departmentId} loading={addReport.isPending} onClick={() => departmentId && addReport.mutate(departmentId)}>
              {t('incident.addReportButton')}
            </Button>
          </Group>
        </Panel>
      )}
      {editing && <EditIncidentDialog incident={incident} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        opened={!!target}
        onClose={() => setPrimaryFor(null)}
        title={t('incident.makePrimaryTitle')}
        description={t('incident.makePrimaryText', { next: names.departmentName(target?.departmentId), current: names.departmentName(primary?.departmentId) || '–' })}
        confirmLabel={t('incident.makePrimaryConfirm', { name: names.department(target?.departmentId) })}
        onConfirm={() => {
          if (target) makePrimary.mutate(target.id);
          setPrimaryFor(null);
        }}
      />
    </Stack>
  );
}
