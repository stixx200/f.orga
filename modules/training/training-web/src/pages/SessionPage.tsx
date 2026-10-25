import { Button, Checkbox, Group, NumberInput, SegmentedControl, Stack, Tabs, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { AttendanceInput, AttendanceStatus, CheckIn, Session } from '@forga/training-contracts';
import { api, can, extensionsOf, formatDateTime, formatTime, fromLocalInput, send, useLocalized, useSession as useLogin, useTranslation } from '@forga/web-sdk';
import { ActionBar, Attachments, ConfirmDialog, DataTable, EmptyState, HistoryTimeline, Notice, PageHeader, Panel, StatusBadge, useAction } from '@forga/web-ui';
import { ATTENDANCE, CLOSE, keys, personName, PLAN, usePersons, useSession, useTypeName, useTypes } from '../api';
import { SessionStatusBadge } from '../parts';
import { copyOf, draftOf, SessionForm } from './SessionForm';
import { PlanDialog } from './SessionsPage';

type Row = Required<Pick<AttendanceInput, 'personId' | 'breathingApparatus' | 'kilojoules' | 'passed' | 'injured' | 'from' | 'to' | 'role'>> & { status: AttendanceStatus | null };

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

function CheckInPanel({ session }: { session: Session }) {
  const { t, i18n } = useTranslation('training');
  const { data } = useQuery({ queryKey: [...keys.session(session.id), 'check-in'], queryFn: () => api<CheckIn>(`training/sessions/${session.id}/check-in`) });
  if (!data) return null;
  const link = `${window.location.origin}/training/check-in?code=${data.code}`;
  return (
    <Panel title={t('attendance.qr')}>
      <Group align="flex-start" gap="lg">
        <QRCodeSVG value={link} size={160} />
        <Stack gap={4}>
          <Text size="sm">{t('attendance.qrHint')}</Text>
          <Text size="sm" c="dimmed">{t('attendance.qrValid', { from: formatDateTime(data.validFrom, i18n.language), to: formatTime(data.validUntil, i18n.language) })}</Text>
          <Text size="xs" ff="monospace" data-testid="check-in-code">{data.code}</Text>
        </Stack>
      </Group>
    </Panel>
  );
}

function AttendanceTab({ session, editable }: { session: Session; editable: boolean }) {
  const { t } = useTranslation('training');
  const { data: persons = [] } = usePersons();
  const { data: types = [] } = useTypes();
  const record = types.find((x) => x.key === session.type)?.record;
  const stress = record === 'stress-exercise';
  // On the Atemschutzstrecke work and duration are fixed; only passing is recorded.
  const track = record === 'training-track';
  // All recorded rows (also of persons the user cannot see, e.g. of another department or who left)
  // plus the members of the session's departments without a row yet. The PUT replaces the whole list.
  const [rows, setRows] = useState<Row[]>(() => {
    const recorded: Row[] = session.attendance.map((a) => ({
      personId: a.personId, status: a.status, breathingApparatus: a.breathingApparatus, kilojoules: a.kilojoules, passed: a.passed, injured: a.injured, from: a.from, to: a.to, role: a.role,
    }));
    const missing = persons
      .filter((p) => p.status !== 'left' && p.departmentIds.some((d) => session.departmentIds.includes(d)) && !recorded.some((r) => r.personId === p.id))
      .map((p): Row => ({ personId: p.id, status: null, breathingApparatus: false, kilojoules: null, passed: null, injured: false, from: null, to: null, role: null }));
    return [...recorded, ...missing];
  });
  const name = (id: string) => { const p = persons.find((x) => x.id === id); return p ? personName(p) : t('attendance.otherPerson'); };
  const sorted = rows.toSorted((a, b) => name(a.personId).localeCompare(name(b.personId)));
  const set = (personId: string, change: Partial<Row>) => setRows((rs) => rs.map((r) => (r.personId === personId ? { ...r, ...change } : r)));
  const save = useAction(
    () => send<Session>('PUT', `training/sessions/${session.id}/attendance`, rows.filter((r) => r.status).map(({ status, ...r }) => ({ ...r, status }))),
    { success: t('attendance.saved'), invalidate: [keys.sessions] },
  );
  const present = rows.filter((r) => r.status === 'present').length;
  const unconfirmed = new Set(session.attendance.filter((a) => !a.confirmed).map((a) => a.personId));
  if (!rows.length) return <EmptyState title={t('attendance.noPersons')} />;

  return (
    <Stack gap="md" pb={editable ? 80 : 0}>
      {editable && session.status !== 'closed' && <CheckInPanel session={session} />}
      {unconfirmed.size > 0 && <Notice kind="warning">{t(editable ? 'attendance.unconfirmedHint' : 'attendance.unconfirmedInfo', { count: unconfirmed.size })}</Notice>}
      <DataTable<Row>
        rows={sorted}
        rowKey={(r) => r.personId}
        columns={[
          {
            key: 'name',
            header: t('attendance.person'),
            render: (r) => {
              const note = session.attendance.find((a) => a.personId === r.personId)?.note;
              return (
                <>
                  <Text fw={700} size="sm">{name(r.personId)}</Text>
                  {unconfirmed.has(r.personId) && <StatusBadge tone="warning">{t('attendance.viaQr')}</StatusBadge>}
                  {note && <Text size="xs" c="dimmed">{t('attendance.excuseNote', { note })}</Text>}
                </>
              );
            },
          },
          {
            key: 'status',
            header: t('fields.status'),
            render: (r) => (
              <SegmentedControl
                size="xs"
                disabled={!editable}
                aria-label={name(r.personId)}
                value={r.status ?? 'none'}
                onChange={(v) => set(r.personId, { status: v === 'none' ? null : (v as AttendanceStatus) })}
                data={(['none', 'present', 'excused', 'absent'] as const).map((s) => ({ value: s, label: t(`attendance.${s}`) }))}
              />
            ),
          },
          { key: 'ba', header: t('attendance.ba'), render: (r) => <Checkbox aria-label={t('attendance.ba')} disabled={!editable || r.status !== 'present'} checked={r.breathingApparatus} onChange={(e) => set(r.personId, { breathingApparatus: e.currentTarget.checked })} /> },
          ...(stress
            ? [{ key: 'kj', header: t('attendance.kilojoules'), render: (r: Row) => <NumberInput size="xs" w={90} min={0} disabled={!editable || r.status !== 'present'} value={r.kilojoules ?? ''} onChange={(v) => set(r.personId, { kilojoules: v === '' ? null : Number(v) })} /> }]
            : []),
          ...(stress || track
            ? [
                { key: 'passed', header: t('attendance.passed'), render: (r: Row) => <Checkbox aria-label={t('attendance.passed')} disabled={!editable || r.status !== 'present'} checked={r.passed ?? false} onChange={(e) => set(r.personId, { passed: e.currentTarget.checked })} /> },
              ]
            : []),
          { key: 'injured', header: t('attendance.injured'), render: (r) => <Checkbox aria-label={t('attendance.injured')} disabled={!editable || r.status !== 'present'} checked={r.injured} onChange={(e) => set(r.personId, { injured: e.currentTarget.checked })} /> },
        ]}
      />
      {editable && (
        <ActionBar info={t('attendance.count', { present, total: rows.length })}>
          <Button variant="default" onClick={() => setRows((rs) => rs.map((r) => (r.status ? r : { ...r, status: 'absent' })))}>{t('attendance.restAbsent')}</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('attendance.save')}</Button>
        </ActionBar>
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
        <Tabs.Panel value="attendance">{personsLoaded && <AttendanceTab key={`${session.id}:${session.version}`} session={session} editable={!closed && inDepartment(ATTENDANCE)} />}</Tabs.Panel>
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
