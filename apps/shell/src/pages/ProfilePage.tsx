import { Button, Checkbox, Group, PasswordInput, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Deadline, LocalizedText, Session } from '@forga/core-contracts';
import { api, send, SESSION_QUERY_KEY, useLocalized, useTranslation } from '@forga/web-sdk';
import { Notice, notifySuccess, PageHeader, Panel, useAction } from '@forga/web-ui';
import { MfaPanel } from '../auth/StepUp';
import { LanguageSwitch } from '../frame/LanguageSwitch';
import type { LoadedModule } from '../modules';

/**
 * Which tasks show in the bell and on the start page: whole modules or single kinds, chosen from the current tasks
 * (including hidden ones). Stored in the profile on the server, so it applies on every device.
 */
function HiddenTasksPanel({ session, modules }: { session: Session; modules: LoadedModule[] }) {
  const { t, i18n } = useTranslation('shell');
  const localized = useLocalized();
  const { data: tasks = [] } = useQuery({ queryKey: ['core', 'tasks', 'all'], queryFn: () => api<Deadline[]>('core/tasks?all=true'), staleTime: 60_000 });
  const hidden = new Set(session.user.hiddenTasks);
  const save = useAction(
    (next: string[]) => send('PUT', 'core/profile', { language: i18n.language, receiveDigest: session.user.receiveDigest, hiddenTasks: next }),
    { invalidate: [SESSION_QUERY_KEY, ['core', 'tasks']], success: t('profile.tasksSaved') },
  );
  const toggle = (key: string, hide: boolean) => save.mutate(hide ? [...hidden, key] : [...hidden].filter((k) => k !== key));
  const moduleName = (id: string) => {
    const module = modules.find((m) => m.info.id === id);
    return module ? localized(module.info.name) : id === 'core' ? t('nav.administration') : id;
  };
  const kinds = new Map<string, Map<string, LocalizedText>>();
  for (const task of tasks) {
    const byKind = kinds.get(task.module) ?? new Map<string, LocalizedText>();
    if (!byKind.has(task.kind)) byKind.set(task.kind, task.title);
    kinds.set(task.module, byKind);
  }
  // Hidden entries without current tasks stay visible here, so they can be shown again.
  const others = [...hidden].filter((key) => {
    const [module, kind] = key.split(':');
    return kind ? !kinds.get(module)?.has(kind) : !kinds.has(module);
  });

  return (
    <Panel title={t('profile.tasks')}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{t('profile.tasksHint')}</Text>
        {!tasks.length && !others.length && <Text size="sm">{t('profile.tasksNone')}</Text>}
        {[...kinds].map(([module, byKind]) => (
          <Stack key={module} gap={4}>
            <Checkbox
              label={<Text fw={700} size="sm">{`${moduleName(module)}: ${t('profile.tasksModule')}`}</Text>}
              checked={!hidden.has(module)}
              disabled={save.isPending}
              onChange={(e) => toggle(module, !e.currentTarget.checked)}
            />
            {[...byKind].map(([kind, title]) => (
              <Checkbox
                key={kind}
                ml="lg"
                label={localized(title)}
                checked={!hidden.has(module) && !hidden.has(`${module}:${kind}`)}
                disabled={save.isPending || hidden.has(module)}
                onChange={(e) => toggle(`${module}:${kind}`, !e.currentTarget.checked)}
              />
            ))}
          </Stack>
        ))}
        {others.length > 0 && (
          <Stack gap={4}>
            <Text fw={700} size="sm">{t('profile.tasksOther')}</Text>
            {others.map((key) => (
              <Checkbox key={key} label={moduleName(key.split(':')[0])} checked={false} disabled={save.isPending} onChange={() => toggle(key, false)} />
            ))}
          </Stack>
        )}
      </Stack>
    </Panel>
  );
}

/** Set after linking the municipal account (`/profile?oidcLinked=1`), read once. */
function linkedNow(): boolean {
  const linked = new URLSearchParams(window.location.search).get('oidcLinked') === '1';
  if (linked) window.history.replaceState(null, '', window.location.pathname);
  return linked;
}

/** The user's own settings: language, e-mail address, weekly e-mail, password and the link to the municipal account. */
export function ProfilePage({ session, modules }: { session: Session; modules: LoadedModule[] }) {
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
  const [emailPassword, setEmailPassword] = useState('');
  const [linked] = useState(linkedNow);
  const saveEmail = useAction(
    () =>
      send<{ confirmationSent: boolean }>('PUT', 'core/profile', {
        language: i18n.language,
        receiveDigest: session.user.receiveDigest,
        email: email.trim() || null,
        currentPassword: emailPassword,
      }),
    {
      invalidate: [SESSION_QUERY_KEY],
      onSuccess: ({ confirmationSent }) => {
        notifySuccess(t(confirmationSent ? 'profile.emailConfirmationSent' : 'profile.emailSaved'));
        setEmailPassword('');
        // The stored address stays until the new one is confirmed.
        if (confirmationSent) setEmail(session.user.email ?? '');
      },
    },
  );
  const emailChanged = email.trim() !== (session.user.email ?? '');
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
              {session.user.pendingEmail && <Notice kind="info">{t('profile.emailPending', { email: session.user.pendingEmail })}</Notice>}
              <TextInput label={t('profile.email')} description={t('profile.emailHint')} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
              {emailChanged && (
                <PasswordInput label={t('profile.emailPassword')} value={emailPassword} onChange={(e) => setEmailPassword(e.currentTarget.value)} required autoComplete="current-password" />
              )}
              <Group justify="flex-end">
                <Button type="submit" loading={saveEmail.isPending} disabled={!emailChanged || !emailPassword || Boolean(session.impersonator)}>{common('actions.save')}</Button>
              </Group>
            </Stack>
          </form>
        </Panel>
        <MfaPanel session={session} />
        <HiddenTasksPanel session={session} modules={modules} />
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
