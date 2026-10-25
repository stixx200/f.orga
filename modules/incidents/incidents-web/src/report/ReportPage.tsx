import { Button, Group, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { IncidentStatisticsInput, Report } from '@forga/incidents-contracts';
import { apiUrl, can, extensionsOf, formatDateTime, formatMoney, formatTime, send, useSession, useTranslation } from '@forga/web-sdk';
import { ActionBar, Attachments, ConfirmDialog, DataTable, EmptyState, HistoryTimeline, Notice, notifyError, notifySuccess, PageHeader, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { keys, RELEASE, useIncident, useNames, useReport, useRevisions, WRITE } from '../api';
import { DepartmentBadge, ReportStatusBadge } from '../parts';
import { WorkflowActions } from '../WorkflowActions';
import { CheckSection } from './CheckSection';
import { completeStatistics, type Content, STEPS, type StepId, stepOf, useReportEditor, useStoredReasons } from './editor';
import { blocking, findingKey, mergeFindings, openWarnings } from './findings';
import { NarrativeSection } from './NarrativeSection';
import { OtherSection } from './OtherSection';
import { PersonnelSection } from './PersonnelSection';
import classes from './report.module.css';
import { StatisticsSection } from './StatisticsSection';
import { TimesSection } from './TimesSection';

function stepState(step: StepId, content: Content, report: Report, statisticsIncomplete: boolean): { state: 'done' | 'error' | 'open'; text: string; count?: number } {
  // Unfinished statistics are not saved yet: the step must not look complete.
  if (step === 'statistics' && statisticsIncomplete) return { state: 'error', text: 'incomplete' };
  const errors = blocking(mergeFindings(report.findings)).filter((f) => stepOf(f) === step).length;
  const warnings = openWarnings(mergeFindings(report.findings)).filter((f) => stepOf(f) === step).length;
  if (step === 'check') return { state: errors || warnings ? 'open' : 'done', text: '' };
  if (errors) return { state: 'error', text: 'errors', count: errors };
  if (warnings) return { state: 'open', text: 'warnings', count: warnings };
  switch (step) {
    case 'personnel':
      return content.personnel.length ? { state: 'done', text: 'persons', count: content.personnel.length } : { state: 'open', text: 'missing' };
    case 'narrative':
      return content.situation.trim() && content.actions.trim() ? { state: 'done', text: 'complete' } : { state: 'open', text: 'missing' };
    case 'statistics':
      return !report.primary ? { state: 'done', text: 'inPrimary' } : content.statistics ? { state: 'done', text: 'complete' } : { state: 'open', text: 'missing' };
    case 'other':
      return { state: 'done', text: 'optional' };
    default:
      return { state: 'done', text: 'complete' };
  }
}

function Editor({ report, userId }: { report: Report; userId: string }) {
  const { t, i18n } = useTranslation('incidents');
  const queryClient = useQueryClient();
  const session = useSession().data;
  const names = useNames();
  const { data: incident } = useIncident(report.incidentId);
  const { content, update, flush, reset, saveState, restorable, restoreLocal, discardLocal, loadServer, keepMine } = useReportEditor(report, userId);
  const [step, setStep] = useState<StepId>('times');
  const [statisticsDraft, setStatisticsDraft] = useState<IncidentStatisticsInput | null>(null);
  const { reasons, setReason, clearReasons } = useStoredReasons(userId, report.id);
  const [dialog, setDialog] = useState<'submit' | 'versions' | 'history' | 'takeOver' | null>(null);
  // Releasers read drafts of authors; editing one locks it for the author, so it needs a confirmation.
  const [takenOver, setTakenOver] = useState(false);
  const { data: revisions = [] } = useRevisions(report.id, dialog === 'versions');

  const releaser = session?.permissions[RELEASE] === 'brigade';
  const writer = can(session, WRITE, report.departmentId);
  // The own draft of a releaser is not someone else's.
  const ownDraft = Boolean(session?.user.personId) && report.authorPersonId === session?.user.personId;
  const draftOfAuthor = releaser && report.status === 'draft' && !report.locked && !takenOver && !ownDraft;
  const editable = releaser ? !report.status.startsWith('released') && !draftOfAuthor : writer && report.status === 'draft' && !report.locked;
  // Releasers complete the statistics of a released primary report without releasing it again.
  const statisticsSeparately = releaser && report.primary && report.status.startsWith('released');
  const statisticsIncomplete = Boolean(statisticsDraft) && !completeStatistics(statisticsDraft);
  const errors = blocking(mergeFindings(report.findings));
  const warnings = openWarnings(mergeFindings(report.findings));
  const missingReasons = warnings.filter((f) => !reasons[findingKey(f)]?.trim());
  const goTo = (target: StepId) => {
    setStep(target);
    window.scrollTo({ top: 0 });
  };

  const submit = useAction(
    async () => {
      await flush();
      // The last save may have changed the findings: submit with the warnings of the saved state.
      const saved = queryClient.getQueryData<Report>(keys.report(report.id)) ?? report;
      const open = openWarnings(mergeFindings(saved.findings));
      if (blocking(mergeFindings(saved.findings)).length || open.some((f) => !reasons[findingKey(f)]?.trim())) {
        setDialog(null);
        goTo('check');
        notifications.show({ color: 'brand', message: t('editor.findingsChanged') });
        return null;
      }
      const acknowledgements = open.map((f) => ({ rule: f.rule, subject: f.subject, reason: reasons[findingKey(f)].trim() }));
      return send<Report>('POST', `incidents/reports/${report.id}/submit`, { acknowledgements });
    },
    {
      invalidate: [keys.incidents],
      onSuccess: (saved) => {
        if (!saved) return;
        notifySuccess(t('editor.submitted'));
        queryClient.setQueryData(keys.report(report.id), saved);
        clearReasons();
        setDialog(null);
      },
    },
  );
  const restore = useAction((revisionId: string) => send<Report>('POST', `incidents/reports/${report.id}/revisions/${revisionId}/restore`), {
    success: t('editor.restored'),
    invalidate: [keys.revisions(report.id)],
    onSuccess: (restored) => {
      queryClient.setQueryData(keys.report(report.id), restored);
      reset(restored);
      setStatisticsDraft(null);
      setDialog(null);
    },
  });
  const saveStatistics = useAction(
    (statistics: IncidentStatisticsInput | null) => send<Report>('PUT', `incidents/reports/${report.id}/statistics`, { statistics, version: report.version }),
    {
      success: t('statistics.saved'),
      invalidate: [keys.incidents],
      onSuccess: (saved) => {
        queryClient.setQueryData(keys.report(report.id), saved);
        reset(saved);
        setStatisticsDraft(null);
      },
    },
  );
  const askSubmit = () => {
    if (statisticsIncomplete) {
      goTo('statistics');
      notifications.show({ color: 'brand', message: t('statistics.incomplete') });
      return;
    }
    if (errors.length || missingReasons.length) {
      goTo('check');
      notifications.show({ color: 'brand', message: t(errors.length ? 'editor.fixErrorsFirst' : 'editor.reasonsMissing') });
      return;
    }
    setDialog('submit');
  };

  const saveText =
    saveState.status === 'saving' || saveState.status === 'pending'
      ? t('editor.saving')
      : saveState.status === 'conflict'
        ? t('editor.conflict')
        : saveState.status === 'failed'
          ? t('editor.saveFailed')
        : saveState.savedAt
          ? t('editor.savedAt', { time: formatTime(saveState.savedAt.toISOString(), i18n.language) })
          : t('editor.upToDate');
  const primaryReport = incident?.reports.find((r) => r.primary);
  const department = names.departmentName(report.departmentId);

  return (
    <Stack gap="lg" pb={80}>
      <PageHeader
        breadcrumbs={[
          { label: t('module') },
          { label: t('incidents.title'), to: '/incidents/incidents' },
          { label: incident?.dispatchNumber ?? '…', to: `/incidents/incidents/${report.incidentId}` },
          { label: names.department(report.departmentId) },
        ]}
        title={t('editor.title', { department })}
        badges={
          <Group gap={4}>
            <DepartmentBadge name={t(report.primary ? 'report.primary' : 'report.secondary')} primary={report.primary} />
            <ReportStatusBadge status={report.status} locked={report.locked} />
            {incident && <StatusBadge>{`${incident.alarmKeyword} · ${incident.dispatchNumber}`}</StatusBadge>}
            <StatusBadge>{t('editor.number', { number: report.number })}</StatusBadge>
          </Group>
        }
      />
      {restorable && (
        <Notice
          kind="warning"
          action={
            <Group gap="xs">
              <Button size="xs" onClick={restoreLocal} disabled={!editable}>{t('editor.restoreLocal')}</Button>
              <Button size="xs" variant="default" onClick={discardLocal}>{t('editor.discardLocal')}</Button>
            </Group>
          }
        >
          {t('editor.unsavedFound', { at: formatDateTime(restorable.at, i18n.language) })}
        </Notice>
      )}
      {draftOfAuthor && (
        <Notice kind="info" action={<Button size="xs" variant="outline" onClick={() => setDialog('takeOver')}>{t('editor.takeOver')}</Button>}>
          {t('editor.readOnlyDraft')}
        </Notice>
      )}
      {report.status === 'draft' && report.returnComment && <Notice kind="warning">{t('editor.returned', { comment: report.returnComment })}</Notice>}
      {report.status === 'review' && !releaser && <Notice kind="info">{t('editor.inReview')}</Notice>}
      {report.locked && <Notice kind="info">{t('editor.lockedBy', { by: report.lockedBy ?? '', at: formatDateTime(report.lockedAt, i18n.language) })}</Notice>}
      <WorkflowActions report={report} framed />

      <ol className={classes.steps} aria-label={t('editor.sections')}>
        {STEPS.map((s, index) => {
          const state = stepState(s, content, report, statisticsIncomplete);
          return (
            <li key={s}>
              <button type="button" className={classes.step} data-state={state.state} aria-current={s === step ? 'step' : undefined} onClick={() => setStep(s)}>
                <span className={classes.stepNumber}>{state.state === 'done' ? '✓' : state.state === 'error' ? '!' : index + 1}</span>
                <span className={classes.stepLabel}>
                  {t(`steps.${s}`)}
                  {state.text && <span className={classes.stepState}>{t(`stepStates.${state.text}`, { count: state.count })}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {step === 'times' && incident && <TimesSection content={content} incident={incident} departmentId={report.departmentId} update={update} disabled={!editable} />}
      {step === 'personnel' && <PersonnelSection content={content} report={report} update={update} disabled={!editable} findings={report.findings} />}
      {step === 'narrative' && <NarrativeSection content={content} update={update} disabled={!editable} />}
      {step === 'statistics' && (
        <StatisticsSection
          content={content}
          report={report}
          draft={statisticsDraft}
          setDraft={setStatisticsDraft}
          update={update}
          disabled={!editable && !statisticsSeparately}
          primaryReportId={primaryReport?.id}
          onSaveSeparately={statisticsSeparately ? (statistics) => saveStatistics.mutate(statistics) : undefined}
          saving={saveStatistics.isPending}
        />
      )}
      {step === 'other' && <OtherSection content={content} update={update} disabled={!editable} />}
      {step === 'other' && (
        <Notice kind="info" action={<Button component={Link} to={`/incidents/incidents/${report.incidentId}`} variant="subtle" size="xs">{t('other.toIncident')}</Button>}>
          {t('other.costsHint')}
        </Notice>
      )}
      {step === 'other' && (
        <Panel title={t('editor.attachments')}>
          <Attachments type="incidents.report" id={report.id} editable={editable} />
        </Panel>
      )}
      {step === 'other' &&
        extensionsOf('incidents.report.sections')
          .filter((e) => !e.permission || can(session, e.permission))
          .map(({ module, component: Section }) => (
            <Section
              key={module}
              reportId={report.id}
              incidentId={report.incidentId}
              departmentId={report.departmentId}
              vehicleIds={content.vehicles.map((v) => v.vehicleId)}
              breathingVehicleIds={content.personnel.filter((p) => p.breathingApparatus && p.vehicleId).map((p) => p.vehicleId)}
              disabled={!editable}
            />
          ))}
      {step === 'check' && (
        <CheckSection findings={report.findings} reasons={reasons} setReason={setReason} goTo={goTo} editable={editable && report.status === 'draft'} statisticsIncomplete={statisticsIncomplete} />
      )}

      <Group justify="space-between">
        {STEPS.indexOf(step) > 0 ? <Button variant="default" onClick={() => goTo(STEPS[STEPS.indexOf(step) - 1])}>‹ {t(`steps.${STEPS[STEPS.indexOf(step) - 1]}`)}</Button> : <span />}
        {STEPS.indexOf(step) < STEPS.length - 1 && (
          <Button variant="outline" onClick={() => goTo(STEPS[STEPS.indexOf(step) + 1])}>{t('editor.next', { step: t(`steps.${STEPS[STEPS.indexOf(step) + 1]}`) })} ›</Button>
        )}
      </Group>

      <ActionBar
        info={
          <Text component="span" size="sm">
            {saveText} · <strong>{t('editor.findings', { errors: errors.length, warnings: warnings.length })}</strong>
          </Text>
        }
      >
        <Button component="a" href={apiUrl(`incidents/reports/${report.id}/pdf`, { lang: i18n.language })} target="_blank" variant="subtle">{t('editor.pdf')}</Button>
        <Button variant="subtle" onClick={() => setDialog('history')}>{t('editor.history')}</Button>
        <Button variant="subtle" onClick={() => setDialog('versions')}>{t('editor.versions')}</Button>
        {editable && report.status === 'draft' && <Button onClick={askSubmit}>{t('editor.submit')}</Button>}
      </ActionBar>

      {dialog === 'submit' && (
        <ConfirmDialog
          opened
          onClose={() => setDialog(null)}
          title={t('editor.submitTitle')}
          description={t('editor.submitText')}
          confirmLabel={t('editor.submit')}
          loading={submit.isPending}
          onConfirm={() => submit.mutate(undefined)}
        >
          <Text size="sm" fw={700} mt="xs">{t('workflow.summary', { count: report.personnel.length, amount: formatMoney(report.compensationTotal, i18n.language) })}</Text>
          {warnings.length > 0 && <Text size="sm" mt="xs">{t('editor.submitWarnings', { count: warnings.length })}</Text>}
        </ConfirmDialog>
      )}
      {dialog === 'takeOver' && (
        <ConfirmDialog
          opened
          onClose={() => setDialog(null)}
          title={t('editor.takeOverTitle')}
          description={t('editor.takeOverText', { author: names.person(report.authorPersonId) || t('workflow.theAuthor') })}
          confirmLabel={t('editor.takeOver')}
          onConfirm={() => {
            setTakenOver(true);
            setDialog(null);
          }}
        />
      )}
      {saveState.status === 'conflict' && (
        <ResponsiveDialog
          opened
          onClose={() => undefined}
          title={t('editor.conflictTitle')}
          actions={
            <Group justify="flex-end">
              <Button variant="default" onClick={() => void loadServer().catch(notifyError)}>{t('editor.loadServer')}</Button>
              <Button onClick={() => void keepMine().catch(notifyError)}>{t('editor.keepMine')}</Button>
            </Group>
          }
        >
          <Text size="sm">{t('editor.conflictText')}</Text>
        </ResponsiveDialog>
      )}
      {dialog === 'versions' && (
        <ResponsiveDialog opened onClose={() => setDialog(null)} title={t('editor.versionsTitle')} size="lg">
          <Text size="sm" c="dimmed" mb="sm">{t('editor.versionsHint')}</Text>
          <DataTable
            exportable={false}
            rows={revisions}
            rowKey={(r) => r.id}
            columns={[
              { key: 'savedAt', header: t('editor.savedAtColumn'), render: (r) => formatDateTime(r.savedAt, i18n.language) },
              { key: 'user', header: t('editor.user'), render: (r) => r.userName || t('editor.imported') },
              { key: 'personnel', header: t('report.personnel'), align: 'right', render: (r) => r.personnelCount },
              {
                key: 'restore',
                header: '',
                align: 'right',
                render: (r) => (r.id === revisions[0]?.id ? <StatusBadge tone="done">{t('editor.current')}</StatusBadge> : editable && <Button size="xs" variant="outline" loading={restore.isPending} onClick={() => restore.mutate(r.id)}>{t('editor.restore')}</Button>),
              },
            ]}
          />
        </ResponsiveDialog>
      )}
      {dialog === 'history' && (
        <ResponsiveDialog opened onClose={() => setDialog(null)} title={t('editor.history')} size="lg">
          <HistoryTimeline entity="incidents.report" id={report.id} />
        </ResponsiveDialog>
      )}
    </Stack>
  );
}

/** Report editor in six sections with automatic saving. */
export function ReportPage() {
  const { id = '' } = useParams();
  const { t } = useTranslation('incidents');
  const userId = useSession().data?.user.id;
  const { data: report, error, isFetchedAfterMount } = useReport(id);
  if (error) return <EmptyState title={t('editor.notFound')} />;
  // The editor starts from the current state of the server, not from an older copy in the cache.
  if (!report || !isFetchedAfterMount || !userId) return null;
  // The editor keeps its own copy of the content; a different report gets a new editor.
  return <Editor key={report.id} report={report} userId={userId} />;
}
