import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { type ApiError, send, useTranslation } from '@forga/web-sdk';
import { BrigadeLogo } from '../frame/AppFrame';

/** Opened from the link in the e-mail: sets a new password with the one-time token. */
export function ResetPasswordPage() {
  const { t } = useTranslation('shell');
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') ?? '');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const confirm = useMutation({ mutationFn: () => send('POST', 'core/password-reset/confirm', { token, password }) });
  const mismatch = repeat !== '' && repeat !== password;

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder p="xl" w={400}>
        <Stack>
          <BrigadeLogo size={80} fallback="/logo-full.svg" />
          <Title order={2} c="brand">{t('reset.title')}</Title>
          {confirm.isSuccess ? (
            <>
              <Text>{t('reset.done')}</Text>
              <Button component="a" href="/">{t('reset.toLogin')}</Button>
            </>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!mismatch) confirm.mutate();
              }}
            >
              <Stack>
                {!token && <Alert color="brand">{t('reset.noToken')}</Alert>}
                {confirm.error && <Alert color="brand">{(confirm.error as ApiError).translated()}</Alert>}
                <PasswordInput label={t('reset.password')} description={t('users.passwordHint')} value={password} onChange={(e) => setPassword(e.currentTarget.value)} required minLength={10} autoComplete="new-password" />
                <PasswordInput label={t('reset.repeat')} value={repeat} onChange={(e) => setRepeat(e.currentTarget.value)} error={mismatch ? t('profile.mismatch') : undefined} required autoComplete="new-password" />
                <Button type="submit" loading={confirm.isPending} disabled={!token}>{t('reset.submit')}</Button>
              </Stack>
            </form>
          )}
        </Stack>
      </Paper>
    </Center>
  );
}
