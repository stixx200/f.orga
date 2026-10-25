import { ActionIcon, Button, Checkbox, Grid, Group, Select, SimpleGrid, Stack, Tabs, Text, Textarea, TextInput } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { IconPencil, IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { BulkNominationResult, CourseNeed, CourseNomination, CoursePlanning, CourseResultsOutcome, CourseRun } from '@forga/masterdata-contracts';
import { api, formatDate, send, translateCode, useLocalized, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, EmptyState, Notice, PageHeader, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';
import { today, useCatalogNames, useDepartments } from '../api';
import { useCourses } from '../persons/CoursesTab';

const NOMINATIONS = ['masterdata', 'course-nominations'] as const;
const NEEDS = ['masterdata', 'course-needs'] as const;
const OPEN = ['nominated', 'registered', 'confirmed'];

type Nomination = CoursePlanning['nominations'][number];
type Result = 'passed' | 'failed' | 'absent';

const period = (run: Pick<CourseRun, 'startsOn' | 'endsOn'>, language: string) =>
  [formatDate(run.startsOn, language), run.endsOn && run.endsOn !== run.startsOn ? formatDate(run.endsOn, language) : ''].filter(Boolean).join(' – ');

/** Dates, location and notes of a course run. */
function RunDialog({ course, run, onClose, invalidate }: { course: string; run?: CourseRun; onClose: () => void; invalidate: readonly (readonly unknown[])[] }) {
  const { t } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const [form, setForm] = useState({ startsOn: run?.startsOn ?? today(), endsOn: run?.endsOn ?? null, location: run?.location ?? '', notes: run?.notes ?? '' });
  const endError = form.endsOn && form.endsOn < form.startsOn ? t('courses.endBeforeStart') : undefined;
  const save = useAction(() => (run ? send('PUT', `masterdata/course-runs/${run.id}`, { course, ...form }) : send('POST', 'masterdata/course-runs', { course, ...form })), {
    success: t('person.saved'),
    invalidate,
    onSuccess: onClose,
  });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={run ? t('planning.editRun') : t('planning.newRun')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.cancel')}</Button>
          <Button loading={save.isPending} disabled={Boolean(endError) || !form.startsOn} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>
        </Group>
      }
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{t('planning.runHint')}</Text>
        <SimpleGrid cols={2}>
          <DateInput label={t('courses.startsOn')} value={form.startsOn} onChange={(v) => v && setForm({ ...form, startsOn: v })} valueFormat="DD.MM.YYYY" required />
          <DateInput label={t('courses.endsOn')} value={form.endsOn} onChange={(v) => setForm({ ...form, endsOn: v })} valueFormat="DD.MM.YYYY" clearable error={endError} />
        </SimpleGrid>
        <TextInput label={t('courses.location')} value={form.location} onChange={(e) => setForm({ ...form, location: e.currentTarget.value })} />
        <Textarea label={t('entries.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.currentTarget.value })} autosize minRows={2} />
      </Stack>
    </ResponsiveDialog>
  );
}

/** Records the results of all confirmed nominations (of a run) at once; persons who did not attend are left out. */
function ResultsDialog({ course, run, nominations, onClose, invalidate }: {
  course: string;
  run: CourseRun | null;
  nominations: Nomination[];
  onClose: () => void;
  invalidate: readonly (readonly unknown[])[];
}) {
  const { t, i18n } = useTranslation('masterdata');
  const { t: common } = useTranslation('common');
  const { data: departments = [] } = useDepartments();
  const participants = nominations.filter((n) => n.nomination.status === 'confirmed' && (!run || n.nomination.runId === run.id));
  const [results, setResults] = useState<Record<string, Result>>(() => Object.fromEntries(participants.map((n) => [n.person.id, 'passed'])));
  const [dates, setDates] = useState({ startsOn: today() as string | null, endsOn: null as string | null, location: '' });
  const [outcome, setOutcome] = useState<CourseResultsOutcome | null>(null);
  const end = run ? (run.endsOn ?? run.startsOn) : (dates.endsOn ?? dates.startsOn ?? '');
  const notFinished = end > today() && Object.values(results).includes('passed');
  const endError = !run && dates.endsOn && dates.startsOn && dates.endsOn < dates.startsOn ? t('courses.endBeforeStart') : undefined;
  const chosen = Object.entries(results).filter(([, r]) => r !== 'absent').map(([personId, result]) => ({ personId, result }));
  const save = useAction(
    () => send<CourseResultsOutcome>('POST', 'masterdata/course-results', { course, runId: run?.id ?? null, ...(run ? {} : dates), results: chosen }),
    { success: t('planning.resultsSaved'), invalidate, onSuccess: (result) => (result.skipped.length ? setOutcome(result) : onClose()) },
  );
  const name = (id: string) => {
    const n = participants.find((x) => x.person.id === id);
    return n ? `${n.person.lastName}, ${n.person.firstName}` : id;
  };
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      size="lg"
      title={t('planning.recordResults')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{outcome ? common('actions.close') : common('actions.cancel')}</Button>
          {!outcome && <Button loading={save.isPending} disabled={!chosen.length || notFinished || Boolean(endError) || (!run && !dates.startsOn)} onClick={() => save.mutate(undefined)}>{common('actions.save')}</Button>}
        </Group>
      }
    >
      <Stack gap="sm">
        {outcome ? (
          <Notice kind="warning">
            {t('planning.resultsSkipped', { recorded: outcome.recorded })}
            <ul>{outcome.skipped.map((s) => <li key={s.personId}>{name(s.personId)}: {translateCode(s.code)}</li>)}</ul>
          </Notice>
        ) : (
          <>
            {run ? (
              <Text size="sm">{t('planning.runSummary', { period: period(run, i18n.language), location: run.location || '–' })}</Text>
            ) : (
              <>
                <SimpleGrid cols={2}>
                  <DateInput label={t('courses.startsOn')} value={dates.startsOn} onChange={(v) => setDates({ ...dates, startsOn: v })} valueFormat="DD.MM.YYYY" required />
                  <DateInput label={t('courses.endsOn')} value={dates.endsOn} onChange={(v) => setDates({ ...dates, endsOn: v })} valueFormat="DD.MM.YYYY" clearable error={endError} />
                </SimpleGrid>
                <TextInput label={t('courses.location')} value={dates.location} onChange={(e) => setDates({ ...dates, location: e.currentTarget.value })} />
              </>
            )}
            {notFinished && <Notice kind="warning">{t('courses.notFinished')}</Notice>}
            <DataTable<Nomination>
              rows={participants}
              rowKey={(n) => n.person.id}
              exportable={false}
              empty={t('planning.noConfirmed')}
              columns={[
                { key: 'name', header: t('persons.name'), render: (n) => `${n.person.lastName}, ${n.person.firstName}` },
                { key: 'department', header: t('persons.department'), render: (n) => departments.find((d) => d.id === n.person.primaryDepartmentId)?.name ?? '' },
                {
                  key: 'result',
                  header: t('courses.result'),
                  render: (n) => (
                    <Select
                      aria-label={t('courses.result')}
                      data={(['passed', 'failed', 'absent'] as const).map((r) => ({ value: r, label: t(`planning.result.${r}`) }))}
                      value={results[n.person.id] ?? 'passed'}
                      onChange={(v) => v && setResults({ ...results, [n.person.id]: v as Result })}
                      allowDeselect={false}
                      size="xs"
                      w={170}
                    />
                  ),
                },
              ]}
            />
            <Text size="xs" c="dimmed">{t('courses.passedHint')}</Text>
          </>
        )}
      </Stack>
    </ResponsiveDialog>
  );
}

function Planning({ course }: { course: string }) {
  const { t, i18n } = useTranslation('masterdata');
  const localized = useLocalized();
  const { data: departments = [] } = useDepartments();
  const { data: courses = [] } = useCourses();
  const qualificationName = useCatalogNames('qualification');
  const planningKey = ['masterdata', 'course-planning', course];
  const { data: planning } = useQuery({ queryKey: planningKey, queryFn: () => api<CoursePlanning>(`masterdata/course-planning/${course}`) });
  const [chosen, setChosen] = useState<string[]>([]);
  const [priority, setPriority] = useState('2');
  const [desired, setDesired] = useState(() => String(new Date().getFullYear() + 1));
  const [departmentFilter, setDepartmentFilter] = useState<string | null>(null);
  const [sort, setSort] = useState<'name' | 'department'>('name');
  const [removing, setRemoving] = useState<Nomination | null>(null);
  const [removingRun, setRemovingRun] = useState<CourseRun | null>(null);
  const [runDialog, setRunDialog] = useState<{ run?: CourseRun } | null>(null);
  const [results, setResults] = useState<{ run: CourseRun | null } | null>(null);
  const [skipped, setSkipped] = useState<BulkNominationResult['skipped']>([]);
  const invalidate = [planningKey, NOMINATIONS, NEEDS];
  const nominate = useAction(
    () => send<BulkNominationResult>('POST', 'masterdata/course-nominations/bulk', { course, personIds: chosen, priority: Number(priority), desiredPeriod: desired }),
    {
      success: t('planning.nominated'),
      invalidate,
      onSuccess: (result) => {
        setChosen([]);
        setSkipped(result.skipped);
      },
    },
  );
  const update = useAction(
    (n: CourseNomination) => send('PUT', `masterdata/course-nominations/${n.id}`, { personId: n.personId, course: n.course, priority: n.priority, desiredPeriod: n.desiredPeriod, status: n.status, notes: n.notes, runId: n.runId }),
    { invalidate },
  );
  const remove = useAction((id: string) => send('DELETE', `masterdata/course-nominations/${id}`), { success: t('person.saved'), invalidate });
  const removeRun = useAction((id: string) => send('DELETE', `masterdata/course-runs/${id}`), { success: t('person.saved'), invalidate });

  const departmentName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? '';
  const candidates = (planning?.candidates ?? [])
    .filter((p) => !departmentFilter || p.departmentIds.includes(departmentFilter))
    .toSorted((a, b) =>
      sort === 'department'
        ? departmentName(a.primaryDepartmentId).localeCompare(departmentName(b.primaryDepartmentId), 'de') || a.lastName.localeCompare(b.lastName, 'de')
        : a.lastName.localeCompare(b.lastName, 'de') || a.firstName.localeCompare(b.firstName, 'de'),
    );
  if (!planning) return null;
  const courseName = (key: string) => {
    const found = courses.find((c) => c.key === key);
    return found ? localized(found.name) : key;
  };
  const c = planning.course;
  const conditions = [
    c.prerequisites.length ? t('planning.prerequisites', { list: c.prerequisites.map(courseName).join(', ') }) : t('planning.noPrerequisites'),
    c.requiredQualifications.length ? t('planning.requires', { list: c.requiredQualifications.map((q) => qualificationName(q, i18n.language)).join(', ') }) : '',
    c.minimumAge !== null ? t('planning.minimumAge', { age: c.minimumAge }) : '',
    t('planning.statuses', { list: c.allowedStatuses.map((s) => t(`status.${s}`)).join(', ') }),
    c.grantsQualifications.length ? t('planning.grants', { list: c.grantsQualifications.map((q) => qualificationName(q, i18n.language)).join(', ') }) : '',
  ].filter(Boolean);
  const runOptions = planning.runs.map((r) => ({ value: r.id, label: [period(r, i18n.language), r.location].filter(Boolean).join(' · ') }));
  const allChosen = candidates.length > 0 && candidates.every((p) => chosen.includes(p.id));
  const toggle = (id: string, on: boolean) => setChosen((list) => (on ? [...new Set([...list, id])] : list.filter((x) => x !== id)));
  const personName = (id: string) => {
    const p = planning.candidates.find((x) => x.id === id) ?? planning.nominations.find((n) => n.person.id === id)?.person;
    return p ? `${p.lastName}, ${p.firstName}` : id;
  };

  return (
    <Stack gap="lg">
      <Panel title={localized(c.name)} aside={<Text size="sm" c="dimmed">{t(`courseLevel.${c.level}`)}</Text>}>
        <Text size="sm" c="dimmed">{conditions.join(' · ')}</Text>
      </Panel>

      <Panel title={t('planning.runs')} aside={<Button size="xs" variant="outline" onClick={() => setRunDialog({})}>{t('planning.addRun')}</Button>}>
        <DataTable<CourseRun>
          rows={planning.runs}
          rowKey={(r) => r.id}
          empty={t('planning.noRuns')}
          columns={[
            { key: 'period', header: t('courses.date'), render: (r) => <Text size="sm" fw={700}>{period(r, i18n.language)}</Text> },
            { key: 'location', header: t('courses.location'), render: (r) => r.location },
            { key: 'nominated', header: t('planning.nominatedColumn'), align: 'right', render: (r) => r.nominated },
            { key: 'recorded', header: t('planning.recordedColumn'), align: 'right', render: (r) => r.recorded },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (r) => (
                <Group gap={4} justify="flex-end" wrap="nowrap">
                  <Button size="compact-xs" variant="outline" onClick={() => setResults({ run: r })}>{t('planning.recordResults')}</Button>
                  <ActionIcon aria-label={t('planning.editRun')} onClick={() => setRunDialog({ run: r })}><IconPencil size={16} /></ActionIcon>
                  {r.recorded === 0 && <ActionIcon aria-label={t('planning.removeRun')} onClick={() => setRemovingRun(r)}><IconTrash size={16} /></ActionIcon>}
                </Group>
              ),
            },
          ]}
        />
      </Panel>

      <Panel
        title={t('planning.nominationsTitle', { count: planning.nominations.length })}
        aside={<Button size="xs" variant="outline" onClick={() => setResults({ run: null })}>{t('planning.recordResultsWithoutRun')}</Button>}
      >
        <DataTable<Nomination>
          rows={planning.nominations}
          rowKey={(n) => n.nomination.id}
          empty={t('planning.noNominations')}
          highlight={(n) => !n.prerequisitesMet}
          columns={[
            { key: 'person', header: t('persons.name'), render: (n) => <Text component={Link} to={`/masterdata/persons/${n.person.id}?tab=courses`} size="sm" fw={700} c="brand">{n.person.lastName}, {n.person.firstName}</Text> },
            { key: 'department', header: t('persons.department'), render: (n) => departmentName(n.person.primaryDepartmentId) },
            {
              key: 'priority',
              header: t('courses.priority'),
              render: (n) => (
                <Select
                  aria-label={t('courses.priority')}
                  data={['1', '2', '3'].map((p) => ({ value: p, label: t(`priority.${p}`) }))}
                  value={String(n.nomination.priority)}
                  onChange={(v) => v && update.mutate({ ...n.nomination, priority: Number(v) })}
                  allowDeselect={false}
                  size="xs"
                  w={100}
                />
              ),
            },
            { key: 'desired', header: t('courses.desiredPeriod'), render: (n) => n.nomination.desiredPeriod },
            {
              key: 'run',
              header: t('planning.run'),
              render: (n) => (
                <Select
                  aria-label={t('planning.run')}
                  placeholder={t('planning.noRun')}
                  data={runOptions}
                  value={n.nomination.runId}
                  onChange={(v) => update.mutate({ ...n.nomination, runId: v })}
                  clearable
                  size="xs"
                  w={190}
                />
              ),
            },
            { key: 'prerequisites', header: t('planning.prerequisite'), render: (n) => <StatusBadge tone={n.prerequisitesMet ? 'done' : 'warning'}>{t(n.prerequisitesMet ? 'planning.met' : 'planning.missing')}</StatusBadge> },
            {
              key: 'status',
              header: t('courses.status'),
              render: (n) => (
                <Select
                  aria-label={t('courses.status')}
                  data={(['nominated', 'registered', 'confirmed', 'rejected'] as const).map((s) => ({ value: s, label: t(`nominationStatus.${s}`) }))}
                  value={n.nomination.status}
                  onChange={(v) => v && update.mutate({ ...n.nomination, status: v as CourseNomination['status'] })}
                  allowDeselect={false}
                  size="xs"
                  w={150}
                />
              ),
            },
            {
              key: 'notes',
              header: t('entries.notes'),
              render: (n) => (
                <TextInput
                  aria-label={t('entries.notes')}
                  defaultValue={n.nomination.notes}
                  onBlur={(e) => e.currentTarget.value !== n.nomination.notes && update.mutate({ ...n.nomination, notes: e.currentTarget.value })}
                  size="xs"
                  w={180}
                />
              ),
            },
            { key: 'remove', header: '', align: 'right', render: (n) => <ActionIcon aria-label={t('planning.remove')} onClick={() => setRemoving(n)}><IconTrash size={16} /></ActionIcon> },
          ]}
        />
      </Panel>

      <Panel title={t('planning.candidatesTitle', { count: planning.candidates.length })}>
        <Stack gap="sm">
          <Text size="sm" c="dimmed">{t('planning.candidatesHint')}</Text>
          <Group align="end">
            <Select label={t('persons.department')} placeholder={t('persons.allDepartments')} data={departments.map((d) => ({ value: d.id, label: d.name }))} value={departmentFilter} onChange={setDepartmentFilter} clearable searchable w={240} />
            <Select label={t('planning.sortBy')} data={[{ value: 'name', label: t('planning.sortName') }, { value: 'department', label: t('planning.sortDepartment') }]} value={sort} onChange={(v) => v && setSort(v as 'name' | 'department')} allowDeselect={false} w={180} />
          </Group>
          <DataTable
            rows={candidates}
            rowKey={(p) => p.id}
            empty={t('planning.noCandidates')}
            onRowClick={(p) => toggle(p.id, !chosen.includes(p.id))}
            exportable={false}
            columns={[
              {
                key: 'select',
                header: ' ',
                render: (p) => <Checkbox aria-label={`${p.lastName}, ${p.firstName}`} checked={chosen.includes(p.id)} onChange={(e) => toggle(p.id, e.currentTarget.checked)} onClick={(e) => e.stopPropagation()} />,
              },
              { key: 'name', header: t('persons.name'), render: (p) => `${p.lastName}, ${p.firstName}` },
              { key: 'department', header: t('persons.department'), render: (p) => departmentName(p.primaryDepartmentId) },
              { key: 'status', header: t('persons.status'), render: (p) => t(`status.${p.status}`) },
            ]}
          />
          {candidates.length > 0 && (
            <Checkbox
              label={t('planning.selectAll', { count: candidates.length })}
              checked={allChosen}
              onChange={(e) => setChosen(e.currentTarget.checked ? [...new Set([...chosen, ...candidates.map((p) => p.id)])] : chosen.filter((id) => !candidates.some((p) => p.id === id)))}
            />
          )}
          <Group align="end">
            <Select label={t('courses.priority')} data={['1', '2', '3'].map((p) => ({ value: p, label: t(`priority.${p}`) }))} value={priority} onChange={(v) => v && setPriority(v)} allowDeselect={false} w={140} />
            <TextInput label={t('courses.desiredPeriod')} value={desired} onChange={(e) => setDesired(e.currentTarget.value)} w={140} />
            <Button disabled={!chosen.length} loading={nominate.isPending} onClick={() => nominate.mutate(undefined)}>{t('planning.nominate', { count: chosen.length })}</Button>
          </Group>
          {skipped.length > 0 && (
            <Notice kind="info">
              {t('planning.skipped')}
              <ul>{skipped.map((s) => <li key={s.personId}>{personName(s.personId)}: {translateCode(s.code)}</li>)}</ul>
            </Notice>
          )}
        </Stack>
      </Panel>

      {runDialog && <RunDialog course={course} run={runDialog.run} onClose={() => setRunDialog(null)} invalidate={invalidate} />}
      {results && <ResultsDialog course={course} run={results.run} nominations={planning.nominations} onClose={() => setResults(null)} invalidate={invalidate} />}
      <ConfirmDialog
        opened={!!removing}
        onClose={() => setRemoving(null)}
        title={t('planning.removeTitle')}
        description={removing ? t('planning.removeText', { name: `${removing.person.firstName} ${removing.person.lastName}`, course: localized(c.name) }) : ''}
        confirmLabel={t('planning.remove')}
        onConfirm={() => {
          if (removing) remove.mutate(removing.nomination.id);
          setRemoving(null);
        }}
      />
      <ConfirmDialog
        opened={!!removingRun}
        onClose={() => setRemovingRun(null)}
        title={t('planning.removeRun')}
        description={t('planning.removeRunText')}
        confirmLabel={t('planning.removeRun')}
        onConfirm={() => {
          if (removingRun) removeRun.mutate(removingRun.id);
          setRemovingRun(null);
        }}
      />
    </Stack>
  );
}

/** Course needs: per course and department those with the course, the target and the open nominations. */
function Needs() {
  const { t } = useTranslation('masterdata');
  const localized = useLocalized();
  const { data: courses = [] } = useCourses();
  const { data: departments = [] } = useDepartments();
  const { data: needs = [], isLoading } = useQuery({ queryKey: NEEDS, queryFn: () => api<CourseNeed[]>('masterdata/course-needs') });
  const [course, setCourse] = useState<string | null>(null);
  const rows = needs.filter((n) => !course || n.course === course);
  const courseName = (key: string) => {
    const found = courses.find((c) => c.key === key);
    return found ? localized(found.name) : key;
  };
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">{t('planning.needsHint')}</Text>
      <Select label={t('courses.course')} placeholder={t('persons.all')} data={courses.filter((c) => c.active).map((c) => ({ value: c.key, label: localized(c.name) }))} value={course} onChange={setCourse} clearable searchable w={280} />
      <DataTable<CourseNeed>
        rows={rows}
        rowKey={(n) => `${n.course}|${n.departmentId}`}
        empty={isLoading ? t('loading') : t('planning.noNeeds')}
        highlight={(n) => n.target !== null && n.have + n.nominated < n.target}
        columns={[
          { key: 'course', header: t('courses.course'), render: (n) => <Text size="sm" fw={700}>{courseName(n.course)}</Text> },
          { key: 'department', header: t('persons.department'), render: (n) => departments.find((d) => d.id === n.departmentId)?.name ?? '' },
          { key: 'have', header: t('planning.have'), align: 'right', render: (n) => n.have },
          { key: 'target', header: t('planning.target'), align: 'right', render: (n) => n.target ?? '–' },
          { key: 'nominated', header: t('planning.nominatedColumn'), align: 'right', render: (n) => n.nominated },
          {
            key: 'gap',
            header: t('planning.gap'),
            align: 'right',
            render: (n) => (n.target === null ? '' : <StatusBadge tone={n.have + n.nominated >= n.target ? 'done' : 'warning'}>{Math.max(0, n.target - n.have - n.nominated)}</StatusBadge>),
          },
        ]}
      />
    </Stack>
  );
}

