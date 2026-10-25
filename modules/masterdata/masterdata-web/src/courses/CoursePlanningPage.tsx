import { ActionIcon, Button, Checkbox, Grid, Group, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { CourseNomination, CoursePlanning } from '@forga/masterdata-contracts';
import { api, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { DataTable, EmptyState, PageHeader, Panel, StatusBadge, useAction } from '@forga/web-ui';
import { useCatalogNames, useDepartments } from '../api';
import { useCourses } from '../persons/CoursesTab';

const NOMINATIONS = ['masterdata', 'course-nominations'] as const;
const OPEN = ['nominated', 'registered', 'confirmed'];

function Planning({ course }: { course: string }) {
  const { t, i18n } = useTranslation('masterdata');
  const localized = useLocalized();
  const { data: departments = [] } = useDepartments();
  const qualificationName = useCatalogNames('qualification');
  const planningKey = ['masterdata', 'course-planning', course];
  const { data: planning } = useQuery({ queryKey: planningKey, queryFn: () => api<CoursePlanning>(`masterdata/course-planning/${course}`) });
  const [chosen, setChosen] = useState<string[]>([]);
  const [priority, setPriority] = useState('2');
  const [period, setPeriod] = useState(() => String(new Date().getFullYear() + 1));
  const invalidate = [planningKey, NOMINATIONS];
  const nominate = useAction(
    async () => {
      for (const personId of chosen) await send('POST', 'masterdata/course-nominations', { personId, course, priority: Number(priority), desiredPeriod: period });
    },
    { success: t('planning.nominated'), invalidate, onSuccess: () => setChosen([]) },
  );
  const update = useAction((n: CourseNomination & { status: string }) => send('PUT', `masterdata/course-nominations/${n.id}`, { personId: n.personId, course: n.course, priority: n.priority, desiredPeriod: n.desiredPeriod, status: n.status, notes: n.notes }), { invalidate });
  const remove = useAction((id: string) => send('DELETE', `masterdata/course-nominations/${id}`), { invalidate });
  if (!planning) return null;
  const department = (id: string | null) => departments.find((d) => d.id === id)?.shortName ?? '';

  return (
    <Panel
      title={localized(planning.course.name)}
      aside={<Text size="sm" c="dimmed">{t(`courseLevel.${planning.course.level}`)}</Text>}
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {planning.course.prerequisites.length ? t('planning.prerequisites', { list: planning.course.prerequisites.join(', ') }) : t('planning.noPrerequisites')}
          {planning.course.grantsQualifications.length ? ` · ${t('planning.grants', { list: planning.course.grantsQualifications.map((q) => qualificationName(q, i18n.language)).join(', ') })}` : ''}
        </Text>
        <Text fw={700}>{t('planning.nominationsTitle', { count: planning.nominations.length })}</Text>
        <DataTable
          rows={planning.nominations}
          rowKey={(n) => n.nomination.id}
          empty={t('planning.noNominations')}
          highlight={(n) => !n.prerequisitesMet}
          columns={[
            { key: 'person', header: t('persons.name'), render: (n) => <Text component={Link} to={`/masterdata/persons/${n.person.id}`} size="sm" fw={700} c="brand">{n.person.lastName}, {n.person.firstName}</Text> },
            { key: 'department', header: t('persons.department'), render: (n) => department(n.person.primaryDepartmentId) },
            { key: 'priority', header: t('courses.priority'), render: (n) => t(`priority.${n.nomination.priority}`) },
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
                  w={160}
                />
              ),
            },
            { key: 'remove', header: '', align: 'right', render: (n) => <ActionIcon aria-label={t('planning.remove')} onClick={() => remove.mutate(n.nomination.id)}><IconTrash size={16} /></ActionIcon> },
          ]}
        />
        <Text fw={700} mt="sm">{t('planning.candidatesTitle', { count: planning.candidates.length })}</Text>
        <Text size="sm" c="dimmed">{t('planning.candidatesHint')}</Text>
        {planning.candidates.length ? (
          <Checkbox.Group value={chosen} onChange={setChosen}>
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
              {planning.candidates.map((p) => (
                <Checkbox key={p.id} value={p.id} label={`${p.lastName}, ${p.firstName}`} description={department(p.primaryDepartmentId)} />
              ))}
            </SimpleGrid>
          </Checkbox.Group>
        ) : (
          <Text size="sm" c="dimmed">{t('planning.noCandidates')}</Text>
        )}
        <Group align="end">
          <Select label={t('courses.priority')} data={['1', '2', '3'].map((p) => ({ value: p, label: t(`priority.${p}`) }))} value={priority} onChange={(v) => v && setPriority(v)} allowDeselect={false} w={140} />
          <TextInput label={t('courses.desiredPeriod')} value={period} onChange={(e) => setPeriod(e.currentTarget.value)} w={140} />
          <Button disabled={!chosen.length} loading={nominate.isPending} onClick={() => nominate.mutate(undefined)}>{t('planning.nominate', { count: chosen.length })}</Button>
        </Group>
      </Stack>
    </Panel>
  );
}

/** Central course planning: nominations by course across departments, candidates who meet the prerequisites. */
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
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('planning.title') }]} title={t('planning.title')} />
      {!isLoading && !courses.length ? (
        <EmptyState title={t('planning.noCourses')} />
      ) : (
        <Grid gap="lg">
          <Grid.Col span={{ base: 12, lg: 5 }}>
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
          <Grid.Col span={{ base: 12, lg: 7 }}>{current && <Planning key={current} course={current} />}</Grid.Col>
        </Grid>
      )}
    </Stack>
  );
}
