import { Anchor, Button, Group, List, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { ImportProfileInfo } from '@forga/core-contracts';
import { Link } from 'react-router';
import { api, formatDate, send, useCan, useLocalized, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, DataTable, notifySuccess, Panel, StatusBadge, useAction } from '@forga/web-ui';
import { MESSAGES_KEEP_DAYS } from '@forga/mp-feuer-contracts';
import { keys, TRANSFER, useRemembered } from '../api';
import { ModulePage } from '../components/ModulePage';

/** "Einstellungen": the remembered selection per archive number and of the datasets; inbox and schedule later. */
export function SettingsPage() {
  const { t, i18n } = useTranslation('mp-feuer');
  const localized = useLocalized();
  const mayReset = useCan(TRANSFER);
  const { data: remembered } = useRemembered();
  const { data: profiles = [] } = useQuery({ queryKey: ['core', 'imports', 'profiles'], queryFn: () => api<ImportProfileInfo[]>('core/imports/profiles') });
  const [confirm, setConfirm] = useState(false);
  const reset = useAction(() => send<void>('DELETE', 'mp-feuer/remembered'), { invalidate: [keys.remembered], success: t('settings.resetDone'), onSuccess: () => setConfirm(false) });
  const [confirmRemove, setConfirmRemove] = useState(false);
  const removeMessages = useAction(() => send<{ runs: number }>('POST', 'mp-feuer/runs/remove-messages'), {
    invalidate: [keys.runs],
    onSuccess: ({ runs }) => {
      setConfirmRemove(false);
      notifySuccess(t('settings.messagesRemoved', { count: runs }));
    },
  });
  const archives = Object.entries(remembered?.archives ?? {}).map(([key, value]) => ({ key, ...value }));
  const datasets = Object.entries(remembered?.datasets ?? {});
  const profile = (id: string) => profiles.find((p) => p.id === id);
  return (
    <ModulePage tab="settings">
      <DataTable
        rows={archives}
        rowKey={(a) => a.key}
        empty={t('settings.noArchives')}
        exportable={false}
        columns={[
          { key: 'key', header: t('settings.number'), render: (a) => <span translate="no">{a.key}</span> },
          { key: 'label', header: t('settings.label') },
          { key: 'department', header: t('archives.department'), render: (a) => (a.skip ? <StatusBadge>{t('archives.skipped')}</StatusBadge> : (a.department ?? t('archives.asNamed', { name: a.label }))) },
          { key: 'unit', header: t('archives.unit'), render: (a) => (a.skip ? '–' : a.unit ? <span translate="no">{a.unit}</span> : t('archives.departmentReport')) },
          { key: 'at', header: t('settings.at'), render: (a) => formatDate(a.at, i18n.language) },
        ]}
      />
      <Panel title={t('settings.datasets')}>
        {datasets.length ? (
          <List size="sm" spacing={4}>
            {datasets.map(([id, value]) => (
              <List.Item key={id}>
                <Text size="sm">
                  <b>{profile(id) ? localized(profile(id)!.name) : id}</b>: {value.enabled ? t('settings.on') : t('settings.off')}
                  {Object.entries(value.options).map(([option, on]) => {
                    const label = profile(id)?.options.find((o) => o.key === option)?.label;
                    return ` · ${label ? localized(label) : option}: ${on ? t('settings.on') : t('settings.off')}`;
                  })}
                </Text>
              </List.Item>
            ))}
          </List>
        ) : (
          <Text size="sm" c="dimmed">{t('settings.noDatasets')}</Text>
        )}
        <Text size="xs" c="dimmed" mt="md">
          {t('settings.hint')} <Anchor component={Link} to="/mp-feuer/mappings">{t('tabs.mappings')}</Anchor>
        </Text>
        {mayReset && (
          <Group justify="flex-end" mt="md">
            <Button variant="default" onClick={() => setConfirm(true)}>{t('settings.reset')}</Button>
          </Group>
        )}
      </Panel>
      {mayReset && (
        <Panel title={t('settings.transitionDone')}>
          <Text size="sm">{t('settings.transitionDoneText', { days: MESSAGES_KEEP_DAYS })}</Text>
          <Group justify="flex-end" mt="md">
            <Button variant="default" color="red" onClick={() => setConfirmRemove(true)}>{t('settings.removeMessages')}</Button>
          </Group>
        </Panel>
      )}
      <Panel title={t('settings.inbox')} aside={<StatusBadge>{t('settings.later')}</StatusBadge>}>
        <Text size="sm">{t('settings.inboxText')}</Text>
      </Panel>
      <ConfirmDialog
        opened={confirm}
        onClose={() => setConfirm(false)}
        title={t('settings.resetTitle')}
        description={t('settings.resetText')}
        confirmLabel={t('settings.resetConfirm')}
        loading={reset.isPending}
        onConfirm={() => reset.mutate(undefined)}
      />
      <ConfirmDialog
        opened={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={t('settings.removeMessagesTitle')}
        description={t('settings.removeMessagesText')}
        confirmLabel={t('settings.removeMessagesConfirm')}
        loading={removeMessages.isPending}
        onConfirm={() => removeMessages.mutate(undefined)}
      />
    </ModulePage>
  );
}
