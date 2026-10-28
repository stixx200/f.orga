import { Button, Group, NumberInput, SegmentedControl, Select, Stack, Switch, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { Session, SessionCategory, SessionCopyResult } from '@forga/training-contracts';
import { apiUrl, can, formatDateTime, formatTime, fromLocalInput, send, useSession as useLogin, useTranslation } from '@forga/web-sdk';
import { DataTable, notifySuccess, PageHeader, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { keys, PLAN, useDepartments, useSessions, useTypeName, useTypes } from '../api';
import { SessionStatusBadge } from '../parts';
import { mondayOf, SessionCalendar, SessionWeek, weekNumber } from './SessionCalendar';
import { emptyDraft, type SessionDraft, SessionForm } from './SessionForm';

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const weekRange = (date: Date) => {
  const monday = mondayOf(date);
  return { from: iso(monday), to: iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)) };
};
const monthRange = (month: Date) => {
  const first = new Date(Date.UTC(month.getFullYear(), month.getMonth(), 1));
  const last = new Date(Date.UTC(month.getFullYear(), month.getMonth() + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
};

/** Plans a session or series; `initial` prefills the form, e.g. when copying a session. */
export function PlanDialog({ initial, onClose }: { initial?: SessionDraft; onClose: () => void }) {
  const { t } = useTranslation('training');
  const { t: common } = useTranslation('common');
  const navigate = useNavigate();
  const [draft, setDraft] = useState<SessionDraft>(() => initial ?? emptyDraft());
  const [series, setSeries] = useState(false);
  const [interval, setInterval] = useState(2);
  const [until, setUntil] = useState<string | null>(() => `${new Date().getFullYear()}-12-31`);
  const body = () => ({ ...draft, startsAt: fromLocalInput(draft.startsAt), endsAt: fromLocalInput(draft.endsAt) });
  const create = useAction(
    (): Promise<Session | Session[]> => (series ? send<Session[]>('POST', 'training/sessions/series', { session: body(), intervalWeeks: interval, until }) : send<Session>('POST', 'training/sessions', body())),
    {
      success: t('sessions.planned'),
      invalidate: [keys.sessions],
      onSuccess: (result) => {
        onClose();
        if (!Array.isArray(result)) navigate(`/training/sessions/${result.id}`);
      },
    },
  );
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('sessions.plan')}
      size="xl"
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={create.isPending} disabled={!draft.title || !draft.departmentIds.length} onClick={() => create.mutate(undefined)}>{t('sessions.planButton')}</Button>
        </Group>
      }
    >
      <Stack gap="md">
        <SessionForm draft={draft} setDraft={setDraft} />
        <Switch label={t('sessions.series')} checked={series} onChange={(e) => setSeries(e.currentTarget.checked)} />
        {series && (
          <Group grow>
            <NumberInput label={t('sessions.everyWeeks')} value={interval} onChange={(v) => setInterval(Number(v) || 1)} min={1} max={8} />
            <DateInput label={t('sessions.until')} value={until} onChange={setUntil} valueFormat="DD.MM.YYYY" />
          </Group>
        )}
      </Stack>
    </ResponsiveDialog>
  );
}

/** Copies the sessions of a period, e.g. last year's plan 52 weeks later (same weekday and time). */
function CopyDialog({ departments, onClose }: { departments: { id: string; name: string }[]; onClose: () => void }) {
  const { t } = useTranslation('training');
  const { t: common } = useTranslation('common');
  const [from, setFrom] = useState<string | null>(() => `${new Date().getFullYear() - 1}-01-01`);
  const [to, setTo] = useState<string | null>(() => `${new Date().getFullYear() - 1}-12-31`);
  const [weeks, setWeeks] = useState(52);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const copy = useAction(() => send<SessionCopyResult>('POST', 'training/sessions/copy', { from, to, weeks, departmentId }), {
    invalidate: [keys.sessions],
    onSuccess: (result) => {
      notifySuccess(t('copy.done', { created: result.created, skipped: result.skipped }));
      onClose();
    },
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('copy.title')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={copy.isPending} disabled={!from || !to || to < from} onClick={() => copy.mutate(undefined)}>{t('copy.confirm')}</Button>
        </Group>
      }
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">{t('copy.hint')}</Text>
        <Group grow>
          <DateInput label={t('copy.from')} value={from} onChange={setFrom} valueFormat="DD.MM.YYYY" />
          <DateInput label={t('copy.to')} value={to} onChange={setTo} valueFormat="DD.MM.YYYY" />
        </Group>
        <NumberInput label={t('copy.weeks')} description={t('copy.weeksHint')} value={weeks} onChange={(v) => setWeeks(Number(v) || 1)} min={1} max={104} />
        <Select label={t('fields.department')} placeholder={t('sessions.allDepartments')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} clearable />
      </Stack>
    </ResponsiveDialog>
  );
}

