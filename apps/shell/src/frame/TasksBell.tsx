import { ActionIcon, Indicator, Popover, ScrollArea, Text } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { Deadline } from '@forga/core-contracts';
import { api, useTranslation } from '@forga/web-sdk';
import { groupCount, TaskGroups } from './TaskGroups';

const BELL_GROUPS = 8;

export function useTasks() {
  return useQuery({ queryKey: ['core', 'tasks'], queryFn: () => api<Deadline[]>('core/tasks'), staleTime: 60_000 });
}

/** Bell with the number of overdue and due tasks; opens the grouped list. */
export function TasksBell() {
  const { t } = useTranslation('shell');
  const { data = [] } = useTasks();
  const urgent = data.filter((d) => d.stage !== 'upcoming').length;
  const more = groupCount(data) - BELL_GROUPS;
  return (
    <Popover width={380} position="bottom-end" shadow="lg">
      <Popover.Target>
        <Indicator label={urgent} size={18} disabled={!urgent} color="brand" offset={4}>
          <ActionIcon size={44} aria-label={`${t('header.tasks')} (${urgent})`}>
            <IconBell size={22} stroke={1.75} />
          </ActionIcon>
        </Indicator>
      </Popover.Target>
      <Popover.Dropdown>
        <Text fw={700} c="brand" mb="xs">{t('header.tasks')}</Text>
        {!data.length && <Text size="sm" c="dimmed">{t('header.noTasks')}</Text>}
        <ScrollArea.Autosize mah={420}>
          <TaskGroups tasks={data} compact limit={BELL_GROUPS} />
        </ScrollArea.Autosize>
        {more > 0 && <Text size="xs" c="dimmed" mt={4}>{t('header.moreTasks', { count: more })}</Text>}
        {data.length > 0 && <Text component={Link} to="/" size="sm" c="brand" fw={700} mt="sm" display="block">{t('header.allTasks')}</Text>}
      </Popover.Dropdown>
    </Popover>
  );
}
