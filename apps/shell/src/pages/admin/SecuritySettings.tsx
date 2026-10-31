import { Button, Group, NumberInput, Stack, Switch, Table, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { SecuritySettings as Settings, SecurityStatus } from '@forga/core-contracts';
import { api, send, SESSION_QUERY_KEY, useTranslation } from '@forga/web-sdk';
import { Notice, Panel, StatusBadge, useAction } from '@forga/web-ui';

const SETTINGS_KEY = ['core', 'settings', 'security'] as const;
const DEFAULTS: Settings = { mfaEnabled: true, mailHealthWithoutNames: true, mailAllWithoutNames: false, notifyImpersonation: true, idleMinutesPrivileged: 60, idleMinutesOther: 480, allowRemember: true };

/**
 * "Settings → Security" (data protection concept, tab "Sicherheit"): the state of HTTPS and of the installation, and
 * whether e-mails name persons.
 */
export function SecuritySettings() {
  const status = useQuery({ queryKey: ['core', 'security', 'status'], queryFn: () => api<SecurityStatus>('core/security/status') });
  const stored = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => api<Settings | null>('core/settings/security') });
  const s = status.data;
  // The browser knows best how the page was opened (also without a trusted proxy).
  const https = window.location.protocol === 'https:' || Boolean(s?.https);
  return (
    <Stack gap="lg" maw={880}>
      {!stored.isLoading && <SettingsForm initial={{ ...DEFAULTS, ...stored.data }} status={s} https={https} />}
    </Stack>
  );
}

/** Sessions and e-mails: one settings section, saved as a whole from either panel. */
function SettingsForm({ initial, status, https }: { initial: Settings; status: SecurityStatus | undefined; https: boolean }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const [value, setValue] = useState(initial);
  const save = useAction((input: Settings) => send('PUT', 'core/settings/security', input), { success: t('settings.saved'), invalidate: [SETTINGS_KEY, SESSION_QUERY_KEY] });
  return (
    <>
    <Panel title={t('settings.stepUp')}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(value);
        }}
      >
        <Stack gap="md">
          <Text size="sm">{t('settings.stepUpText')}</Text>
          <Switch
            label={t('settings.security.mfaEnabled')}
            description={t('settings.security.mfaEnabledHint')}
            checked={value.mfaEnabled}
            onChange={(e) => setValue({ ...value, mfaEnabled: e.currentTarget.checked })}
          />
          {!value.mfaEnabled && <Notice kind="warning">{t('settings.security.mfaOff')}</Notice>}
          <Group justify="flex-end">
            <Button type="submit" loading={save.isPending}>{common('actions.save')}</Button>
          </Group>
        </Stack>
      </form>
    </Panel>
    <Panel title={t('settings.security.state')}>
      <Stack gap="sm">
        {status && !https && <Notice kind="warning">{t('settings.security.httpWarning')}</Notice>}
        {status && (
          <Table variant="vertical" withTableBorder={false}>
            <Table.Tbody>
              <Table.Tr>
                <Table.Th w={220}>{t('settings.security.https')}</Table.Th>
                <Table.Td>{https ? <StatusBadge tone="done">{t('settings.security.httpsYes')}</StatusBadge> : <StatusBadge tone="warning">{t('settings.security.httpsNo')}</StatusBadge>}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>{t('settings.security.secureCookies')}</Table.Th>
                <Table.Td>{status.secureCookies ? t('settings.security.yes') : t('settings.security.no')}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Th>{t('settings.security.stage')}</Table.Th>
                <Table.Td>{t(`settings.security.stages.${status.stage}`)}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        )}
        <Text size="xs" c="dimmed">{t('settings.security.httpsHint')}</Text>
      </Stack>
    </Panel>
    <Panel title={t('hardening.sessions.title')}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate(value);
        }}
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">{t('hardening.sessions.hint')}</Text>
          <Group align="flex-start" grow>
            <NumberInput
              label={t('hardening.sessions.idlePrivileged')}
              description={t('hardening.sessions.idlePrivilegedHint')}
              value={value.idleMinutesPrivileged}
              onChange={(v) => setValue({ ...value, idleMinutesPrivileged: Number(v) || 60 })}
              min={5}
              max={1440}
              suffix=" min"
            />
            <NumberInput
              label={t('hardening.sessions.idleOther')}
              description={t('hardening.sessions.idleOtherHint')}
              value={value.idleMinutesOther}
              onChange={(v) => setValue({ ...value, idleMinutesOther: Number(v) || 480 })}
              min={5}
              max={10080}
              suffix=" min"
            />
          </Group>
          <Switch
            label={t('hardening.sessions.allowRemember')}
            description={t('hardening.sessions.allowRememberHint')}
            checked={value.allowRemember}
            onChange={(e) => setValue({ ...value, allowRemember: e.currentTarget.checked })}
          />
          <Group justify="flex-end">
            <Button type="submit" loading={save.isPending}>{common('actions.save')}</Button>
          </Group>
        </Stack>
      </form>
    </Panel>
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
          <Switch
            label={t('transparency.security.notifyImpersonation')}
            description={t('transparency.security.notifyImpersonationHint')}
            checked={value.notifyImpersonation}
            onChange={(e) => setValue({ ...value, notifyImpersonation: e.currentTarget.checked })}
          />
          <Group justify="flex-end">
            <Button type="submit" loading={save.isPending}>{common('actions.save')}</Button>
          </Group>
        </Stack>
      </form>
    </Panel>
    </>
  );
}
