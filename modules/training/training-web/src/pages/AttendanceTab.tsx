import { Button, Checkbox, Group, NumberInput, SegmentedControl, Stack, Text, TextInput } from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import { useQuery } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import type { AttendanceInput, AttendanceStatus, CheckIn, Session } from '@forga/training-contracts';
import { api, formatDateTime, formatTime, send, useTranslation } from '@forga/web-sdk';
import { ActionBar, ConfirmDialog, DataTable, EmptyState, matchesSearch, Notice, Panel, StatusBadge, useAction } from '@forga/web-ui';
import { keys, personName, usePersons, useSession, useTypes } from '../api';

type Row = Required<Pick<AttendanceInput, 'personId' | 'breathingApparatus' | 'kilojoules' | 'passed' | 'injured' | 'from' | 'to' | 'role' | 'checkedInAt'>> & { status: AttendanceStatus | null };

const REFRESH = 10_000;

/**
 * QR code for the check-in. The code changes every minute (a photo of it does not work later), the session is
 * refreshed meanwhile so check-ins appear in the list, with a live counter.
 */
function CheckInPanel({ session }: { session: Session }) {
  const { t, i18n } = useTranslation('training');
  const { data } = useQuery({ queryKey: [...keys.session(session.id), 'check-in'], queryFn: () => api<CheckIn>(`training/sessions/${session.id}/check-in`), refetchInterval: 20_000 });
  useSession(session.id, REFRESH);
  if (!data) return null;
  const link = `${window.location.origin}/training/check-in?code=${encodeURIComponent(data.code)}`;
  const checkedIn = session.attendance.filter((a) => a.checkedInAt).length;
  return (
    <Panel title={t('attendance.qr')}>
      <Group align="flex-start" gap="lg">
        <QRCodeSVG value={link} size={200} />
        <Stack gap={4}>
          <Text size="sm">{t('attendance.qrHint')}</Text>
          <Text size="sm" c="dimmed">{t('attendance.qrValid', { from: formatDateTime(data.validFrom, i18n.language), to: formatTime(data.validUntil, i18n.language) })}</Text>
          <Text size="sm" c="dimmed">{t('attendance.qrRotates')}</Text>
          <Text size="xl" fw={700} data-testid="check-in-count">{t('attendance.checkedIn', { count: checkedIn })}</Text>
          <Text size="xs" ff="monospace" data-testid="check-in-code">{data.code}</Text>
        </Stack>
      </Group>
    </Panel>
  );
}

const toRow = (a: Session['attendance'][number]): Row => ({
  personId: a.personId, status: a.status, breathingApparatus: a.breathingApparatus, kilojoules: a.kilojoules, passed: a.passed, injured: a.injured, from: a.from, to: a.to, role: a.role, checkedInAt: a.checkedInAt,
});

/**
 * Attendance list: all recorded rows (also of persons the user cannot see) plus the members of the session's
 * departments without a row yet. Check-ins coming in while the list is edited are merged in; unsaved changes are
 * protected when leaving the page.
 */
