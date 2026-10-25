import { ActionIcon, Indicator, Popover, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import type { Deadline } from '@forga/core-contracts';
import { api, useLocalized, useTranslation } from '@forga/web-sdk';
import { StatusBadge } from '@forga/web-ui';
import { deadlineBadge } from './stage';

export function useTasks() {
  return useQuery({ queryKey: ['core', 'tasks'], queryFn: () => api<Deadline[]>('core/tasks'), staleTime: 60_000 });
}

/** Link of a task to the subject's page, if the subject type is known. */
export function taskLink(deadline: Deadline): string | undefined {
  if (deadline.subject.type === 'masterdata.person') return `/masterdata/persons/${deadline.subject.id}`;
  if (deadline.subject.type === 'incidents.report') return `/incidents/reports/${deadline.subject.id}`;
  if (deadline.subject.type === 'core.me') return '/me';
  return undefined;
}

/** Bell with the number of overdue and due tasks; opens the list. */
export function TasksBell() {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const { data = [] } = useTasks();
  const urgent = data.filter((d) => d.stage !== 'upcoming').length;
  return (
    <Popover width={360} position="bottom-end" shadow="lg">
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
        <Stack gap={4}>
          {data.slice(0, 8).map((d) => {
            const badge = deadlineBadge(d, t);
            const to = taskLink(d);
            const content = (
              <>
                <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>
                <Text size="sm" fw={700} mt={2}>{localized(d.title)}</Text>
                <Text size="xs" c="dimmed">{d.subject.label}</Text>
              </>
            );
            return to ? (
              <UnstyledButton key={d.id} component={Link} to={to} p={6}>{content}</UnstyledButton>
            ) : (
              <div key={d.id} style={{ padding: 6 }}>{content}</div>
            );
          })}
        </Stack>
        {data.length > 0 && <Text component={Link} to="/" size="sm" c="brand" fw={700} mt="sm" display="block">{t('header.allTasks')}</Text>}
      </Popover.Dropdown>
    </Popover>
  );
}
