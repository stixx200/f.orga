import { Button, Checkbox, Code, Group, List, PasswordInput, SimpleGrid, Stack, Tabs, Text } from '@mantine/core';
import { Fragment, type ReactNode, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { type BackupEntry, type BackupOverview, formatPassphraseId, type Verification } from '@forga/backup-contracts';
import { apiUrl, formatDateTime, send, translateCode, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, ResponsiveDialog, StatusBadge, type Tone, useAction } from '@forga/web-ui';
import { ALL, formatBytes } from './api';

/** Overview, backups and settings of the module. */
export function BackupTabs() {
  const { t } = useTranslation('backup');
  const location = useLocation();
  const navigate = useNavigate();
  const value = location.pathname.endsWith('/backups') ? 'backups' : location.pathname.endsWith('/settings') ? 'settings' : 'overview';
  return (
    <Tabs value={value} onChange={(next) => navigate(next === 'overview' ? '/backup' : `/backup/${next}`)} mb="md" aria-label={t('tabs.label')}>
      <Tabs.List>
        <Tabs.Tab value="overview">{t('tabs.overview')}</Tabs.Tab>
        <Tabs.Tab value="backups">{t('tabs.backups')}</Tabs.Tab>
        <Tabs.Tab value="settings">{t('tabs.settings')}</Tabs.Tab>
      </Tabs.List>
    </Tabs>
  );
}

export const breadcrumbs = (t: (key: string) => string, page?: string) => [
  { label: t('administration') },
  { label: t('module'), to: page ? '/backup' : undefined },
  ...(page ? [{ label: page }] : []),
];

/** Status of a backup as badge. */
export function EntryStatus({ entry }: { entry: BackupEntry }) {
  const { t } = useTranslation('backup');
  if (entry.trigger === 'foreign' && entry.status === 'ok') return <StatusBadge>{t('status.foreign')}</StatusBadge>;
  const tone: Record<BackupEntry['status'], Tone> = { running: 'highlight', ok: 'done', failed: 'error', missing: 'warning', deleted: 'neutral' };
  return <StatusBadge tone={tone[entry.status]}>{t(`status.${entry.status}`)}</StatusBadge>;
}

/** Result of the latest verification. */
export function VerificationText({ verification }: { verification: Verification | null }) {
  const { t, i18n } = useTranslation('backup');
  if (!verification) return <Text size="sm" c="dimmed">{t('backups.notChecked')}</Text>;
  if (!verification.ok) return <StatusBadge tone="error">{t('backups.checkFailed')}</StatusBadge>;
  if (verification.restoreTested) return <StatusBadge tone="done">{t('backups.restoreTested')}</StatusBadge>;
  return <Text size="sm">{t('backups.checkedAt', { time: formatDateTime(verification.checkedAt, i18n.language) })}</Text>;
}

/** Trigger with the user, or „fremd“ with the installation. */
export function TriggerText({ entry }: { entry: BackupEntry }) {
  const { t } = useTranslation('backup');
  if (entry.trigger === 'foreign') {
    return (
      <Group gap={6} wrap="nowrap">
        <StatusBadge>{t('trigger.foreign')}</StatusBadge>
        <Text size="sm">{entry.instance}</Text>
      </Group>
    );
  }
  return <Text size="sm">{[t(`trigger.${entry.trigger}`), entry.userName].filter(Boolean).join(' · ')}</Text>;
}

/** „Jetzt sichern“: optionally verify afterwards; asks for the passphrase when none is readable. */
export function BackupNowDialog({ overview, onClose }: { overview: BackupOverview; onClose: () => void }) {
  const { t } = useTranslation('backup');
  const [verify, setVerify] = useState(overview.settings.verifyAfterBackup);
  const [passphrase, setPassphrase] = useState('');
  const needsPassphrase = overview.settings.encryption && (!overview.settings.passphraseSet || overview.settings.passphraseUnreadable);
  const start = useAction(() => send('POST', 'backup/backups', { verify, ...(needsPassphrase ? { passphrase } : {}) }), { success: t('now.started'), invalidate: ALL, onSuccess: onClose });
  const path = overview.target?.path ?? overview.settings.targetPath;
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('now.title')}
      actions={
        <>
          <Button variant="outline" color="gray" onClick={onClose}>{t('actions.cancel')}</Button>
          <Button loading={start.isPending} disabled={needsPassphrase && passphrase.length < 12} onClick={() => start.mutate(undefined)}>{t('now.start')}</Button>
        </>
      }
    >
      <Text size="sm">{t(overview.settings.encryption ? 'now.text' : 'now.textUnencrypted', { path })}</Text>
      {needsPassphrase && <PasswordInput label={t('now.passphrase')} description={t('now.passphraseHint')} value={passphrase} onChange={(e) => setPassphrase(e.currentTarget.value)} required />}
      <Checkbox label={t('now.verify')} checked={verify} onChange={(e) => setVerify(e.currentTarget.checked)} />
    </ResponsiveDialog>
  );
}

