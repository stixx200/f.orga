import { Alert, Anchor, Button, Center, Checkbox, Divider, Group, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { LocalizedText } from '@forga/core-contracts';
import { ApiError, SESSION_QUERY_KEY, send, takeLoginNotice, translateCode, useLocalized, useTranslation } from '@forga/web-sdk';
import { ResponsiveDialog } from '@forga/web-ui';
import { BrigadeLogo } from '../frame/AppFrame';
import { LanguageSwitch } from '../frame/LanguageSwitch';

/** Error code from a failed sign-in with the OIDC provider (`/?oidcError=…`), read once. */
function oidcError(): string | null {
  const code = new URLSearchParams(window.location.search).get('oidcError');
  if (code) window.history.replaceState(null, '', window.location.pathname);
  return code && /^auth\.oidc\w+$/.test(code) ? code : null;
}

export function LoginPage({ brigadeName, oidc, rememberAllowed = false }: { brigadeName: string | null; oidc: { label: LocalizedText } | null; rememberAllowed?: boolean }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const [providerError] = useState(oidcError);
  // E.g. „Wiederhergestellt aus der Sicherung vom …“ after a restore.
  const [notice] = useState(takeLoginNotice);
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [forgotten, setForgotten] = useState(false);
  const login = useMutation({
    mutationFn: () => send('POST', 'core/login', { username, password, remember: rememberAllowed && remember }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
  });

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder p="xl" w={380}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            login.mutate();
          }}
        >
          <Stack>
            <Logo />
            {brigadeName && (
              <Text c="brand" fw={700} size="sm">
                {brigadeName}
              </Text>
            )}
            <Title order={2} c="brand">
              {t('login.title')}
            </Title>
            {notice && <Alert color="green">{localized(notice)}</Alert>}
            {login.error && <Alert color="brand">{(login.error as ApiError).translated()}</Alert>}
            {providerError && !login.error && <Alert color="brand">{translateCode(providerError)}</Alert>}
            <TextInput label={t('login.username')} value={username} onChange={(e) => setUsername(e.currentTarget.value)} required autoFocus autoComplete="username" />
            <PasswordInput label={t('login.password')} value={password} onChange={(e) => setPassword(e.currentTarget.value)} required autoComplete="current-password" />
            {rememberAllowed && (
              <Checkbox label={t('hardening.login.remember')} description={t('hardening.login.rememberHint')} checked={remember} onChange={(e) => setRemember(e.currentTarget.checked)} />
            )}
            <Button type="submit" loading={login.isPending}>
              {t('login.submit')}
            </Button>
            {oidc && (
              <>
                <Divider />
                <Button component="a" href="/api/core/oidc/start" variant="default">{localized(oidc.label)}</Button>
              </>
            )}
            <Group justify="space-between">
              <LanguageSwitch loggedIn={false} />
              <Anchor component="button" type="button" size="sm" onClick={() => setForgotten(true)}>{t('login.forgotten')}</Anchor>
            </Group>
            <Anchor href="/privacy" size="xs" c="dimmed">{t('privacy.notice.link')}</Anchor>
          </Stack>
        </form>
      </Paper>
      {forgotten && <ForgottenDialog onClose={() => setForgotten(false)} />}
    </Center>
  );
}

function Logo() {
  return <BrigadeLogo size={112} fallback="/logo-full.svg" />;
}

/** Requests a reset link; the answer never reveals whether the account exists. */
function ForgottenDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const [login, setLogin] = useState('');
  const request = useMutation({ mutationFn: () => send('POST', 'core/password-reset', { login }) });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('login.forgottenTitle')}
      actions={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>{common('actions.close')}</Button>
          {!request.isSuccess && <Button loading={request.isPending} disabled={!login.trim()} onClick={() => request.mutate()}>{t('login.sendLink')}</Button>}
        </Group>
      }
    >
      {request.isSuccess ? (
        <Text size="sm">{t('login.linkSent')}</Text>
      ) : (
        <Stack gap="sm">
          <Text size="sm">{t('login.forgottenText')}</Text>
          <TextInput label={t('login.usernameOrEmail')} value={login} onChange={(e) => setLogin(e.currentTarget.value)} autoFocus />
          {request.error && <Alert color="brand">{(request.error as ApiError).translated()}</Alert>}
        </Stack>
      )}
    </ResponsiveDialog>
  );
}