export function AttendanceTab({ session, editable }: { session: Session; editable: boolean }) {
  const { t } = useTranslation('training');
  const { data: persons = [] } = usePersons();
  const { data: types = [] } = useTypes();
  const mobile = useMediaQuery('(max-width: 48em)');
  const record = types.find((x) => x.key === session.type)?.record;
  const stress = record === 'stress-exercise';
  // On the Atemschutzstrecke work and duration are fixed; only passing is recorded.
  const track = record === 'training-track';
  const build = (s: Session): Row[] => {
    const recorded = s.attendance.map(toRow);
    const missing = persons
      .filter((p) => p.status !== 'left' && p.departmentIds.some((d) => s.departmentIds.includes(d)) && !recorded.some((r) => r.personId === p.id))
      .map((p): Row => ({ personId: p.id, status: null, breathingApparatus: false, kilojoules: null, passed: null, injured: false, from: null, to: null, role: null, checkedInAt: null }));
    return [...recorded, ...missing];
  };
  const [rows, setRows] = useState<Row[]>(() => build(session));
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState('');
  const known = useRef(new Map(session.attendance.map((a) => [a.personId, a.checkedInAt])));

  // A refreshed session: take it over when nothing was changed, else only merge new check-ins.
  useEffect(() => {
    const fresh = session.attendance.filter((a) => a.checkedInAt && known.current.get(a.personId) !== a.checkedInAt);
    for (const a of session.attendance) known.current.set(a.personId, a.checkedInAt);
    if (!dirty) {
      setRows(build(session));
      return;
    }
    if (!fresh.length) return;
    setRows((rs) => {
      const merged = rs.map((r) => {
        const checkIn = fresh.find((a) => a.personId === r.personId);
        return checkIn ? { ...r, status: 'present' as const, checkedInAt: checkIn.checkedInAt } : r;
      });
      return [...merged, ...fresh.filter((a) => !rs.some((r) => r.personId === a.personId)).map(toRow)];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // Leaving the page with unsaved changes asks first.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => editable && dirty && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!editable || !dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [editable, dirty]);

  const name = (id: string) => { const p = persons.find((x) => x.id === id); return p ? personName(p) : t('attendance.otherPerson'); };
  const sorted = rows.filter((r) => matchesSearch([name(r.personId)], query)).toSorted((a, b) => name(a.personId).localeCompare(name(b.personId)));
  const change = (update: (rs: Row[]) => Row[]) => {
    setRows(update);
    setDirty(true);
  };
  const set = (personId: string, values: Partial<Row>) => change((rs) => rs.map((r) => (r.personId === personId ? { ...r, ...values } : r)));
  const save = useAction(
    () => send<Session>('PUT', `training/sessions/${session.id}/attendance`, rows.filter((r) => r.status).map(({ status, ...r }) => ({ ...r, status }))),
    { success: t('attendance.saved'), invalidate: [keys.sessions], onSuccess: () => setDirty(false) },
  );
  const present = rows.filter((r) => r.status === 'present').length;
  const unconfirmed = new Set(session.attendance.filter((a) => !a.confirmed).map((a) => a.personId));
  if (!rows.length) return <EmptyState title={t('attendance.noPersons')} />;
  const size = mobile ? 'md' : 'sm';

  return (
    <Stack gap="md" pb={editable ? 80 : 0}>
      {editable && session.status !== 'closed' && <CheckInPanel session={session} />}
      {unconfirmed.size > 0 && <Notice kind="warning">{t(editable ? 'attendance.unconfirmedHint' : 'attendance.unconfirmedInfo', { count: unconfirmed.size })}</Notice>}
      <TextInput type="search" label={t('attendance.search')} value={query} onChange={(e) => setQuery(e.currentTarget.value)} maw={400} />
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
                size={size}
                fullWidth={mobile}
                disabled={!editable}
                aria-label={name(r.personId)}
                value={r.status ?? 'none'}
                onChange={(v) => set(r.personId, { status: v === 'none' ? null : (v as AttendanceStatus) })}
                data={(['none', 'present', 'excused', 'absent'] as const).map((s) => ({ value: s, label: t(`attendance.${s}`) }))}
              />
            ),
          },
          { key: 'ba', header: t('attendance.ba'), render: (r) => <Checkbox size={size} aria-label={t('attendance.ba')} disabled={!editable || r.status !== 'present'} checked={r.breathingApparatus} onChange={(e) => set(r.personId, { breathingApparatus: e.currentTarget.checked })} /> },
          ...(stress
            ? [{ key: 'kj', header: t('attendance.kilojoules'), render: (r: Row) => <NumberInput size={size} w={100} min={0} disabled={!editable || r.status !== 'present'} value={r.kilojoules ?? ''} onChange={(v) => set(r.personId, { kilojoules: v === '' ? null : Number(v) })} /> }]
            : []),
          ...(stress || track
            ? [
                { key: 'passed', header: t('attendance.passed'), render: (r: Row) => <Checkbox size={size} aria-label={t('attendance.passed')} disabled={!editable || r.status !== 'present'} checked={r.passed ?? false} onChange={(e) => set(r.personId, { passed: e.currentTarget.checked })} /> },
              ]
            : []),
          { key: 'injured', header: t('attendance.injured'), render: (r) => <Checkbox size={size} aria-label={t('attendance.injured')} disabled={!editable || r.status !== 'present'} checked={r.injured} onChange={(e) => set(r.personId, { injured: e.currentTarget.checked })} /> },
        ]}
      />
      {editable && (
        <ActionBar info={t('attendance.count', { present, total: rows.length })}>
          <Button variant="default" onClick={() => change((rs) => rs.map((r) => (r.status ? r : { ...r, status: 'present' })))}>{t('attendance.allPresent')}</Button>
          <Button variant="default" onClick={() => change((rs) => rs.map((r) => (r.status ? r : { ...r, status: 'absent' })))}>{t('attendance.restAbsent')}</Button>
          <Button loading={save.isPending} onClick={() => save.mutate(undefined)}>{t('attendance.save')}</Button>
        </ActionBar>
      )}
      {blocker.state === 'blocked' && (
        <ConfirmDialog
          opened
          onClose={() => blocker.reset()}
          title={t('attendance.leaveTitle')}
          description={t('attendance.leaveText')}
          confirmLabel={t('attendance.leave')}
          onConfirm={() => blocker.proceed()}
        />
      )}
    </Stack>
  );
}