/** Lines of a verification result (also used in the restore wizard). */
export function VerificationResult({ verification }: { verification: Verification }) {
  const { t } = useTranslation('backup');
  const line = (ok: boolean, text: string) => (
    <Group justify="space-between" wrap="nowrap" key={text}>
      <Text size="sm">{text}</Text>
      <StatusBadge tone={ok ? 'done' : 'error'}>{t(ok ? 'verify.ok' : 'verify.failed')}</StatusBadge>
    </Group>
  );
  if (!verification.ok && verification.objects === null) return <Stack gap={6}>{line(false, translateCode(verification.error ?? 'backup.verifyFailed'))}</Stack>;
  const counts = verification.restoredCounts;
  return (
    <Stack gap={6}>
      {line(true, t('verify.decrypted'))}
      {verification.objects !== null && line(true, t('verify.readable', { objects: verification.objects, schemas: verification.schemas ?? 0 }))}
      {verification.compatible !== null && line(verification.compatible, verification.compatible ? t('verify.compatible') : t('verify.incompatible', { modules: verification.missingModules.join(', ') || '–' }))}
      {counts && line(verification.ok, t('verify.restoredCounts', { persons: counts.persons ?? '–', incidents: counts.incidents ?? '–', reports: counts.reports ?? '–', sessions: counts.sessions ?? '–' }))}
      {!verification.ok && verification.error && line(false, translateCode(verification.error))}
    </Stack>
  );
}

/** „Prüfen“, optionally with „Wiederherstellung testen“; asks for the passphrase of foreign backups. */
export function VerifyDialog({ entry, storedId, onClose }: { entry: BackupEntry; storedId: string | null; onClose: () => void }) {
  const { t, i18n } = useTranslation('backup');
  const [restoreTest, setRestoreTest] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [result, setResult] = useState<BackupEntry | null>(null);
  const otherPassphrase = entry.encrypted !== false && (entry.trigger === 'foreign' || entry.trigger === 'upload' || (entry.passphraseId !== null && entry.passphraseId !== storedId));
  const verify = useAction(() => send<BackupEntry>('POST', `backup/backups/${entry.id}/verify`, { restoreTest, ...(passphrase ? { passphrase } : {}) }), { invalidate: ALL, onSuccess: setResult });
  return (
    <ResponsiveDialog
      opened
      onClose={onClose}
      title={t('verify.title')}
      actions={
        <>
          <Button variant="outline" color="gray" onClick={onClose}>{t('actions.close')}</Button>
          <Button loading={verify.isPending} onClick={() => verify.mutate(undefined)}>{t('verify.run')}</Button>
        </>
      }
    >
      <Text size="sm">{t('verify.of', { date: formatDateTime(entry.startedAt, i18n.language) })}</Text>
      {otherPassphrase && <PasswordInput label={t('verify.passphrase')} description={entry.passphraseId ? t('verify.passphraseHint', { id: formatPassphraseId(entry.passphraseId) }) : undefined} value={passphrase} onChange={(e) => setPassphrase(e.currentTarget.value)} />}
      {result?.verification && <VerificationResult verification={result.verification} />}
      <Checkbox label={t('verify.restoreTest')} checked={restoreTest} onChange={(e) => setRestoreTest(e.currentTarget.checked)} />
    </ResponsiveDialog>
  );
}

