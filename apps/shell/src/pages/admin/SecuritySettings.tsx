import { Button, Group, Stack, Switch, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { SecuritySettings as Settings, SecurityStatus } from '@forga/core-contracts';
import { api, send, useTranslation } from '@forga/web-sdk';
import { Notice, Panel, StatusBadge, useAction } from '@forga/web-ui';

const SETTINGS_KEY = ['core', 'settings', 'security'] as const;
const DEFAULTS: Settings = { mailHealthWithoutNames: true, mailAllWithoutNames: false };

/**
 * "Settings → Security" (data protection concept, tab "Sicherheit"): the state of HTTPS and of the installation, and
 * whether e-mails name persons.
 */
export function SecuritySettings() {
  const { t } = useTranslation('shell');
  const status = useQuery({ queryKey: ['core', 'security', 'status'], queryFn: () => api<SecurityStatus>('core/security/status') });
  const stored = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => api<Settings | null>('core/settings/security') });
  const s = status.data;
  // The browser knows best how the page was opened (also without a trusted proxy).
  const https = window.location.protocol === 'https:' || Boolean(s?.https);
  return (
    <Stack gap="lg" maw={880}>
      <Panel title={t('settings.security.state')}>
        <Stack gap="sm">
          {s && !https && <Notice kind="warning">{t('settings.security.httpWarning')}</Notice>}
          {s && (
            <Table variant="vertical" withTableBorder={false}>
              <Table.Tbody>
                <Table.Tr>
                  <Table.Th w={220}>{t('settings.security.https')}</Table.Th>
                  <Table.Td>{https ? <StatusBadge tone="done">{t('settings.security.httpsYes')}</StatusBadge> : <StatusBadge tone="warning">{t('settings.security.httpsNo')}</StatusBadge>}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th>{t('settings.security.secureCookies')}</Table.Th>
                  <Table.Td>{s.secureCookies ? t('settings.security.yes') : t('settings.security.no')}</Table.Td>
                </Table.Tr>
                <Table.Tr>
                  <Table.Th>{t('settings.security.stage')}</Table.Th>
                  <Table.Td>{t(`settings.security.stages.${s.stage}`)}</Table.Td>
                </Table.Tr>
              </Table.Tbody>
            </Table>
          )}
          <Text size="xs" c="dimmed">{t('settings.security.httpsHint')}</Text>
        </Stack>
      </Panel>
      {!stored.isLoading && <MailSettings initial={{ ...DEFAULTS, ...stored.data }} />}
    </Stack>
  );
}

function MailSettings({ initial }: { initial: Settings }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const [value, setValue] = useState(initial);
  const save = useAction((input: Settings) => send('PUT', 'core/settings/security', input), { success: t('settings.saved'), invalidate: [SETTINGS_KEY] });
  return (
    <Panel title={t('settings.security.mails')}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(value);
        }}
      >
        <Stack gap="md">
          <Switch
            label={t('settings.security.mailHealthWithoutNames')}
            description={t('settings.security.mailHealthWithoutNamesHint')}
            checked={value.mailHealthWithoutNames}
            onChange={(e) => setValue({ ...value, mailHealthWithoutNames: e.currentTarget.checked })}
          />
          <Switch
            label={t('settings.security.mailAllWithoutNames')}
            description={t('settings.security.mailAllWithoutNamesHint')}
            checked={value.mailAllWithoutNames}
            onChange={(e) => setValue({ ...value, mailAllWithoutNames: e.currentTarget.checked })}
          />
          <Group justify="flex-end">
            <Button type="submit" loading={save.isPending}>{common('actions.save')}</Button>
          </Group>
        </Stack>
      </form>
    </Panel>
  );
}
