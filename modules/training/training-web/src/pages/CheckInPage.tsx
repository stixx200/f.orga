import { Button, Stack, Text } from '@mantine/core';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { send, useTranslation } from '@forga/web-sdk';
import { EmptyState, Notice, PageHeader, Panel, useAction } from '@forga/web-ui';

/** Target of the QR code at the training ground: the logged-in member confirms their presence. */
export function CheckInPage() {
  const { t } = useTranslation('training');
  const [params] = useSearchParams();
  const code = params.get('code') ?? '';
  const [done, setDone] = useState<string | null>(null);
  const checkIn = useAction(() => send<{ sessionId: string; title: string }>('POST', 'training/check-in', { code }), { onSuccess: (r) => setDone(r.title) });
  if (!code) return <EmptyState title={t('checkIn.noCode')} />;
  return (
    <Stack gap="lg" maw={520}>
      <PageHeader title={t('checkIn.title')} />
      {done ? (
        <Notice kind="done">{t('checkIn.done', { title: done })}</Notice>
      ) : (
        <Panel>
          <Stack gap="md">
            <Text>{t('checkIn.text')}</Text>
            <Button size="lg" loading={checkIn.isPending} onClick={() => checkIn.mutate(undefined)}>{t('checkIn.confirm')}</Button>
          </Stack>
        </Panel>
      )}
    </Stack>
  );
}
