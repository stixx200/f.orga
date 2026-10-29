import { Alert, Anchor, Box, Button, Center, Checkbox, Group, List, Loader, Paper, Select, Stack, Text, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import type { FirstLoginNotice, Session } from '@forga/core-contracts';
import { api, type ApiError, formatDate, SESSION_QUERY_KEY, send, useTranslation } from '@forga/web-sdk';
import { Panel } from '@forga/web-ui';
import { LanguageSwitch } from '../../frame/LanguageSwitch';
import { useNotice } from './api';

/** A text block: paragraphs separated by blank lines, lines starting with `- ` as list. */
export function TextBlock({ text }: { text: string }) {
  return (
    <Stack gap="xs">
      {text.split(/\n\s*\n/).map((paragraph, index) => {
        const rows = paragraph.split('\n').filter((row) => row.trim());
        if (rows.length && rows.every((row) => row.startsWith('- '))) {
          return (
            <List key={index} size="sm">
              {rows.map((row, i) => <List.Item key={i}>{row.slice(2)}</List.Item>)}
            </List>
          );
        }
        return (
          <Text key={index} size="sm">
            {rows.map((row, i) => (
              <Fragment key={i}>
                {i > 0 && <br />}
                {row.startsWith('- ') ? `• ${row.slice(2)}` : row}
              </Fragment>
            ))}
          </Text>
        );
      })}
    </Stack>
  );
}

/** `/privacy`: the privacy notice, readable without sign-in, with its versions and as PDF. */
export function NoticePage() {
  const { t, i18n } = useTranslation('shell');
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
            <Anchor size="sm" href={`/api/core/privacy/notice.pdf?language=${language}&version=${notice.version}`} target="_blank">{t('privacy.notice.pdf')}</Anchor>
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

/** At the first sign-in and after a new version: short notice, link to the full text, "Zur Kenntnis genommen". */
export function FirstLoginPage({ session }: { session: Session }) {
  const { t, i18n } = useTranslation('shell');
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);
  const { data } = useQuery({ queryKey: ['core', 'privacy', 'first-login'], queryFn: () => api<FirstLoginNotice>('core/privacy/notice/first-login') });
  const acknowledge = useMutation({
    mutationFn: () => send('POST', 'core/privacy/notice/acknowledge', { version: data!.version }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY }),
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
          {session.privacyNotice.acknowledgedVersion !== null && <Text size="sm" fw={700}>{t('privacy.firstLogin.newVersion')}</Text>}
          {data ? <TextBlock text={data.text[language]} /> : <Loader size="sm" />}
          <Anchor href="/privacy" target="_blank" size="sm">{t('privacy.firstLogin.notice')}</Anchor>
          <Checkbox label={t('privacy.firstLogin.acknowledge', { version: session.privacyNotice.version })} checked={checked} onChange={(e) => setChecked(e.currentTarget.checked)} />
          <Text size="xs" c="dimmed">{t('privacy.firstLogin.hint')}</Text>
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