/** Sessions of a month with filters; planning single sessions or series. */
export function SessionsPage() {
  const { t, i18n } = useTranslation('training');
  const navigate = useNavigate();
  const login = useLogin().data;
  const typeName = useTypeName();
  const { data: departments = [] } = useDepartments();
  const { data: types = [] } = useTypes();
  const [month, setMonth] = useState(() => new Date());
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [type, setType] = useState<string | null>(null);
  const [category, setCategory] = useState<SessionCategory | null>(null);
  const [planning, setPlanning] = useState(false);
  const [copying, setCopying] = useState(false);
  const [view, setView] = useState<'list' | 'calendar' | 'week'>(() => {
    try {
      const stored = localStorage.getItem('training.sessions.view');
      return stored === 'calendar' || stored === 'week' ? stored : 'list';
    } catch {
      return 'list';
    }
  });
  const changeView = (value: string) => {
    const next = value === 'calendar' || value === 'week' ? value : 'list';
    setView(next);
    try {
      localStorage.setItem('training.sessions.view', next);
    } catch {
      // Without storage the choice only lasts for this visit.
    }
  };
  const { data: sessions = [], isLoading } = useSessions({ ...(view === 'week' ? weekRange(month) : monthRange(month)), departmentId: departmentId ?? undefined, type: type ?? undefined, category: category ?? undefined });
  // The month and list views step by month, the week view by week (keeping the day within the month view).
  const shift = (steps: number) => setMonth((m) => (view === 'week' ? new Date(m.getFullYear(), m.getMonth(), m.getDate() + 7 * steps) : new Date(m.getFullYear(), m.getMonth() + steps, 1)));
  const locale = i18n.language === 'de' ? 'de-DE' : 'en-GB';
  const week = weekRange(month);
  const period =
    view === 'week'
      ? t('sessions.week', { week: weekNumber(month), from: new Date(`${week.from}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }), to: new Date(`${week.to}T12:00:00`).toLocaleDateString(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }) })
      : month.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  const department = (id: string) => departments.find((d) => d.id === id)?.shortName ?? '';
  // Special services and other sessions name their category with the kind.
  const typeLabel = (key: string) => {
    const kind = types.find((x) => x.key === key)?.category;
    return kind && kind !== 'training' ? `${t(`category.${kind}`)} · ${typeName(key)}` : typeName(key);
  };

  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('sessions.title') }]} title={t('sessions.title')} actions={
          can(login, PLAN) && (
            <Group gap="sm">
              <Button variant="default" onClick={() => setCopying(true)}>{t('copy.open')}</Button>
              <Button onClick={() => setPlanning(true)}>{t('sessions.plan')}</Button>
            </Group>
          )
        }
      />
      <Group justify="space-between" align="end">
        <Group gap="xs">
          <Button variant="default" onClick={() => shift(-1)} aria-label={t(view === 'week' ? 'sessions.previousWeek' : 'sessions.previous')}><IconChevronLeft size={18} /></Button>
          <Text fw={700} w={220} ta="center">{period}</Text>
          <Button variant="default" onClick={() => shift(1)} aria-label={t(view === 'week' ? 'sessions.nextWeek' : 'sessions.next')}><IconChevronRight size={18} /></Button>
          <SegmentedControl value={view} onChange={changeView} data={[{ value: 'list', label: t('sessions.viewList') }, { value: 'calendar', label: t('sessions.viewCalendar') }, { value: 'week', label: t('sessions.viewWeek') }]} />
        </Group>
        <Group align="end">
          <Button component="a" href={apiUrl('core/lists/training.schedule/export/pdf', { year: month.getFullYear(), departmentId: departmentId ?? undefined, lang: i18n.language })} target="_blank" variant="default">
            {t('sessions.schedule', { year: month.getFullYear() })}
          </Button>
          <Select label={t('fields.department')} placeholder={t('sessions.allDepartments')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={departmentId} onChange={setDepartmentId} clearable />
          <Select
            label={t('settingsPage.category')}
            placeholder={t('sessions.allCategories')}
            data={(['training', 'special-service', 'other'] as const).map((c) => ({ value: c, label: t(`categories.${c}`) }))}
            value={category}
            onChange={(v) => {
              setCategory(v as SessionCategory | null);
              setType(null);
            }}
            clearable
          />
          <Select label={t('fields.type')} placeholder={t('sessions.allTypes')} data={types.filter((x) => !category || x.category === category).map((x) => ({ value: x.key, label: typeName(x.key) }))} value={type} onChange={setType} clearable />
        </Group>
      </Group>
      {view === 'calendar' ? (
        <SessionCalendar month={month} sessions={sessions} onOpen={(s) => navigate(`/training/sessions/${s.id}`)} />
      ) : view === 'week' ? (
        <SessionWeek monday={mondayOf(month)} sessions={sessions} onOpen={(s) => navigate(`/training/sessions/${s.id}`)} />
      ) : (
      <DataTable<Session>
        rows={sessions}
        rowKey={(s) => s.id}
        onRowClick={(s) => navigate(`/training/sessions/${s.id}`)}
        empty={isLoading ? t('loading') : t('sessions.empty')}
        columns={[
          { key: 'date', header: t('fields.startsAt'), render: (s) => `${formatDateTime(s.startsAt, i18n.language)} – ${formatTime(s.endsAt, i18n.language)}` },
          { key: 'title', header: t('fields.title'), render: (s) => <><Text fw={700} size="sm" c="brand">{s.title}</Text><Text size="xs" c="dimmed">{typeLabel(s.type)}</Text></> },
          { key: 'departments', header: t('fields.departments'), render: (s) => <Group gap={4}>{s.departmentIds.map((d) => <StatusBadge key={d}>{department(d)}</StatusBadge>)}</Group> },
          { key: 'present', header: t('sessions.present'), align: 'right', render: (s) => s.attendance.filter((a) => a.status === 'present').length || '–' },
          { key: 'status', header: t('fields.status'), render: (s) => <SessionStatusBadge status={s.status} /> },
        ]}
      />
      )}
      {planning && <PlanDialog onClose={() => setPlanning(false)} />}
      {copying && <CopyDialog departments={departments} onClose={() => setCopying(false)} />}
    </Stack>
  );
}
