import { Alert, Anchor, Box, Button, Center, Checkbox, Group, Loader, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { Session } from '@forga/core-contracts';
import type { FirstLoginNotice, SessionPrivacyNotice } from '@forga/privacy-contracts';
import { api, type ApiError, formatDate, SESSION_QUERY_KEY, send, useTranslation } from '@forga/web-sdk';
import { LanguageSwitch, Panel } from '@forga/web-ui';
import { NOTICE_STATE_KEY, useNotice } from '../api';
import { TextBlock } from './TextBlock';
import { FirstLoginConsents, giveFirstLoginConsents, useMyConsents } from '../consents/MyConsents';

/** `/privacy-notice` (kiosk page of the module): the privacy notice, readable without sign-in, with its versions and as PDF. */
export function NoticePage() {
  const { t, i18n } = useTranslation('privacy');
  const [version, setVersion] = useState<number | undefined>(() => Number(new URLSearchParams(window.location.search).get('version')) || undefined);
  const { data: notice, error } = useNotice(version);
  const language = i18n.language === 'en' ? 'en' : 'de';
  return (
    <Box maw={860} mx="auto" p="md">
      <Group justify="space-between" mb="md">
        <Anchor href="/" size="sm">{t('privacy.notice.back')}</Anchor>
        <LanguageSwitch loggedIn={false} />
      </Group>
      {error && <Alert color="brand">{(error as ApiError).translated()}</Alert>}
      {!notice && !error && <Loader />}
      {notice && (
        <Stack gap="md">
          {notice.brigadeName && <Text c="brand" fw={700} size="sm">{notice.brigadeName}</Text>}
          <Title order={1} c="brand">{t('privacy.notice.title')}</Title>
          <Group gap="md">
            <Text size="sm" c="dimmed">{t('privacy.notice.version', { version: notice.version, date: formatDate(notice.publishedAt, i18n.language) })}</Text>
            <Anchor size="sm" href={`/api/privacy/notice.pdf?language=${language}&version=${notice.version}`} target="_blank">{t('privacy.notice.pdf')}</Anchor>
            {notice.versions.length > 1 && (
              <Select
                size="xs"
                aria-label={t('privacy.notice.older')}
                allowDeselect={false}
                data={notice.versions.map((v, index) => ({
                  value: String(v.version),
                  label: `${t('privacy.notice.older')} ${v.version} · ${formatDate(v.publishedAt, i18n.language)}${index === 0 ? ` (${t('privacy.notice.current')})` : ''}`,
                }))}
                value={String(notice.version)}
                onChange={(v) => v && setVersion(Number(v))}
              />
            )}
          </Group>
          {notice.template && <Alert color="yellow">{t('privacy.notice.template')}</Alert>}
          {notice.sections.map((section) => (
            <Panel key={section.key} title={section.title[language]}>
              <TextBlock text={section.text[language]} />
            </Panel>
          ))}
        </Stack>
      )}
    </Box>
  );
}

/**
 * At the first sign-in and after a new version: short notice, link to the full text, "Zur Kenntnis genommen", then the
 * offered consents (voluntary, one by one; L9).
 */
export function FirstLoginPage({ session, notice }: { session: Session; notice: SessionPrivacyNotice }) {
  const { t, i18n } = useTranslation('privacy');
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);
  const [consents, setConsents] = useState<string[]>([]);
  const { data } = useQuery({ queryKey: ['privacy', 'first-login'], queryFn: () => api<FirstLoginNotice>('privacy/notice/first-login') });
  const offered = useMyConsents(Boolean(session.user.personId));
  const acknowledge = useMutation({
    mutationFn: async () => {
      await send('POST', 'privacy/notice/acknowledge', { version: data!.version });
      await giveFirstLoginConsents(offered.data, consents);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: NOTICE_STATE_KEY }),
  });
  const logout = useMutation({ mutationFn: () => send('POST', 'core/logout'), onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }) });
  const language = i18n.language === 'en' ? 'en' : 'de';
  return (
    <Center mih="100vh" p="md">
      <Paper withBorder p="xl" maw={600} w="100%">
        <Stack>
          <Group justify="flex-end">
            <LanguageSwitch loggedIn receiveDigest={session.user.receiveDigest} />
          </Group>
          <Title order={1} c="brand" size="h2">{t('privacy.firstLogin.title')}</Title>
          {notice.acknowledgedVersion !== null && <Text size="sm" fw={700}>{t('privacy.firstLogin.newVersion')}</Text>}
          {data ? <TextBlock text={data.text[language]} /> : <Loader size="sm" />}
          <Anchor href="/privacy-notice" target="_blank" size="sm">{t('privacy.firstLogin.notice')}</Anchor>
          <Checkbox label={t('privacy.firstLogin.acknowledge', { version: notice.version })} checked={checked} onChange={(e) => setChecked(e.currentTarget.checked)} />
          <Text size="xs" c="dimmed">{t('privacy.firstLogin.hint')}</Text>
          {session.user.personId && <FirstLoginConsents selected={consents} onChange={setConsents} />}
          {acknowledge.error && <Alert color="brand">{(acknowledge.error as ApiError).translated()}</Alert>}
          <Group justify="space-between">
            <Button variant="subtle" loading={logout.isPending} onClick={() => logout.mutate()}>{t('privacy.firstLogin.logout')}</Button>
            <Button size="md" disabled={!checked || !data} loading={acknowledge.isPending} onClick={() => acknowledge.mutate()}>{t('privacy.firstLogin.continue')}</Button>
          </Group>
        </Stack>
      </Paper>
    </Center>
  );
}
