import { Anchor, Button, Grid, Group, Select, SimpleGrid, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import type { OnboardingItem, Session } from '@forga/core-contracts';
import { api, can, formatLongDate, useLocalized, useTranslation } from '@forga/web-sdk';
import { EmptyState, KpiTile, PageHeader, Panel } from '@forga/web-ui';
import type { LoadedModule } from '../modules';
import { TaskGroups } from '../frame/TaskGroups';
import { useTasks } from '../frame/TasksBell';

function greetingKey(hour: number): 'morning' | 'day' | 'evening' {
  if (hour < 11) return 'morning';
  if (hour < 18) return 'day';
  return 'evening';
}

/** Grants for the whole brigade in at least one permission mean the user sees brigade-wide data. */
function brigadeScope(session: Session): boolean {
  return Object.values(session.permissions).some((grant) => grant === 'brigade');
}

/** Tasks grouped by kind and due date, filterable by module. */
function TaskList({ modules }: { modules: LoadedModule[] }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const { data = [] } = useTasks();
  const [module, setModule] = useState<string | null>(null);
  if (!data.length) return <EmptyState title={t('start.noTasks')} />;
  const present = [...new Set(data.map((d) => d.module))];
  const moduleName = (id: string) => {
    const loaded = modules.find((m) => m.info.id === id);
    return loaded ? localized(loaded.info.name) : id === 'core' ? t('nav.administration') : id;
  };
  return (
    <Stack gap="sm">
      {present.length > 1 && (
        <Select
          aria-label={t('tasks.module')}
          placeholder={t('tasks.allModules')}
          data={present.map((id) => ({ value: id, label: moduleName(id) }))}
          value={module}
          onChange={setModule}
          clearable
          size="xs"
          maw={260}
        />
      )}
      <TaskGroups tasks={module ? data.filter((d) => d.module === module) : data} />
    </Stack>
  );
}

/** What an administrator still has to set up; disappears once everything is done. */
function Onboarding() {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const { data = [] } = useQuery({ queryKey: ['core', 'onboarding'], queryFn: () => api<OnboardingItem[]>('core/onboarding') });
  const open = data.filter((item) => !item.done);
  if (!open.length) return null;
  const label = (item: OnboardingItem) =>
    item.key.startsWith('module:')
      ? t('onboarding.items.module', { name: item.label ? localized(item.label) : item.key.slice(7) })
      : // Further steps of a module bring their own text (e.g. the data protection contacts).
        item.label
        ? localized(item.label)
        : t(`onboarding.items.${item.key}`);
  return (
    <Panel title={t('onboarding.title')} aside={<Text size="xs" c="dimmed">{t('onboarding.done', { done: data.length - open.length, total: data.length })}</Text>}>
      <Text size="sm" mb="xs">{t('onboarding.intro')}</Text>
      <Stack gap={6}>
        {open.map((item) => (
          <Group key={item.key} justify="space-between" wrap="nowrap" gap="sm">
            <Text size="sm">{label(item)}</Text>
            <Button component={Link} to={item.to} size="compact-xs" variant="default" style={{ flexShrink: 0 }}>{t('onboarding.open')}</Button>
          </Group>
        ))}
      </Stack>
    </Panel>
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
      {(can(session, 'core.settings.manage') || can(session, 'core.users.manage')) && <Onboarding />}
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
              <TaskList modules={modules} />
              <Anchor component={Link} to="/profile" size="xs" mt="sm" display="block">{t('start.chooseTasks')}</Anchor>
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
