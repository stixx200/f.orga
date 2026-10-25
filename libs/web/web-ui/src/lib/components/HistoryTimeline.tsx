import { Loader, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { HistoryEntry } from '@forga/core-contracts';
import { api, formatDateTime, useTranslation } from '@forga/web-sdk';
import classes from './components.module.css';

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '–';
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * History of a record (including its child records): who changed which field from what to what.
 * Masked fields (missing permission) show "hidden" instead of values.
 */
export function HistoryTimeline({ entity, id, fieldLabels = {} }: { entity: string; id: string; fieldLabels?: Record<string, string> }) {
  const { t, i18n } = useTranslation('common');
  const { data, isLoading } = useQuery({
    queryKey: ['core', 'history', entity, id],
    queryFn: () => api<(HistoryEntry & { userName: string | null; impersonatorName?: string | null })[]>(`core/history/${entity}/${id}`),
  });
  if (isLoading) return <Loader size="sm" />;
  if (!data?.length) return <Text c="dimmed">{t('history.empty')}</Text>;
  return (
    <div>
      {data.map((entry) => (
        <div key={entry.id} className={classes.historyItem}>
          <Text size="sm" fw={700}>
            {t(`history.action.${entry.action}`)}
            {entry.parentEntity ? ` · ${entry.entity.split('.')[1]}` : ''}
          </Text>
          <Text size="xs" c="dimmed">
            {formatDateTime(entry.timestamp, i18n.language)} · {entry.impersonatorName ? t('history.impersonated', { admin: entry.impersonatorName, user: entry.userName }) : (entry.userName ?? t('history.system'))}
          </Text>
          <Stack gap={2} mt={4}>
            {Object.entries(entry.changes).map(([field, change]) => (
              <Text size="sm" key={field}>
                <strong>{fieldLabels[field] ?? field}:</strong>{' '}
                {change.hidden ? <em>{t('history.hidden')}</em> : `${display(change.old)} → ${display(change.new)}`}
              </Text>
            ))}
          </Stack>
        </div>
      ))}
    </div>
  );
}
