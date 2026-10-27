import { Anchor, Stack, Text, UnstyledButton } from '@mantine/core';
import { useState } from 'react';
import { Link } from 'react-router';
import type { Deadline, LocalizedText } from '@forga/core-contracts';
import { formatDate, useLocalized, useTranslation } from '@forga/web-sdk';
import { StatusBadge } from '@forga/web-ui';
import { deadlineBadge } from './stage';

/** Pages of subjects for deadlines without their own link (`to`), e.g. from modules that do not set it yet. */
const SUBJECT_ROUTES: Record<string, (id: string) => string> = {
  'masterdata.person': (id) => `/masterdata/persons/${id}`,
  'incidents.report': (id) => `/incidents/reports/${id}`,
  'incidents.incident': (id) => `/incidents/incidents/${id}`,
  'equipment.item': (id) => `/equipment/items/${id}`,
  'clothing.item': (id) => `/clothing/items/${id}`,
  'training.session': (id) => `/training/sessions/${id}`,
  'compensation.item': () => '/compensation/items',
  'cost-recovery.notice': (id) => `/cost-recovery/notices/${id}`,
  'core.audit': () => '/admin/audit',
  'core.me': () => '/me',
};

/** Link of a task: the page the module named, else derived from the subject type. */
export function taskLink(deadline: Deadline): string | undefined {
  return deadline.to ?? SUBJECT_ROUTES[deadline.subject.type]?.(deadline.subject.id);
}

export interface TaskGroup {
  key: string;
  module: string;
  title: LocalizedText;
  overdue: boolean;
  /** Overdue groups: the earliest date; others: the common due date. */
  dueOn: string;
  items: Deadline[];
}

/**
 * Tasks of the same kind and due date form one group ("26 × Unterweisung bis 29.11."); overdue tasks of a kind form one
 * group regardless of the date. Overdue groups come first, then by due date.
 */
export function groupTasks(tasks: readonly Deadline[]): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  for (const task of tasks) {
    const overdue = task.stage === 'overdue';
    const key = [task.module, task.kind, task.title.de, overdue ? 'overdue' : task.dueOn].join('|');
    const group = groups.get(key) ?? { key, module: task.module, title: task.title, overdue, dueOn: task.dueOn, items: [] };
    group.items.push(task);
    if (task.dueOn < group.dueOn) group.dueOn = task.dueOn;
    groups.set(key, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, items: g.items.toSorted((a, b) => a.subject.label.localeCompare(b.subject.label)) }))
    .toSorted((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueOn.localeCompare(b.dueOn) || a.key.localeCompare(b.key));
}

function TaskRow({ task, children }: { task: Deadline; children: React.ReactNode }) {
  const to = taskLink(task);
  return to ? (
    <UnstyledButton component={Link} to={to} display="block">{children}</UnstyledButton>
  ) : (
    <div>{children}</div>
  );
}

/** One group: a single task directly with its link, several as a heading with an expandable list of subjects. */
function GroupView({ group, compact }: { group: TaskGroup; compact: boolean }) {
  const { t, i18n } = useTranslation('shell');
  const localized = useLocalized();
  const [open, setOpen] = useState(false);
  const first = group.items[0];
  const badge = deadlineBadge(first, t);
  const when = group.overdue ? t('tasks.overdueSince', { date: formatDate(group.dueOn, i18n.language) }) : t('tasks.until', { date: formatDate(group.dueOn, i18n.language) });
  const single = group.items.length === 1;
  const heading = (
    <div style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: compact ? 6 : '8px 0', borderBottom: compact ? undefined : '1px solid var(--forga-grid)' }}>
      {!compact && (
        <div style={{ minWidth: 112 }}>
          <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>
        </div>
      )}
      <div style={{ flex: 1 }}>
        {compact && <StatusBadge tone={badge.tone}>{badge.text}</StatusBadge>}
        <Text size="sm" fw={700} mt={compact ? 2 : 0}>
          {single ? localized(group.title) : t('tasks.group', { count: group.items.length, title: localized(group.title) })}
        </Text>
        <Text size="xs" c="dimmed">{single ? `${first.subject.label} · ${when}` : when}</Text>
      </div>
    </div>
  );
  if (single) return <TaskRow task={first}>{heading}</TaskRow>;
  return (
    <div>
      {heading}
      <Anchor component="button" type="button" size="xs" ml={compact ? 6 : 124} onClick={() => setOpen((o) => !o)}>
        {open ? t('tasks.hide') : t('tasks.show', { count: group.items.length })}
      </Anchor>
      {open && (
        <Stack gap={2} ml={compact ? 6 : 124} my={4}>
          {group.items.map((task) => (
            <TaskRow key={task.id} task={task}>
              <Text size="sm" c={taskLink(task) ? 'brand' : undefined}>
                {task.subject.label}
                {group.overdue && <Text span size="xs" c="dimmed"> · {formatDate(task.dueOn, i18n.language)}</Text>}
              </Text>
            </TaskRow>
          ))}
        </Stack>
      )}
    </div>
  );
}

/** Grouped tasks; `limit` shows only the first groups (bell). */
export function TaskGroups({ tasks, compact = false, limit }: { tasks: readonly Deadline[]; compact?: boolean; limit?: number }) {
  const groups = groupTasks(tasks);
  const shown = limit === undefined ? groups : groups.slice(0, limit);
  return (
    <Stack gap={compact ? 4 : 0}>
      {shown.map((group) => (
        <GroupView key={group.key} group={group} compact={compact} />
      ))}
    </Stack>
  );
}

export function groupCount(tasks: readonly Deadline[]): number {
  return groupTasks(tasks).length;
}
