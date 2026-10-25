import { Button, Group, PasswordInput, SimpleGrid, Stack, Switch, Text } from '@mantine/core';
import { useState } from 'react';
import type { Session } from '@forga/core-contracts';
import { send, SESSION_QUERY_KEY, useTranslation } from '@forga/web-sdk';
import { PageHeader, Panel, useAction } from '@forga/web-ui';
import { LanguageSwitch } from '../frame/LanguageSwitch';

/** The user's own settings: language, weekly e-mail and password. */
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

  return (
    <Stack gap="lg">
      <PageHeader title={t('profile.title')} subtitle={`${session.user.displayName} · ${session.user.username}`} />
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
      </SimpleGrid>
    </Stack>
  );
}