/** Details of a backup with download and delete. */
export function DetailsDialog({ entry, onClose }: { entry: BackupEntry; onClose: () => void }) {
  const { t, i18n } = useTranslation('backup');
  const [confirm, setConfirm] = useState(false);
  const remove = useAction(() => send('DELETE', `backup/backups/${entry.id}`), { success: t('backups.deleted'), invalidate: ALL, onSuccess: onClose });
  const date = formatDateTime(entry.startedAt, i18n.language);
  const rows: [string, ReactNode][] = [
    [t('backups.file'), entry.fileName ? <Code key="file">{entry.fileName}</Code> : '–'],
    [t('backups.version'), entry.appVersion ? t('backups.versionText', { version: entry.appVersion }) : '–'],
    [t('backups.instance'), entry.instance ?? '–'],
    [t('backups.passphrase'), entry.encrypted === false ? t('backups.notEncrypted') : entry.passphraseId ? t('backups.passphraseId', { id: formatPassphraseId(entry.passphraseId) }) : '–'],
    ...(entry.keepUntil ? [[t('backups.keepUntil'), formatDateTime(entry.keepUntil, i18n.language)] as [string, ReactNode]] : []),
    ...(entry.errorCode ? [[t('backups.error'), translateCode(entry.errorCode)] as [string, ReactNode]] : []),
  ];
  return (
    <>
      <ResponsiveDialog opened={!confirm} onClose={onClose} title={t('backups.detailsTitle', { date })} actions={<Button variant="outline" color="gray" onClick={onClose}>{t('actions.close')}</Button>}>
        <SimpleGrid cols={2} spacing={6} verticalSpacing={6}>
          {rows.map(([label, value]) => (
            <Fragment key={label}>
              <Text size="sm" fw={700}>{label}</Text>
              <Text size="sm" component="div">{value}</Text>
            </Fragment>
          ))}
        </SimpleGrid>
        {entry.fileName && entry.status === 'ok' && (
          <Group gap="sm">
            <Button component="a" href={apiUrl(`backup/backups/${entry.id}/file`)} variant="default">{t('backups.download')}</Button>
            {entry.trigger !== 'foreign' && <Button variant="default" onClick={() => setConfirm(true)}>{t('backups.delete')}</Button>}
          </Group>
        )}
        <Text size="xs" c="dimmed">{t('backups.detailsHint')}</Text>
      </ResponsiveDialog>
      <ConfirmDialog
        opened={confirm}
        onClose={() => setConfirm(false)}
        title={t('backups.deleteTitle')}
        description={t('backups.deleteText', { date, size: formatBytes(entry.size, i18n.language) })}
        confirmLabel={t('backups.deleteConfirm')}
        loading={remove.isPending}
        onConfirm={() => remove.mutate(undefined)}
      />
    </>
  );
}

/** What happens during a restore (wizard, side panel). */
export function RestoreSteps({ method }: { method: 'swap' | 'clean' }) {
  const { t } = useTranslation('backup');
  return (
    <List type="ordered" size="sm" spacing={6}>
      <List.Item>{t('restore.what1')}</List.Item>
      <List.Item>{t('restore.what2')}</List.Item>
      <List.Item>{t(method === 'swap' ? 'restore.what3' : 'restore.what3Clean')}</List.Item>
      <List.Item>{t('restore.what4')}</List.Item>
      {method === 'swap' && <List.Item>{t('restore.what5')}</List.Item>}
    </List>
  );
}

export const RestoreLink = ({ entry }: { entry: BackupEntry }) => {
  const { t } = useTranslation('backup');
  return (
    <Button component={Link} to={`/backup/restore/${entry.id}`} variant="subtle" size="compact-sm">
      {t('backups.restore')}
    </Button>
  );
};
