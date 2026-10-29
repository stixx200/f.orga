import { Button, Checkbox, Code, Grid, Group, NumberInput, PasswordInput, Select, SimpleGrid, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { type BackupSettings, type BackupSettingsView, formatPassphraseId, PASSPHRASE_MIN_LENGTH, type TargetCheck } from '@forga/backup-contracts';
import { formatTime, send, translateCode, useTranslation } from '@forga/web-sdk';
import { Notice, PageHeader, Panel, useAction } from '@forga/web-ui';
import { ALL, formatBytes, useOverview, useSettings } from '../api';
import { BackupTabs, breadcrumbs } from '../components';

const STALE_HOURS = [24, 36, 48, 72, 168];

function SettingsForm({ initial, root }: { initial: BackupSettingsView; root: string }) {
  const { t, i18n } = useTranslation('backup');
  const { passphraseSet, passphraseId, passphraseUnreadable, ...stored } = initial;
  const [form, setForm] = useState<BackupSettings>(stored);
  const [passphrase, setPassphrase] = useState('');
  const [repeat, setRepeat] = useState('');
  const [keptSafe, setKeptSafe] = useState(false);
  const [unencryptedConfirmed, setUnencryptedConfirmed] = useState(false);
  const [target, setTarget] = useState<TargetCheck | null>(null);
  const set = <K extends keyof BackupSettings>(key: K, value: BackupSettings[K]) => setForm((f) => ({ ...f, [key]: value }));
  const save = useAction(
    () => send<BackupSettingsView>('PUT', 'backup/settings', { ...form, ...(passphrase ? { passphrase, passphraseRepeat: repeat, passphraseKeptSafe: keptSafe } : {}), unencryptedConfirmed }),
    {
      success: t('settings.saved'),
      invalidate: ALL,
      onSuccess: () => {
        setPassphrase('');
        setRepeat('');
        setKeptSafe(false);
      },
    },
  );
  const check = useAction(() => send<TargetCheck>('POST', 'backup/settings/test-target', { targetPath: form.targetPath }), { onSuccess: setTarget });
  const switchingOff = !form.encryption && stored.encryption;
  const passphraseInvalid = Boolean(passphrase) && (passphrase.length < PASSPHRASE_MIN_LENGTH || passphrase !== repeat || !keptSafe);
  const staleOptions = [...new Set([...STALE_HOURS, form.notify.staleHours])].toSorted((a, b) => a - b).map((hours) => ({
    value: String(hours),
    label: hours % 24 === 0 && hours >= 48 ? t('settings.days', { count: hours / 24 }) : t('settings.hours', { count: hours }),
  }));

  return (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, md: 8 }}>
        <Stack gap="lg">
          <Panel title={t('settings.target')}>
            <Stack gap="sm">
              <TextInput label={t('settings.folder', { root })} description={t('settings.folderHint', { root })} value={form.targetPath} onChange={(e) => set('targetPath', e.currentTarget.value)} required />
              {target ? (
                <Notice kind={target.writable ? 'done' : 'error'} action={<Button size="compact-sm" variant="default" loading={check.isPending} onClick={() => check.mutate(undefined)}>{t('settings.testTarget')}</Button>}>
                  {target.writable
                    ? t('settings.targetOk', { free: formatBytes(target.freeBytes, i18n.language), time: formatTime(target.checkedAt, i18n.language) })
                    : t('settings.targetFailed', { error: translateCode(target.error ?? 'backup.targetNotWritable') })}
                </Notice>
              ) : (
                <Group>
                  <Button size="compact-sm" variant="default" loading={check.isPending} onClick={() => check.mutate(undefined)}>{t('settings.testTarget')}</Button>
                </Group>
              )}
            </Stack>
          </Panel>

          <Panel title={t('settings.schedule')}>
            <Stack gap="sm">
              <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }}>
                <Select
                  label={t('settings.mode')}
                  data={(['off', 'daily', 'weekdays'] as const).map((mode) => ({ value: mode, label: t(`mode.${mode}`) }))}
                  value={form.schedule.mode}
                  onChange={(mode) => mode && set('schedule', { ...form.schedule, mode: mode as BackupSettings['schedule']['mode'] })}
                  allowDeselect={false}
                />
                <TextInput type="time" label={t('settings.time')} value={form.schedule.time} disabled={form.schedule.mode === 'off'} onChange={(e) => set('schedule', { ...form.schedule, time: e.currentTarget.value })} />
                <NumberInput label={t('settings.keepCount')} description={t('settings.keepCountHint')} min={1} max={1000} allowDecimal={false} value={form.keepCount} onChange={(value) => set('keepCount', Number(value) || 1)} />
                <NumberInput label={t('settings.keepDays')} description={t('settings.keepDaysHint')} min={0} max={3650} allowDecimal={false} value={form.keepDays} onChange={(value) => set('keepDays', Number(value) || 0)} />
              </SimpleGrid>
              <Switch label={t('settings.verifyAfter')} checked={form.verifyAfterBackup} onChange={(e) => set('verifyAfterBackup', e.currentTarget.checked)} />
            </Stack>
          </Panel>

          <Panel title={t('settings.encryption')}>
            <Stack gap="sm">
              <Switch label={t('settings.encrypt')} checked={form.encryption} onChange={(e) => set('encryption', e.currentTarget.checked)} />
              {form.encryption ? (
                <>
                  <Text size="sm">{passphraseSet ? t('settings.passphraseStored', { id: formatPassphraseId(passphraseId) }) : t('settings.passphraseNone')}</Text>
                  {passphraseUnreadable && <Notice kind="warning">{t('warnings.backup.passphraseUnreadable')}</Notice>}
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <PasswordInput label={t('settings.passphrase')} placeholder={passphraseSet ? t('settings.passphrasePlaceholder') : undefined} description={t('settings.passphraseHint')} value={passphrase} onChange={(e) => setPassphrase(e.currentTarget.value)} autoComplete="new-password" error={passphrase && passphrase.length < PASSPHRASE_MIN_LENGTH ? t('settings.passphraseHint') : undefined} />
                    <PasswordInput label={t('settings.passphraseRepeat')} value={repeat} onChange={(e) => setRepeat(e.currentTarget.value)} autoComplete="new-password" error={repeat && repeat !== passphrase ? t('errors.backup.passphraseMismatch') : undefined} />
                  </SimpleGrid>
                  <Notice kind="warning">{t('settings.passphraseWarning')}</Notice>
                  <Checkbox label={t('settings.keptSafe')} checked={keptSafe} onChange={(e) => setKeptSafe(e.currentTarget.checked)} disabled={!passphrase} />
                </>
              ) : (
                <>
                  <Notice kind="warning">{t('settings.unencryptedWarning')}</Notice>
                  {switchingOff && <Checkbox label={t('settings.unencryptedConfirm')} checked={unencryptedConfirmed} onChange={(e) => setUnencryptedConfirmed(e.currentTarget.checked)} />}
                </>
              )}
            </Stack>
          </Panel>

          <Panel title={t('settings.content')}>
            <Stack gap="sm">
              <Checkbox label={t('settings.database')} checked disabled />
              <Checkbox label={t('settings.plugins')} checked={form.include.plugins} onChange={(e) => set('include', { ...form.include, plugins: e.currentTarget.checked })} />
              <Checkbox label={t('settings.settingsCopy')} checked={form.include.settingsCopy} onChange={(e) => set('include', { ...form.include, settingsCopy: e.currentTarget.checked })} />
              <Checkbox label={t('settings.notify')} checked={form.notify.onFailure} onChange={(e) => set('notify', { ...form.notify, onFailure: e.currentTarget.checked })} />
              <Select label={t('settings.stale')} data={staleOptions} value={String(form.notify.staleHours)} onChange={(value) => value && set('notify', { ...form.notify, staleHours: Number(value) })} allowDeselect={false} maw={260} />
            </Stack>
          </Panel>

          <Group justify="flex-end">
            <Button loading={save.isPending} disabled={passphraseInvalid || (switchingOff && !unencryptedConfirmed) || !form.targetPath.trim()} onClick={() => save.mutate(undefined)}>{t('settings.save')}</Button>
          </Group>
        </Stack>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Panel title={t('settings.notIncluded')}>
          <Stack gap="sm">
            <div>
              <Code>docker/.env</Code>
              <Text size="xs" c="dimmed">{t('settings.env')}</Text>
            </div>
            <div>
              <Code>FORGA_SECRET_KEY</Code>
              <Text size="xs" c="dimmed">{t('settings.secretKey')}</Text>
            </div>
            <div>
              <Text size="sm" fw={700}>{t('backups.passphrase')}</Text>
              <Text size="xs" c="dimmed">{t('settings.passphraseOnly')}</Text>
            </div>
            <Text size="xs" c="dimmed">{t('settings.script')}</Text>
          </Stack>
        </Panel>
      </Grid.Col>
    </Grid>
  );
}

/** Target, schedule, retention, encryption, contents and notification (`backup.general`). */
export function SettingsPage() {
  const { t } = useTranslation('backup');
  const { data } = useSettings();
  const { data: overview } = useOverview();
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={breadcrumbs(t, t('settings.title'))} title={t('overview.title')} />
      <BackupTabs />
      {overview && !overview.configured && <Notice kind="info">{t('warnings.backup.notConfigured')}</Notice>}
      {data && overview && <SettingsForm initial={data} root={overview.root ?? 'FORGA_BACKUP_ROOT'} />}
    </Stack>
  );
}
