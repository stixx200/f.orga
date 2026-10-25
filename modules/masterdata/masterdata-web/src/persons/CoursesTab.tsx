import { ActionIcon, Button, Group, Radio, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconTrash } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Course, CourseAttendance, CourseNomination, Person } from '@forga/masterdata-contracts';
import { api, can, formatDate, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { keys, loadPerson, today } from '../api';

export const PLAN = 'masterdata.courses.plan';

export function useCourses() {
  return useQuery({ queryKey: ['masterdata', 'courses'], queryFn: () => api<Course[]>('masterdata/courses'), staleTime: 5 * 60_000 });
}

/** Courses attended (passing grants qualifications) and nominations for planned courses. */
export function CoursesTab({ person, disabled, onChanged }: { person: Person; disabled: boolean; onChanged: (p: Person) => void }) {
  const { t, i18n } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const localized = useLocalized();
  const queryClient = useQueryClient();
  const session = useSession().data;
  const planner = person.memberships.some((m) => can(session, PLAN, m.departmentId)) || session?.permissions[PLAN] === 'brigade';
  const { data: courses = [] } = useCourses();
  const attendancesKey = [...keys.persons, person.id, 'attendances'];
  const { data: attendances = [] } = useQuery({ queryKey: attendancesKey, queryFn: () => api<CourseAttendance[]>(`masterdata/persons/${person.id}/course-attendances`) });
  const { data: nominations = [] } = useQuery({
    queryKey: ['masterdata', 'course-nominations'],
    queryFn: () => api<CourseNomination[]>('masterdata/course-nominations'),
    enabled: planner,
  });
  const [dialog, setDialog] = useState<'attendance' | 'nomination' | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [form, setForm] = useState({ course: null as string | null, startsOn: today() as string | null, endsOn: null as string | null, result: 'passed', location: '', priority: 2, desiredPeriod: '' });
  const courseName = (key: string) => {
    const course = courses.find((c) => c.key === key);
    return course ? localized(course.name) : key;
  };
  // A passed course changes the qualifications, so the person is reloaded as well.
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: attendancesKey });
    onChanged(await loadPerson(person.id));
    setDialog(null);
  };
  const addAttendance = useAction(
    () => send('POST', `masterdata/persons/${person.id}/course-attendances`, { course: form.course, startsOn: form.startsOn, endsOn: form.endsOn, result: form.result, location: form.location }),
    { success: t('person.saved'), invalidate: [['masterdata', 'course-nominations']], onSuccess: () => void refresh() },
  );
  const removeAttendance = useAction((id: string) => send('DELETE', `masterdata/persons/${person.id}/course-attendances/${id}`), { success: t('person.saved'), onSuccess: () => void refresh() });
  const nominate = useAction(
    () => send('POST', 'masterdata/course-nominations', { personId: person.id, course: form.course, priority: form.priority, desiredPeriod: form.desiredPeriod }),
    { success: t('person.saved'), invalidate: [['masterdata', 'course-nominations']], onSuccess: () => setDialog(null) },
  );
  const open = (d: 'attendance' | 'nomination') => {
    setForm({ course: null, startsOn: today(), endsOn: null, result: 'passed', location: '', priority: 2, desiredPeriod: '' });
    setDialog(d);
  };
  // An attendance ends after it starts; a passed course must have ended.
  const endError = form.endsOn && form.startsOn && form.endsOn < form.startsOn ? t('courses.endBeforeStart') : undefined;
  const futureError = dialog === 'attendance' && form.result === 'passed' && (form.endsOn ?? form.startsOn ?? '') > today() ? t('courses.notFinished') : undefined;
  const actions = (submit: () => void, loading: boolean, ok = true) => (
    <Group justify="flex-end">
      <Button variant="default" onClick={() => setDialog(null)}>{common('actions.cancel')}</Button>
      <Button onClick={submit} loading={loading} disabled={!form.course || !ok}>{common('actions.save')}</Button>
    </Group>
  );
  const own = nominations.filter((n) => n.personId === person.id && n.status !== 'completed');

  return (
    <Stack gap="lg">
      <Panel title={t('courses.attended')} aside={!disabled && <Button size="xs" variant="outline" onClick={() => open('attendance')}>{t('courses.addAttendance')}</Button>}>
        <DataTable<CourseAttendance>
          rows={attendances.toSorted((a, b) => b.startsOn.localeCompare(a.startsOn))}
          rowKey={(a) => a.id}
          empty={t('courses.noAttendances')}
          columns={[
            { key: 'course', header: t('courses.course'), render: (a) => <Text fw={700} size="sm">{courseName(a.course)}</Text> },
            { key: 'level', header: t('courses.level'), render: (a) => { const c = courses.find((x) => x.key === a.course); return c ? t(`courseLevel.${c.level}`) : ''; } },
            { key: 'date', header: t('courses.date'), render: (a) => [formatDate(a.startsOn, i18n.language), a.endsOn ? formatDate(a.endsOn, i18n.language) : ''].filter(Boolean).join(' – ') },
            { key: 'result', header: t('courses.result'), render: (a) => <StatusBadge tone={a.result === 'passed' ? 'done' : 'warning'}>{t(`courseResult.${a.result}`)}</StatusBadge> },
            { key: 'location', header: t('courses.location'), render: (a) => a.location },
            { key: 'remove', header: '', align: 'right', render: (a) => !disabled && <ActionIcon aria-label={common('actions.delete')} onClick={() => setRemoving(a.id)}><IconTrash size={16} /></ActionIcon> },
          ]}
        />
      </Panel>
      {planner && (
        <Panel
          title={t('courses.nominations')}
          aside={
            <Group gap="xs">
              <Button component={Link} to="/masterdata/courses" size="xs" variant="subtle">{t('courses.toPlanning')}</Button>
              <Button size="xs" variant="outline" onClick={() => open('nomination')}>{t('courses.nominate')}</Button>
            </Group>
          }
        >
          <DataTable<CourseNomination>
            rows={own}
            rowKey={(n) => n.id}
            empty={t('courses.noNominations')}
            columns={[
              { key: 'course', header: t('courses.course'), render: (n) => courseName(n.course) },
              { key: 'priority', header: t('courses.priority'), render: (n) => t(`priority.${n.priority}`) },
              { key: 'period', header: t('courses.desiredPeriod'), render: (n) => n.desiredPeriod },
              { key: 'status', header: t('courses.status'), render: (n) => <StatusBadge>{t(`nominationStatus.${n.status}`)}</StatusBadge> },
            ]}
          />
        </Panel>
      )}
      {dialog === 'attendance' && (
        <ResponsiveDialog opened onClose={() => setDialog(null)} title={t('courses.addAttendance')} actions={actions(() => addAttendance.mutate(undefined), addAttendance.isPending, !endError && !futureError && Boolean(form.startsOn))}>
          <Stack gap="sm">
            <Select label={t('courses.course')} data={courses.filter((c) => c.active).map((c) => ({ value: c.key, label: localized(c.name) }))} value={form.course} onChange={(v) => setForm({ ...form, course: v })} searchable required />
            <SimpleGrid cols={2}>
              <DateInput label={t('courses.startsOn')} value={form.startsOn} onChange={(v) => setForm({ ...form, startsOn: v })} valueFormat="DD.MM.YYYY" required />
              <DateInput label={t('courses.endsOn')} value={form.endsOn} onChange={(v) => setForm({ ...form, endsOn: v })} valueFormat="DD.MM.YYYY" clearable error={endError ?? futureError} />
            </SimpleGrid>
            <Radio.Group label={t('courses.result')} value={form.result} onChange={(v) => setForm({ ...form, result: v })}>
              <Group mt={4}>
                <Radio value="passed" label={t('courseResult.passed')} />
                <Radio value="failed" label={t('courseResult.failed')} />
              </Group>
            </Radio.Group>
            <TextInput label={t('courses.location')} value={form.location} onChange={(e) => setForm({ ...form, location: e.currentTarget.value })} />
            <Text size="xs" c="dimmed">{t('courses.passedHint')}</Text>
          </Stack>
        </ResponsiveDialog>
      )}
      {dialog === 'nomination' && (
        <ResponsiveDialog opened onClose={() => setDialog(null)} title={t('courses.nominate')} actions={actions(() => nominate.mutate(undefined), nominate.isPending)}>
          <Stack gap="sm">
            <Select label={t('courses.course')} data={courses.filter((c) => c.active).map((c) => ({ value: c.key, label: localized(c.name) }))} value={form.course} onChange={(v) => setForm({ ...form, course: v })} searchable required />
            <Select label={t('courses.priority')} data={[1, 2, 3].map((p) => ({ value: String(p), label: t(`priority.${p}`) }))} value={String(form.priority)} onChange={(v) => setForm({ ...form, priority: Number(v) || 2 })} allowDeselect={false} />
            <TextInput label={t('courses.desiredPeriod')} placeholder="2027" value={form.desiredPeriod} onChange={(e) => setForm({ ...form, desiredPeriod: e.currentTarget.value })} />
          </Stack>
        </ResponsiveDialog>
      )}
      <ConfirmDialog
        opened={!!removing}
        onClose={() => setRemoving(null)}
        title={t('courses.removeTitle')}
        description={t('courses.removeText')}
        confirmLabel={common('actions.delete')}
        onConfirm={() => {
          if (removing) removeAttendance.mutate(removing);
          setRemoving(null);
        }}
      />
    </Stack>
  );
}
