import { ActionIcon, Button, FileButton, Group, Stack, Text } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import { useState } from 'react';
import type { BackupEntry } from '@forga/backup-contracts';
import { formatDateTime, translateCode, useTranslation } from '@forga/web-sdk';
import { DataTable, PageHeader, useAction } from '@forga/web-ui';
import { ALL, formatBytes, uploadBackup, useBackups, useOverview } from '../api';
import { BackupNowDialog, BackupTabs, breadcrumbs, DetailsDialog, EntryStatus, RestoreLink, TriggerText, VerificationText, VerifyDialog } from '../components';

const usable = (entry: BackupEntry) => entry.status === 'ok' && Boolean(entry.fileName);

/** „Sicherungen“: backups in the target folder with verify, restore, download and delete; upload. */
export function BackupsPage() {
  const { t, i18n } = useTranslation('backup');
  const { data: backups = [] } = useBackups();
  const { data: overview } = useOverview();
  const [now, setNow] = useState(false);
  const [verify, setVerify] = useState<BackupEntry | null>(null);
  const [details, setDetails] = useState<BackupEntry | null>(null);
  const upload = useAction((file: File) => uploadBackup(file), { success: t('backups.uploaded'), invalidate: ALL });
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={breadcrumbs(t, t('backups.title'))}
        title={t('overview.title')}
        actions={
          <>
            <FileButton onChange={(file) => file && upload.mutate(file)} accept=".forgabackup">
              {(props) => <Button {...props} variant="default" loading={upload.isPending} disabled={!overview?.configured}>{t('actions.upload')}</Button>}
            </FileButton>
            <Button onClick={() => setNow(true)} disabled={!overview?.configured || overview.running}>{t('actions.now')}</Button>
          </>
        }
      />
      <BackupTabs />
      <DataTable
        exportable={false}
        rows={backups}
        rowKey={(entry) => entry.id}
        empty={t('backups.empty')}
        highlight={(entry) => entry.status === 'failed' || entry.status === 'missing'}
        columns={[
          { key: 'time', header: t('backups.time'), render: (entry) => <Text fw={700} size="sm">{formatDateTime(entry.startedAt, i18n.language)}</Text> },
          { key: 'trigger', header: t('backups.trigger'), render: (entry) => <TriggerText entry={entry} /> },
          { key: 'size', header: t('backups.size'), align: 'right', render: (entry) => formatBytes(entry.size, i18n.language) },
          { key: 'status', header: t('backups.status'), render: (entry) => <EntryStatus entry={entry} /> },
          {
            key: 'check',
            header: t('backups.check'),
            render: (entry) => (entry.status === 'failed' && entry.errorCode ? <Text size="sm">{translateCode(entry.errorCode)}</Text> : <VerificationText verification={entry.verification} />),
          },
          {
            key: 'actions',
            header: '',
            align: 'right',
            render: (entry) => (
              <Group gap={4} wrap="nowrap" justify="flex-end">
                {usable(entry) && (
                  <>
                    <Button variant="subtle" size="compact-sm" onClick={() => setVerify(entry)}>{t('backups.verify')}</Button>
                    <RestoreLink entry={entry} />
                  </>
                )}
                <ActionIcon variant="subtle" color="gray" aria-label={t('backups.more')} onClick={() => setDetails(entry)}>
                  <IconDots size={18} />
                </ActionIcon>
              </Group>
            ),
          },
        ]}
      />
      {overview?.target && (
        <Text size="sm" c="dimmed">{t('backups.folder', { path: overview.target.path })}</Text>
      )}
      {now && overview && <BackupNowDialog overview={overview} onClose={() => setNow(false)} />}
      {verify && <VerifyDialog entry={verify} storedId={overview?.settings.passphraseId ?? null} onClose={() => setVerify(null)} />}
      {details && <DetailsDialog entry={details} onClose={() => setDetails(null)} />}
    </Stack>
  );
}
