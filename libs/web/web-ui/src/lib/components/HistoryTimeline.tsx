import { Anchor, Button, Loader, Radio, Stack, Text, Textarea } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { FieldChange, HistoryEntry } from '@forga/core-contracts';
import { api, formatDate, formatDateTime, send, unlocked, useSession, useTranslation } from '@forga/web-sdk';
import { ResponsiveDialog } from './Dialogs';
import { useAction } from './useAction';
import classes from './components.module.css';

function display(value: unknown): string {
  if (value === null || value === undefined || value === '') return '–';
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Is there a value left to remove from the change? */
const redactable = (change: FieldChange) => !change.hidden && ((!change.redactedOld && display(change.old) !== '–') || (!change.redactedNew && display(change.new) !== '–'));

/** Managing data protection may remove wrong values from the history (rectification, L12). */
const PRIVACY = 'privacy.manage';

/**
 * History of a record (including its child records): who changed which field from what to what.
 * Masked fields (missing permission) show "hidden" instead of values; values removed as wrong show "berichtigt, Wert
 * entfernt am …". Who manages data protection (confirmed with the second factor) can remove a value.
 */
export function HistoryTimeline({ entity, id, fieldLabels = {} }: { entity: string; id: string; fieldLabels?: Record<string, string> }) {
  const { t, i18n } = useTranslation('common');
  const session = useSession().data;
  const canRedact = unlocked(session, PRIVACY);
  const [redacting, setRedacting] = useState<{ entryId: string; field: string; change: FieldChange } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ['core', 'history', entity, id],
    queryFn: () => api<(HistoryEntry & { userName: string | null; impersonatorName?: string | null })[]>(`core/history/${entity}/${id}`),
  });
  if (isLoading) return <Loader size="sm" />;
  if (!data?.length) return <Text c="dimmed">{t('history.empty')}</Text>;
  const value = (change: FieldChange, side: 'old' | 'new') => {
    const redacted = side === 'old' ? change.redactedOld : change.redactedNew;
    return redacted ? <em>{t('history.redacted', { date: formatDate(redacted, i18n.language) })}</em> : display(change[side]);
  };
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
                {change.hidden ? (
                  <em>{t('history.hidden')}</em>
                ) : (
                  <>
                    {value(change, 'old')} → {value(change, 'new')}
                  </>
                )}
                {canRedact && redactable(change) && (
                  <>
                    {' '}
                    <Anchor component="button" type="button" size="xs" onClick={() => setRedacting({ entryId: entry.id, field, change })}>
                      {t('history.redact')}
                    </Anchor>
                  </>
                )}
              </Text>
            ))}
          </Stack>
        </div>
      ))}
      {redacting && <RedactDialog {...redacting} label={fieldLabels[redacting.field] ?? redacting.field} queryKey={['core', 'history', entity, id]} onClose={() => setRedacting(null)} />}
    </div>
  );
}

/** "Wert in der Historie unkenntlich machen": which value and why (required); the server logs field and reason. */
function RedactDialog({ entryId, field, change, label, queryKey, onClose }: { entryId: string; field: string; change: FieldChange; label: string; queryKey: readonly unknown[]; onClose: () => void }) {
  const { t } = useTranslation('common');
  const sides = (['old', 'new'] as const).filter((side) => !(side === 'old' ? change.redactedOld : change.redactedNew) && display(change[side]) !== '–');
  const [side, setSide] = useState<'old' | 'new'>(sides[0] ?? 'new');
  const [reason, setReason] = useState('');
  const redact = useAction(() => send('POST', `privacy/history/${entryId}/redact`, { field, side, reason }), { success: t('history.redactDone'), invalidate: [queryKey], onSuccess: onClose });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('history.redactTitle')}
      actions={
        <>
          <Button variant="default" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button loading={redact.isPending} disabled={reason.trim().length < 10} onClick={() => redact.mutate(undefined)}>{t('history.redactSubmit')}</Button>
        </>
      }
    >
      <Text size="sm">{t('history.redactText')}</Text>
      <Text size="sm" fw={700}>{label}</Text>
      <Radio.Group label={t('history.redactSide')} value={side} onChange={(v) => setSide(v as 'old' | 'new')}>
        <Stack gap="xs" mt="xs">
          {sides.map((s) => <Radio key={s} value={s} label={t(s === 'old' ? 'history.redactOld' : 'history.redactNew', { value: display(change[s]) })} />)}
        </Stack>
      </Radio.Group>
      <Textarea label={t('history.redactReason')} description={t('history.redactReasonHint')} required autosize minRows={2} value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
    </ResponsiveDialog>
  );
}
