import type { Deadline } from '@forga/core-contracts';
import { localDate } from '@forga/web-sdk';
import type { Tone } from '@forga/web-ui';

const DAY = 86_400_000;

/** Text and tone for the badge of a deadline, e.g. "überfällig", "in 12 Tagen". */
export function deadlineBadge(deadline: Deadline, t: (key: string, options?: Record<string, unknown>) => string): { text: string; tone: Tone } {
  if (deadline.stage === 'overdue') return { text: t('stage.overdue'), tone: 'error' };
  const days = Math.round((new Date(`${deadline.dueOn}T12:00:00Z`).getTime() - new Date(localDate() + 'T12:00:00Z').getTime()) / DAY);
  if (days <= 0) return { text: t('stage.today'), tone: 'warning' };
  return { text: t('stage.upcoming', { days }), tone: deadline.stage === 'due' ? 'warning' : 'neutral' };
}