/** Central course planning: courses with runs, nominations and candidates across departments, and the course needs. */
export function CoursePlanningPage() {
  const { t } = useTranslation('masterdata');
  const localized = useLocalized();
  const { data: courses = [], isLoading } = useCourses();
  const { data: nominations = [] } = useQuery({ queryKey: NOMINATIONS, queryFn: () => api<CourseNomination[]>('masterdata/course-nominations') });
  const [level, setLevel] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const active = courses.filter((c) => c.active && (!level || c.level === level));
  const count = (course: string, statuses: string[]) => nominations.filter((n) => n.course === course && statuses.includes(n.status)).length;
  const current = selected ?? active[0]?.key ?? null;

  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={[{ label: t('module') }, { label: t('planning.title') }]}
        title={t('planning.title')}
        actions={<Button component={Link} to="/lists" variant="default">{t('persons.lists')}</Button>}
      />
      {!isLoading && !courses.length ? (
        <EmptyState title={t('planning.noCourses')} />
      ) : (
        <Tabs defaultValue="courses" keepMounted={false}>
          <Tabs.List mb="lg">
            <Tabs.Tab value="courses">{t('planning.coursesTab')}</Tabs.Tab>
            <Tabs.Tab value="needs">{t('planning.needsTab')}</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="courses">
            <Grid gap="lg">
              <Grid.Col span={{ base: 12, lg: 4 }}>
                <Stack gap="sm">
                  <Select label={t('courses.level')} placeholder={t('persons.all')} data={(['municipal', 'district', 'state-school'] as const).map((l) => ({ value: l, label: t(`courseLevel.${l}`) }))} value={level} onChange={setLevel} clearable w={240} />
                  <DataTable
                    rows={active}
                    rowKey={(c) => c.key}
                    selectedKey={current}
                    onRowClick={(c) => setSelected(c.key)}
                    columns={[
                      { key: 'name', header: t('courses.course'), render: (c) => <Text fw={700} size="sm">{localized(c.name)}</Text> },
                      { key: 'level', header: t('courses.level'), render: (c) => t(`courseLevel.${c.level}`) },
                      { key: 'nominated', header: t('planning.nominatedColumn'), align: 'right', render: (c) => count(c.key, OPEN) },
                      { key: 'registered', header: t('planning.registeredColumn'), align: 'right', render: (c) => count(c.key, ['registered', 'confirmed']) },
                    ]}
                  />
                </Stack>
              </Grid.Col>
              <Grid.Col span={{ base: 12, lg: 8 }}>{current && <Planning key={current} course={current} />}</Grid.Col>
            </Grid>
          </Tabs.Panel>
          <Tabs.Panel value="needs"><Needs /></Tabs.Panel>
        </Tabs>
      )}
    </Stack>
  );
}
