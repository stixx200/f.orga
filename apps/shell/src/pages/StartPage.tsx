import { Grid, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Session } from '@forga/core-contracts';
import { can, formatDate, formatLongDate, useLocalized, useTranslation } from '@forga/web-sdk';
import { EmptyState, KpiTile, PageHeader, Panel, StatusBadge } from '@forga/web-ui';
import type { LoadedModule } from '../modules';
import { deadlineBadge } from '../frame/stage';
import { taskLink, useTasks } from '../frame/TasksBell';

function greetingKey(hour: number): 'morning' | 'day' | 'evening' {
  if (hour < 11) return 'morning';
  if (hour < 18) return 'day';
  return 'evening';
}

/** Grants for the whole brigade in at least one permission mean the user sees brigade-wide data. */
function brigadeScope(session: Session): boolean {
  return Object.values(session.permissions).some((grant) => grant === 'brigade');
}

function TaskList() {
  const { t, i18n } = useTranslation('shell');
  const localized = useLocalized();
  const { data = [] } = useTasks();
  if (!data.length) return <EmptyState title={t('start.noTasks')} />;
  return (
    <Stack gap={0}>
      {data.map((d) => {
        const badge = deadlineBadge(d, t);
        const to = taskLink(d);
        const row = (
          <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '8px 0', borderBottom: '1px solid var(--forga-grid)' }}>
            <div style={{ minWidth: 112 }}>
              <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>
            </div>
            <div style={{ flex: 1 }}>
              <Text size="sm" fw={700}>{localized(d.title)}</Text>
              <Text size="xs" c="dimmed">{d.subject.label} · {formatDate(d.dueOn, i18n.language)}</Text>
            </div>
          </div>
        );
        return to ? (
          <UnstyledButton key={d.id} component={Link} to={to}>{row}</UnstyledButton>
        ) : (
          <div key={d.id}>{row}</div>
        );
      })}
    </Stack>
  );
}

/** Start page: greeting, figures and cards of the modules, deadlines and tasks for the user's roles. */
export function StartPage({ modules, session }: { modules: LoadedModule[]; session: Session }) {
  const { t, i18n } = useTranslation('shell');
  const { data: tasks = [] } = useTasks();
  const [now] = useState(() => new Date());
  const items = modules
    // Item IDs are unique per module only, so the key includes the module.
    .flatMap((m) => (m.web?.dashboard ?? []).map((item) => ({ ...item, id: `${m.info.id}.${item.id}` })))
    .filter((item) => !item.permission || can(session, item.permission))
    .toSorted((a, b) => (a.order ?? 100) - (b.order ?? 100));
  const area = (name: 'kpi' | 'main' | 'side') => items.filter((item) => item.area === name);
  const overdue = tasks.filter((d) => d.stage === 'overdue').length;
  const upcoming = tasks.length - overdue;

  return (
    <Stack gap="lg">
      <PageHeader
        title={t(`start.greeting.${greetingKey(now.getHours())}`, { name: session.user.displayName })}
        subtitle={`${formatLongDate(now, i18n.language)} · ${t(brigadeScope(session) ? 'start.scopeBrigade' : 'start.scopeDepartments')}`}
      />
      <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
        {area('kpi').map(({ id, component: Item }) => (
          <Item key={id} />
        ))}
        <KpiTile value={overdue} label={t('start.deadlinesOverdue')} hint={t('start.deadlinesUpcoming', { count: upcoming })} attention={overdue > 0} />
      </SimpleGrid>
      <Grid gap="lg">
        {area('main').length > 0 && (
          <Grid.Col span={{ base: 12, md: 8 }}>
            <Stack gap="lg">
              {area('main').map(({ id, component: Item }) => (
                <Item key={id} />
              ))}
            </Stack>
          </Grid.Col>
        )}
        <Grid.Col span={{ base: 12, md: area('main').length > 0 ? 4 : 12 }}>
          <Stack gap="lg">
            <Panel title={t('start.tasks')} aside={<Text size="xs" c="dimmed">{t('start.tasksForRoles')}</Text>}>
              <TaskList />
            </Panel>
            {area('side').map(({ id, component: Item }) => (
              <Item key={id} />
            ))}
          </Stack>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
