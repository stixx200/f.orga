import { Button, Checkbox, Group, Loader, Select, SimpleGrid, Stack, Switch, Text, Textarea, TextInput } from '@mantine/core';
import { useQueries } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import type { Incident, ReleaseManyResult, Report } from '@forga/incidents-contracts';
import { api, apiUrl, can, extensionsOf, formatDate, formatDateTime, formatMoney, fromLocalInput, send, toLocalInput, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, EmptyState, Notice, PageHeader, Panel, ResponsiveDialog, useAction } from '@forga/web-ui';
import { COSTS, DELETE_REPORT, keys, ledByMpFeuer, useDepartments, useIncident, useKeywords, useNames, useReportAccess, useSettings } from '../api';
import { DepartmentBadge, keywordLabel, locationLabel, notifyReleaseResult, ReportStatusBadge } from '../parts';
import { StatisticsPanel } from './StatisticsPanel';

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
        version: incident.version,
      });
    },
    // Reports starting with the alarm time move along with it.
    { success: t('incident.saved'), invalidate: [keys.incidents, ['incidents', 'reports']], onSuccess: onClose },
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
      <Text size="sm" c="dimmed" mb="sm">{t('incident.editHint')}</Text>
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

/** Costs and notes of the whole incident; the commander (`incidents.costs`) enters them, everyone else reads them. */
function CostsPanel({ incident, editable }: { incident: Incident; editable: boolean }) {
  const { t } = useTranslation('incidents');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState(() => ({ chargeable: incident.chargeable, chargeableReason: incident.chargeableReason, notes: incident.notes }));
  const changed = form.chargeable !== incident.chargeable || form.chargeableReason !== incident.chargeableReason || form.notes !== incident.notes;
  const save = useAction(() => send<Incident>('PUT', `incidents/incidents/${incident.id}/costs`, { ...form, version: incident.version }), {
    success: t('incident.costsSaved'),
    invalidate: [keys.incidents],
  });
  if (!editable) {
    return (
      <Panel title={t('incident.costs')}>
        <Stack gap={4}>
          <Text size="sm">{incident.chargeable ? `${t('incident.chargeable')}${incident.chargeableReason ? ` – ${incident.chargeableReason}` : ''}` : '–'}</Text>
          {incident.notes && <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}><Text span c="dimmed">{t('incident.notes')}: </Text>{incident.notes}</Text>}
        </Stack>
      </Panel>
    );
  }
  return (
    <Panel title={t('incident.costs')}>
      <Stack gap="sm">
        <Text size="xs" c="dimmed">{t('incident.costsHint')}</Text>
        <Switch label={t('incident.chargeable')} checked={form.chargeable} onChange={(e) => { const checked = e.currentTarget.checked; setForm((f) => ({ ...f, chargeable: checked })); }} />
        {form.chargeable && <TextInput label={t('incident.chargeableReason')} required error={form.chargeable && !form.chargeableReason.trim() ? t('incident.reasonRequired') : undefined} value={form.chargeableReason} onChange={(e) => { const value = e.currentTarget.value; setForm((f) => ({ ...f, chargeableReason: value })); }} />}
        <Textarea label={t('incident.notes')} value={form.notes} onChange={(e) => { const value = e.currentTarget.value; setForm((f) => ({ ...f, notes: value })); }} autosize minRows={2} />
        <Group justify="flex-end">
          <Button loading={save.isPending} disabled={!changed || (form.chargeable && !form.chargeableReason.trim())} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      </Stack>
    </Panel>
  );
}

/**
 * „30 Jahre aufbewahren (Sonderfall)“: keeps the incident like one with special features (retention plan), e.g. a major fire
 * without injured persons. Saved right away; releasers, the commander and the writers of the primary report change it.
 */
function RetentionPanel({ incident }: { incident: Incident }) {
  const { t, i18n } = useTranslation('incidents');
  const save = useAction((retentionSpecial: boolean) => send<Incident>('PUT', `incidents/incidents/${incident.id}/retention`, { retentionSpecial, version: incident.version }), {
    success: t('incident.retentionSaved'),
    invalidate: [keys.incidents],
  });
  return (
    <Panel title={t('incident.retention')}>
      <Stack gap="xs">
        <Checkbox
          label={t('incident.retentionSpecial')}
          description={t('incident.retentionSpecialHint')}
          checked={incident.retentionSpecial}
          disabled={!incident.retentionSpecialEditable || Boolean(incident.anonymizedAt) || save.isPending}
          onChange={(e) => save.mutate(e.currentTarget.checked)}
        />
        {incident.anonymizedAt && <Notice kind="info">{t('incident.anonymized', { date: formatDate(incident.anonymizedAt, i18n.language) })}</Notice>}
      </Stack>
    </Panel>
  );
}

