import { Button, Group, Stack, Tabs } from '@mantine/core';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { Session } from '@forga/training-contracts';
import { can, extensionsOf, formatDateTime, formatTime, fromLocalInput, send, useLocalized, useSession as useLogin, useTranslation } from '@forga/web-sdk';
import { Attachments, ConfirmDialog, EmptyState, HistoryTimeline, Notice, PageHeader, Panel, useAction } from '@forga/web-ui';
import { ATTENDANCE, CLOSE, keys, PLAN, usePersons, useSession, useTypeName } from '../api';
import { SessionStatusBadge } from '../parts';
import { AttendanceTab } from './AttendanceTab';
import { copyOf, draftOf, SessionForm } from './SessionForm';
import { PlanDialog } from './SessionsPage';

function DetailsTab({ session, editable }: { session: Session; editable: boolean }) {
  const { t } = useTranslation('training');
  const [draft, setDraft] = useState(() => draftOf(session));
  const save = useAction(() => send<Session>('PUT', `training/sessions/${session.id}`, { ...draft, version: session.version, startsAt: fromLocalInput(draft.startsAt), endsAt: fromLocalInput(draft.endsAt) }), {
    success: t('session.saved'),
    invalidate: [keys.sessions],
  });
  return (
    <Stack gap="md">
      <Panel><SessionForm draft={draft} setDraft={setDraft} disabled={!editable} /></Panel>
      {editable && (
        <Group justify="flex-end">
          <Button loading={save.isPending} disabled={!draft.title || !draft.departmentIds.length} onClick={() => save.mutate(undefined)}>{t('session.save')}</Button>
        </Group>
      )}
    </Stack>
  );
}

/** One session: appointment and content, attendance with QR check-in, history. */
export function SessionPage() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation('training');
  const navigate = useNavigate();
  const login = useLogin().data;
  const typeName = useTypeName();
  const localized = useLocalized();
  const { data: session, isLoading } = useSession(id);
  const { isSuccess: personsLoaded } = usePersons();
  const [confirm, setConfirm] = useState<'close' | 'reopen' | 'delete' | null>(null);
  const [copying, setCopying] = useState(false);
  const opts = { invalidate: [keys.sessions], onSuccess: () => setConfirm(null) };
  const close = useAction(() => send('POST', `training/sessions/${id}/close`), { ...opts, success: t('session.closedNotice') });
  const reopen = useAction(() => send('POST', `training/sessions/${id}/reopen`), { ...opts, success: t('session.reopened') });
  const remove = useAction(() => send('DELETE', `training/sessions/${id}`), { success: t('session.deleted'), invalidate: [keys.sessions], onSuccess: () => navigate('/training/sessions') });
  if (!session) return isLoading ? null : <EmptyState title={t('session.notFound')} />;

  const inDepartment = (permission: string) => session.departmentIds.some((d) => can(login, permission, d));
  // Other modules add tabs (extension point `training.session.sections`, e.g. equipment used).
  const sections = extensionsOf('training.session.sections').filter((e) => !e.permission || can(login, e.permission));
  const closed = session.status === 'closed';
  const action = confirm === 'close' ? close : confirm === 'reopen' ? reopen : remove;

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('sessions.title'), to: '/training/sessions' }, { label: session.title }]}
        title={session.title}
        badges={<SessionStatusBadge status={session.status} />}
        subtitle={`${typeName(session.type)} · ${formatDateTime(session.startsAt, i18n.language)} – ${formatTime(session.endsAt, i18n.language)}`}
        actions={
          <Group gap="sm">
            {inDepartment(PLAN) && <Button variant="default" onClick={() => setCopying(true)}>{t('session.copy')}</Button>}
            {!closed && inDepartment(PLAN) && session.status === 'planned' && <Button variant="default" color="red" onClick={() => setConfirm('delete')}>{t('session.delete')}</Button>}
            {session.status === 'held' && inDepartment(CLOSE) && <Button onClick={() => setConfirm('close')}>{t('session.close')}</Button>}
            {closed && inDepartment(CLOSE) && <Button variant="default" onClick={() => setConfirm('reopen')}>{t('session.reopen')}</Button>}
          </Group>
        }
      />
      {session.overlaps.map((o) => <Notice key={o.id} kind="warning">{t('session.overlap', { title: o.title, at: formatDateTime(o.startsAt, i18n.language) })}</Notice>)}
      {closed && <Notice kind="done">{t('session.closedHint')}</Notice>}
      <Tabs defaultValue="details" keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="details">{t('session.tabs.details')}</Tabs.Tab>
          <Tabs.Tab value="attendance">{t('session.tabs.attendance')}</Tabs.Tab>
          {sections.map(({ module, label }) => <Tabs.Tab key={module} value={`ext-${module}`}>{localized(label)}</Tabs.Tab>)}
          <Tabs.Tab value="attachments">{t('session.tabs.attachments')}</Tabs.Tab>
          <Tabs.Tab value="history">{t('session.tabs.history')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="details"><DetailsTab key={`${session.id}:${session.version}`} session={session} editable={!closed && inDepartment(PLAN)} /></Tabs.Panel>
        <Tabs.Panel value="attendance">{personsLoaded && <AttendanceTab key={session.id} session={session} editable={!closed && inDepartment(ATTENDANCE)} />}</Tabs.Panel>
        {sections.map(({ module, component: Section }) => (
          <Tabs.Panel key={module} value={`ext-${module}`}>
            <Section sessionId={session.id} departmentIds={session.departmentIds} disabled={closed || !(inDepartment(PLAN) || inDepartment(ATTENDANCE))} />
          </Tabs.Panel>
        ))}
        <Tabs.Panel value="attachments"><Panel><Attachments type="training.session" id={session.id} editable={inDepartment(PLAN) || inDepartment(ATTENDANCE)} /></Panel></Tabs.Panel>
        <Tabs.Panel value="history"><HistoryTimeline entity="training.session" id={session.id} /></Tabs.Panel>
      </Tabs>
      {copying && <PlanDialog initial={copyOf(session)} onClose={() => setCopying(false)} />}
      {confirm && (
        <ConfirmDialog
          opened
          onClose={() => setConfirm(null)}
          title={t(`session.confirm.${confirm}.title`)}
          description={t(`session.confirm.${confirm}.text`)}
          confirmLabel={t(`session.${confirm}`)}
          loading={action.isPending}
          onConfirm={() => action.mutate(undefined)}
        />
      )}
    </Stack>
  );
}
