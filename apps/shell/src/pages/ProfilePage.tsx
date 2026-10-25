import { Button, Group, PasswordInput, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { LocalizedText, Session } from '@forga/core-contracts';
import { api, send, SESSION_QUERY_KEY, useTranslation } from '@forga/web-sdk';
import { Notice, PageHeader, Panel, useAction } from '@forga/web-ui';
import { LanguageSwitch } from '../frame/LanguageSwitch';

/** Set after linking the municipal account (`/profile?oidcLinked=1`), read once. */
function linkedNow(): boolean {
  const linked = new URLSearchParams(window.location.search).get('oidcLinked') === '1';
  if (linked) window.history.replaceState(null, '', window.location.pathname);
  return linked;
}

/** The user's own settings: language, e-mail address, weekly e-mail, password and the link to the municipal account. */
export function ProfilePage({ session }: { session: Session }) {
  const { t, i18n } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const [passwords, setPasswords] = useState({ current: '', next: '', repeat: '' });
  const digest = useAction(
    (receiveDigest: boolean) => send('PUT', 'core/profile', { language: i18n.language, receiveDigest }),
    { invalidate: [SESSION_QUERY_KEY], success: t('profile.saved') },
  );
  const password = useAction(() => send('PUT', 'core/password', { current: passwords.current, new: passwords.next }), {
    success: t('profile.passwordChanged'),
    onSuccess: () => setPasswords({ current: '', next: '', repeat: '' }),
  });
  const mismatch = passwords.repeat !== '' && passwords.next !== passwords.repeat;
  const [email, setEmail] = useState(session.user.email ?? '');
  const [linked] = useState(linkedNow);
  const saveEmail = useAction(
    () => send('PUT', 'core/profile', { language: i18n.language, receiveDigest: session.user.receiveDigest, email: email.trim() || null }),
    { invalidate: [SESSION_QUERY_KEY], success: t('profile.emailSaved') },
  );
  const { data: setup } = useQuery({ queryKey: ['core', 'setup'], queryFn: () => api<{ oidc: { label: LocalizedText } | null }>('core/setup') });
  const linkOidc = useAction(() => send<{ url: string }>('POST', 'core/oidc/link'), { onSuccess: ({ url }) => window.location.assign(url) });

  return (
    <Stack gap="lg">
      <PageHeader title={t('profile.title')} subtitle={`${session.user.displayName} · ${session.user.username}`} />
      {linked && <Notice kind="done">{t('profile.oidcLinked')}</Notice>}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
        <Panel title={t('profile.preferences')}>
          <Stack gap="md">
            <div>
              <Text fw={700} size="sm" mb={4}>{common('language.label')}</Text>
              <LanguageSwitch loggedIn receiveDigest={session.user.receiveDigest} />
              <Text size="xs" c="dimmed" mt={4}>{t('profile.languageHint')}</Text>
            </div>
            <Switch
              label={t('profile.digest')}
              description={session.user.email ? t('profile.digestHint', { email: session.user.email }) : t('profile.digestNoEmail')}
              checked={session.user.receiveDigest}
              disabled={digest.isPending}
              onChange={(e) => digest.mutate(e.currentTarget.checked)}
            />
          </Stack>
        </Panel>
        <Panel title={t('profile.password')}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!mismatch) password.mutate(undefined);
            }}
          >
            <Stack gap="sm">
              <PasswordInput label={t('profile.currentPassword')} value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.currentTarget.value })} required autoComplete="current-password" />
              <PasswordInput label={t('profile.newPassword')} description={t('users.passwordHint')} value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.currentTarget.value })} required minLength={10} autoComplete="new-password" />
              <PasswordInput
                label={t('profile.repeatPassword')}
                value={passwords.repeat}
                onChange={(e) => setPasswords({ ...passwords, repeat: e.currentTarget.value })}
                error={mismatch ? t('profile.mismatch') : undefined}
                required
                autoComplete="new-password"
              />
              <Group justify="flex-end">
                <Button type="submit" loading={password.isPending}>{t('profile.changePassword')}</Button>
              </Group>
            </Stack>
          </form>
        </Panel>
        <Panel title={t('profile.email')}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveEmail.mutate(undefined);
            }}
          >
            <Stack gap="sm">
              <TextInput label={t('profile.email')} description={t('profile.emailHint')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
              <Group justify="flex-end">
                <Button type="submit" loading={saveEmail.isPending} disabled={email.trim() === (session.user.email ?? '') || Boolean(session.impersonator)}>{common('actions.save')}</Button>
              </Group>
            </Stack>
          </form>
        </Panel>
        {setup?.oidc && (
          <Panel title={t('profile.oidc')}>
            <Stack gap="sm">
              <Text size="sm">{t('profile.oidcText')}</Text>
              <Group justify="flex-end">
                <Button variant="default" loading={linkOidc.isPending} disabled={Boolean(session.impersonator)} onClick={() => linkOidc.mutate(undefined)}>{t('profile.oidcLink')}</Button>
              </Group>
            </Stack>
          </Panel>
        )}
      </SimpleGrid>
    </Stack>
  );
}
