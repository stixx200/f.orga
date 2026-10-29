import { Button, Group, Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { MySession, Session } from '@forga/core-contracts';
import { api, formatDateTime, send, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, Panel, StatusBadge, useAction } from '@forga/web-ui';

export const DEVICES_KEY = ['core', 'me', 'sessions'] as const;

/**
 * „Angemeldete Geräte“ (L16): the user's sessions with browser, shortened address and last activity; other devices can
 * be signed out one by one or all at once. Not during an impersonation.
 */
export function DevicesPanel({ session }: { session: Session }) {
  const { t, i18n } = useTranslation('shell');
  const [confirming, setConfirming] = useState(false);
  const { data = [] } = useQuery({ queryKey: DEVICES_KEY, queryFn: () => api<MySession[]>('core/me/sessions'), enabled: !session.impersonator });
  const end = useAction((id: string) => send('DELETE', `core/me/sessions/${id}`), { success: t('hardening.devices.ended'), invalidate: [DEVICES_KEY] });
  const endOthers = useAction(() => send<{ ended: number }>('POST', 'core/me/sessions/end-others'), {
    invalidate: [DEVICES_KEY],
    success: t('hardening.devices.othersEnded'),
    onSuccess: () => setConfirming(false),
  });
  if (session.impersonator) return null;
  const others = data.filter((s) => !s.current);
  const { persistent, idleMinutes } = session.current;
  return (
    <Panel title={t('hardening.devices.title')}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{persistent || idleMinutes === null ? t('hardening.devices.persistentHint') : t('hardening.devices.idleHint', { minutes: idleMinutes })}</Text>
        <DataTable
          rows={data}
          rowKey={(s) => s.id}
          exportable={false}
          empty={t('hardening.devices.none')}
          columns={[
            {
              key: 'browser',
              header: t('hardening.devices.browser'),
              render: (s) => (
                <Group gap={6}>
                  <Text size="sm">{s.browser ?? t('hardening.devices.unknown')}</Text>
                  {s.current && <StatusBadge tone="done">{t('hardening.devices.current')}</StatusBadge>}
                  {s.persistent && <StatusBadge tone="neutral">{t('hardening.devices.persistent')}</StatusBadge>}
                </Group>
              ),
            },
            { key: 'address', header: t('hardening.devices.address'), render: (s) => s.address ?? '–' },
            { key: 'created', header: t('hardening.devices.since'), render: (s) => formatDateTime(s.createdAt, i18n.language) },
            { key: 'activity', header: t('hardening.devices.lastActivity'), render: (s) => formatDateTime(s.lastActivityAt, i18n.language) },
            {
              key: 'actions',
              header: '',
              align: 'right',
              render: (s) => (s.current ? null : <Button size="xs" variant="default" loading={end.isPending && end.variables === s.id} onClick={() => end.mutate(s.id)}>{t('hardening.devices.end')}</Button>),
            },
          ]}
        />
        {others.length > 0 && (
          <Group justify="flex-end">
            <Button variant="default" color="red" onClick={() => setConfirming(true)}>{t('hardening.devices.endOthers')}</Button>
          </Group>
        )}
      </Stack>
      <ConfirmDialog
        opened={confirming}
        onClose={() => setConfirming(false)}
        title={t('hardening.devices.endOthersTitle')}
        description={t('hardening.devices.endOthersText', { count: others.length })}
        confirmLabel={t('hardening.devices.endOthersConfirm')}
        loading={endOthers.isPending}
        onConfirm={() => endOthers.mutate(undefined)}
      />
    </Panel>
  );
}
