import { Alert, Button, Center, Paper, Stack, Text, Title } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { type ApiError, send, useTranslation } from '@forga/web-sdk';
import { BrigadeLogo } from '../frame/AppFrame';

/** Opened from the link sent to a new e-mail address: makes it the address of the account. */
export function ConfirmEmailPage() {
  const { t } = useTranslation('shell');
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '');
  const confirm = useMutation({ mutationFn: () => send('POST', 'core/email-confirmation', { token }) });

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder p="xl" w={400}>
        <Stack>
          <BrigadeLogo size={80} fallback="/logo-full.svg" />
          <Title order={2} c="brand">{t('confirmEmail.title')}</Title>
          {confirm.isSuccess ? (
            <>
              <Text>{t('confirmEmail.done')}</Text>
              <Button component="a" href="/">{t('confirmEmail.toApp')}</Button>
            </>
          ) : (
            <>
              {!token && <Alert color="brand">{t('reset.noToken')}</Alert>}
              {confirm.error && <Alert color="brand">{(confirm.error as ApiError).translated()}</Alert>}
              <Text>{t('confirmEmail.text')}</Text>
              {/* A button instead of confirming on load: link scanners of mail servers must not use up the link. */}
              <Button loading={confirm.isPending} disabled={!token} onClick={() => confirm.mutate()}>{t('confirmEmail.submit')}</Button>
            </>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