function ReportCard({ summary, report, readable, onMakePrimary, onDelete }: {
  summary: Incident['reports'][number];
  report?: Report;
  readable: boolean;
  onMakePrimary?: () => void;
  onDelete?: () => void;
}) {
  const { t, i18n } = useTranslation('incidents');
  const names = useNames();
  const errors = report?.findings.filter((f) => f.level === 'error' && f.rule !== 'primary-missing').length ?? 0;
  return (
    <Panel
      title={names.ownerName(summary)}
      aside={
        <Group gap={4}>
          {/* Reports of brigade-wide units (e.g. the duty officer) are named as such unless they are primary (incident without department report). */}
          {summary.unit && !summary.primary ? <DepartmentBadge name={t('report.unitReport')} primary={false} unit /> : <DepartmentBadge name={t(summary.primary ? 'report.primary' : 'report.secondary')} primary={summary.primary} />}
          <ReportStatusBadge status={summary.status} locked={summary.locked} />
        </Group>
      }
      style={summary.primary ? { borderTop: '4px solid var(--forga-service)' } : undefined}
    >
      <Stack gap={4}>
        <Text size="sm"><Text span c="dimmed">{t('report.number')}: </Text>{summary.number}</Text>
        <Text size="sm"><Text span c="dimmed">{t('report.author')}: </Text>{names.person(summary.authorPersonId) || '–'}</Text>
        {readable && !report ? <Loader size="sm" /> : report && (
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
        {/* Reports of other departments are not readable for group leaders: no link that ends in "not found". */}
        {readable ? (
          <Group gap="xs">
            <Button component="a" href={apiUrl(`incidents/reports/${summary.id}/pdf`, { lang: i18n.language })} target="_blank" variant="subtle" size="xs">{t('editor.pdf')}</Button>
            <Button component={Link} to={`/incidents/reports/${summary.id}`} variant="outline" size="xs">{t('incident.openReport')}</Button>
            {onDelete && <Button variant="subtle" size="xs" onClick={onDelete}>{t('editor.delete')}</Button>}
          </Group>
        ) : (
          <Text size="xs" c="dimmed">{t(summary.unit ? 'incident.otherUnit' : 'incident.otherDepartment')}</Text>
        )}
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
  const { data: settings } = useSettings();
  const access = useReportAccess();
  const releaser = access.releaser;
  const reports = useQueries({
    queries: (incident?.reports ?? []).map((r) => ({
      queryKey: keys.report(r.id),
      queryFn: () => api<Report>(`incidents/reports/${r.id}`),
      enabled: access.read(r),
    })),
  });
  const [releasingAll, setReleasingAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const [primaryFor, setPrimaryFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Incident['reports'][number] | null>(null);
  const [deletingIncident, setDeletingIncident] = useState(false);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const canWrite = (department: string) => access.write({ departmentId: department });

  const makePrimary = useAction((reportId: string) => send('POST', `incidents/reports/${reportId}/primary`), {
    success: t('incident.primaryChanged'),
    invalidate: [keys.incidents, ['incidents', 'reports']],
  });
  const twoSteps = settings?.compensationRelease ?? true;
  const releaseAll = useAction(
    (reportIds: string[]) => send<ReleaseManyResult>('POST', 'incidents/reports/release', { reportIds, level: twoSteps ? 'compensation' : 'billing' }),
    {
      invalidate: [keys.incidents, ['incidents', 'reports']],
      onSuccess: (result) => {
        setReleasingAll(false);
        notifyReleaseResult(result, (reportId) => {
          const summary = incident?.reports.find((r) => r.id === reportId);
          return summary ? `${names.owner(summary)} ${summary.number}` : reportId;
        }, t);
      },
    },
  );
  const removeIncident = useAction(() => send('DELETE', `incidents/incidents/${id}`), {
    success: t('incident.deleted'),
    invalidate: [keys.incidents],
    onSuccess: () => navigate('/incidents/incidents'),
  });
  const removeReport = useAction((reportId: string) => send('DELETE', `incidents/reports/${reportId}`), {
    success: t('editor.deleted'),
    invalidate: [keys.incidents],
    onSuccess: (_result, reportId) => {
      setDeleting(null);
      // The last department report takes the incident and the drafts of brigade-wide units with it.
      if (!incident?.reports.some((other) => other.id !== reportId && other.departmentId)) navigate('/incidents/incidents');
    },
  });
  const addReport = useAction(
    (department: string) => send<Report>('POST', `incidents/incidents/${id}/reports`, { departmentId: department }),
    { invalidate: [keys.incidents], onSuccess: (report) => navigate(`/incidents/reports/${report.id}`) },
  );

  if (error) return <EmptyState title={t('incident.notFound')} />;
  if (!incident) return <Loader m="xl" />;
  const missing = departments.filter((d) => d.type === 'operational' && canWrite(d.id) && !incident.reports.some((r) => r.departmentId === d.id));
  const primary = incident.reports.find((r) => r.primary);
  // A unit report may be primary only while the incident has no department report.
  const hasDepartmentReport = incident.reports.some((r) => r.departmentId);
  const target = incident.reports.find((r) => r.id === primaryFor);
  const forReview = incident.reports.filter((r) => r.status === 'review' && !ledByMpFeuer(settings, r));
  // The incident data belong to the writers of the primary report while all reports are unlocked drafts; releasers
  // change them until a report is released.
  const owner = primary ?? incident.reports.find((r) => r.departmentId) ?? incident.reports[0];
  // While MP-Feuer leads, the incident data of its reports come with the next import.
  const fromMpFeuer = incident.reports.some((r) => ledByMpFeuer(settings, r));
  const editable =
    Boolean(owner) &&
    access.write(owner) &&
    !fromMpFeuer &&
    (releaser ? !incident.reports.some((r) => r.status.startsWith('released')) : incident.reports.every((r) => r.status === 'draft' && !r.locked));
  const canDeleteIncident = can(session, DELETE_REPORT) && incident.reports.every((r) => r.status === 'draft' && !r.locked && !ledByMpFeuer(settings, r));

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('incidents.title'), to: '/incidents/incidents' }, { label: incident.dispatchNumber }]}
        title={keywordLabel(incident)}
        actions={
          (editable || canDeleteIncident) && (
            <Group>
              {editable && <Button variant="default" onClick={() => setEditing(true)}>{t('incident.edit')}</Button>}
              {canDeleteIncident && <Button variant="default" onClick={() => setDeletingIncident(true)}>{t('incident.delete')}</Button>}
            </Group>
          )
        }
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
      {fromMpFeuer && <Notice kind="info">{t('incident.ledByMpFeuer')}</Notice>}
      {!primary && incident.reports.length > 0 && <Notice kind="error">{t('incident.noPrimary')}</Notice>}
      {releaser && forReview.length > 1 && (
        <Notice kind="info" action={<Button size="xs" onClick={() => setReleasingAll(true)}>{t('incident.releaseAll', { count: forReview.length })}</Button>}>
          {t('incident.releaseAllHint')}
        </Notice>
      )}
      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
        {incident.reports.map((summary, index) => (
          <ReportCard
            key={summary.id}
            summary={summary}
            report={reports[index]?.data}
            readable={access.read(summary)}
            onMakePrimary={!summary.primary && !ledByMpFeuer(settings, summary) && (summary.departmentId ? canWrite(summary.departmentId) : !hasDepartmentReport && access.write(summary)) && !summary.locked && !summary.status.startsWith('released') && !primary?.status.startsWith('released') ? () => setPrimaryFor(summary.id) : undefined}
            onDelete={can(session, DELETE_REPORT) && summary.departmentId && summary.status === 'draft' && !summary.locked && !ledByMpFeuer(settings, summary) ? () => setDeleting(summary) : undefined}
          />
        ))}
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
      </SimpleGrid>
      {/* Re-mounted with each saved version, so the form starts from the stored values. */}
      <StatisticsPanel key={`statistics-${incident.version}`} incident={incident} />
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        {/* Re-mounted with each saved version, so the form starts from the stored values. */}
        <CostsPanel key={incident.version} incident={incident} editable={can(session, COSTS)} />
        <RetentionPanel incident={incident} />
        {extensionsOf('incidents.incident.sections')
          .filter((e) => !e.permission || can(session, e.permission))
          .map(({ module, component: Section }) => (
            <Section key={module} incidentId={incident.id} chargeable={incident.chargeable} disabled={!can(session, COSTS)} />
          ))}
      </SimpleGrid>
      {editing && <EditIncidentDialog incident={incident} onClose={() => setEditing(false)} />}
      <ConfirmDialog
        opened={releasingAll}
        onClose={() => setReleasingAll(false)}
        title={t('incident.releaseAllTitle')}
        description={t(twoSteps ? 'incident.releaseAllCompensation' : 'incident.releaseAllBilling', { count: forReview.length })}
        confirmLabel={t('workflow.releaseNow')}
        loading={releaseAll.isPending}
        onConfirm={() => releaseAll.mutate(forReview.map((r) => r.id))}
      />
      <ConfirmDialog
        opened={!!target}
        onClose={() => setPrimaryFor(null)}
        title={t('incident.makePrimaryTitle')}
        description={t('incident.makePrimaryText', { next: target ? names.ownerName(target) : '', current: (primary && names.ownerName(primary)) || '–' })}
        confirmLabel={t('incident.makePrimaryConfirm', { name: target ? names.owner(target) : '' })}
        onConfirm={() => {
          if (target) makePrimary.mutate(target.id);
          setPrimaryFor(null);
        }}
      />
      <ConfirmDialog
        opened={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        title={t('editor.deleteTitle')}
        description={t('editor.deleteText', { report: deleting ? `${names.ownerName(deleting)} · ${deleting.number}` : '' })}
        confirmLabel={t('editor.delete')}
        loading={removeReport.isPending}
        onConfirm={() => deleting && removeReport.mutate(deleting.id)}
      />
      <ConfirmDialog
        opened={deletingIncident}
        onClose={() => setDeletingIncident(false)}
        title={t('incident.deleteTitle')}
        description={t('incident.deleteText', { number: incident.dispatchNumber })}
        confirmLabel={t('incident.delete')}
        loading={removeIncident.isPending}
        onConfirm={() => removeIncident.mutate(undefined)}
      />
    </Stack>
  );
}
