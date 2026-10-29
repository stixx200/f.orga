import { Button, Checkbox, Code, Grid, Group, PasswordInput, Stack, Stepper, Table, Text, TextInput } from '@mantine/core';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { BackupCounts, RestoreCheck, RestoreProgress, RestoreStarted } from '@forga/backup-contracts';
import { ApiError, formatDateTime, send, setLoginNotice, setMaintenanceHandledByPage, translateCode, useTranslation } from '@forga/web-sdk';
import { Notice, PageHeader, Panel, StatusBadge, type Tone, useAction } from '@forga/web-ui';
import { formatBytes, useBackup } from '../api';
import { breadcrumbs, RestoreSteps, TriggerText, VerificationResult, VerificationText } from '../components';

/** The token of a running restore survives reloads of the page (and the restart of the server). */
const TOKEN_KEY = 'forga.backup.restoreToken';
const POLL_MS = 1500;
const NO_RESTART_MS = 2 * 60_000;

function storedToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // Without storage the page cannot pick the restore up again after a reload.
  }
}

const COUNTS: (keyof BackupCounts)[] = ['persons', 'incidents', 'reports', 'sessions'];

/** Step 2: the passphrase entered again, then decrypting and checking the backup. */
function CheckStep({ backupId, onChecked }: { backupId: string; onChecked: (check: RestoreCheck, passphrase: string) => void }) {
  const { t } = useTranslation('backup');
  const [passphrase, setPassphrase] = useState('');
  const [result, setResult] = useState<RestoreCheck | null>(null);
  const check = useAction(() => send<RestoreCheck>('POST', 'backup/restore/check', { backupId, passphrase }), { onSuccess: setResult });
  const newer = result?.verification.ok && result.verification.compatible === false && !result.verification.missingModules.length;
  const usable = result?.verification.ok && result.verification.compatible;
  return (
    <Stack gap="md" maw={640}>
      <PasswordInput label={t('restore.passphrase')} description={t('restore.passphraseHint')} value={passphrase} onChange={(e) => setPassphrase(e.currentTarget.value)} autoComplete="off" />
      <Group>
        <Button variant="default" loading={check.isPending} onClick={() => check.mutate(undefined)}>{t('restore.check')}</Button>
      </Group>
      {result && <VerificationResult verification={result.verification} />}
      {result && newer && <Notice kind="error">{t('restore.newer', { version: result.manifest.appVersion })}</Notice>}
      {result && result.verification.missingModules.length > 0 && <Notice kind="error">{t('restore.missingModules', { modules: result.verification.missingModules.join(', ') })}</Notice>}
      <Group justify="flex-end">
        <Button component={Link} to="/backup/backups" variant="default">{t('actions.cancel')}</Button>
        <Button disabled={!usable} onClick={() => result && onChecked(result, passphrase)}>{t('restore.next')}</Button>
      </Group>
    </Stack>
  );
}

/** Step 3: what is lost, the name of the brigade as confirmation. */
function ConfirmStep({ check, passphrase, onStarted }: { check: RestoreCheck; passphrase: string; onStarted: (token: string) => void }) {
  const { t, i18n } = useTranslation('backup');
  const [name, setName] = useState('');
  const [informed, setInformed] = useState(false);
  const start = useAction(() => send<RestoreStarted>('POST', 'backup/restore', { backupId: check.entry.id, passphrase, confirmName: name, usersInformed: true }), { onSuccess: (result) => onStarted(result.token) });
  const date = formatDateTime(check.manifest.createdAt, i18n.language);
  return (
    <Grid gap="lg">
      <Grid.Col span={{ base: 12, md: 8 }}>
        <Panel title={t('restore.backupOf', { date })}>
          <Stack gap="md">
            <Notice kind="done">{t('restore.checkOk', { backup: check.manifest.appVersion, running: check.runningVersion })}</Notice>
            <Table withTableBorder striped>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th />
                  <Table.Th ta="right">{t('restore.now')}</Table.Th>
                  <Table.Th ta="right">{t('restore.inBackup')}</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {COUNTS.map((key) => (
                  <Table.Tr key={key}>
                    <Table.Td>{t(`restore.${key}`)}</Table.Td>
                    <Table.Td ta="right">{check.current[key]?.toLocaleString(i18n.language) ?? '–'}</Table.Td>
                    <Table.Td ta="right">{check.manifest.counts[key]?.toLocaleString(i18n.language) ?? '–'}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
            <Notice kind="error">
              <strong>{t('restore.loss', { date })}</strong> {t('restore.lossText')}
            </Notice>
            <TextInput label={t('restore.confirmName')} placeholder={check.brigadeName ?? undefined} value={name} onChange={(e) => setName(e.currentTarget.value)} required />
            <Checkbox label={t('restore.informed')} checked={informed} onChange={(e) => setInformed(e.currentTarget.checked)} />
            <Group justify="flex-end">
              <Button component={Link} to="/backup/backups" variant="default">{t('actions.cancel')}</Button>
              <Button loading={start.isPending} disabled={!informed || !name.trim()} onClick={() => start.mutate(undefined)}>{t('restore.start')}</Button>
            </Group>
          </Stack>
        </Panel>
      </Grid.Col>
      <Grid.Col span={{ base: 12, md: 4 }}>
        <Panel title={t('restore.what')}>
          <RestoreSteps method={check.restoreMethod} />
          <Text size="xs" c="dimmed" mt="sm">{t('restore.refused')}</Text>
        </Panel>
      </Grid.Col>
    </Grid>
  );
}

/** Step 4: progress of the restore, also during the maintenance and across the restart. */
function ProgressStep({ token, method }: { token: string; method: 'swap' | 'clean' | null }) {
  const { t, i18n } = useTranslation('backup');
  const [progress, setProgress] = useState<RestoreProgress | null>(null);
  const [lost, setLost] = useState(false);
  const [restartingSince, setRestartingSince] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    // The shell keeps this page during the maintenance instead of showing the maintenance page.
    setMaintenanceHandledByPage(true);
    let stopped = false;
    let noticeSet = false;
    const poll = async () => {
      try {
        const response = await fetch(`/api/backup/restore/status?token=${encodeURIComponent(token)}`, { credentials: 'include' });
        if (response.status === 404) setLost(true);
        else if (response.ok) {
          const next = (await response.json()) as RestoreProgress;
          setProgress(next);
          if (next.phase === 'restarting') {
            setRestartingSince((since) => since ?? Date.now());
            if (!noticeSet && next.backupCreatedAt) {
              noticeSet = true;
              const date = (language: string) => formatDateTime(next.backupCreatedAt, language);
              setLoginNotice({ de: i18n.t('restore.loginNotice', { ns: 'backup', lng: 'de', date: date('de') }), en: i18n.t('restore.loginNotice', { ns: 'backup', lng: 'en', date: date('en') }) });
            }
          }
          if (next.phase === 'done' || next.phase === 'failed') storeToken(null);
        }
      } catch {
        // The server restarts: try again.
      }
      setNow(Date.now());
      if (!stopped) setTimeout(poll, POLL_MS);
    };
    void poll();
    return () => {
      stopped = true;
      setMaintenanceHandledByPage(false);
    };
  }, [token, i18n]);

  if (lost && !progress) return <Notice kind="error">{translateCode('backup.restoreNotFound')}</Notice>;
  if (!progress) return null;
  const tone: Record<RestoreProgress['steps'][number]['state'], Tone> = { waiting: 'neutral', running: 'highlight', done: 'done', failed: 'error' };
  const date = progress.backupCreatedAt ? formatDateTime(progress.backupCreatedAt, i18n.language) : '–';
  const label = (step: RestoreProgress['steps'][number]['step']) => t(step === 'restore' && method === 'clean' ? 'restore.step.restoreClean' : `restore.step.${step}`);
  return (
    <Panel title={t('restore.running')} aside={progress.phase === 'running' || progress.phase === 'restarting' || progress.phase === 'swapFailed' ? <StatusBadge tone="highlight">{t('restore.maintenanceBadge')}</StatusBadge> : undefined}>
      <Stack gap="md">
        <Stack gap={8}>
          {progress.steps.map((step) => (
            <Group key={step.step} justify="space-between" wrap="nowrap">
              <Text size="sm">
                {label(step.step)}
                {step.detail && step.state !== 'waiting' && step.step !== 'restore' && step.step !== 'swap' ? ` · ${step.detail}` : ''}
              </Text>
              <StatusBadge tone={tone[step.state]}>{t(`restore.state.${step.state}`)}</StatusBadge>
            </Group>
          ))}
        </Stack>
        {progress.phase === 'done' && (
          <>
            <Notice kind="done">{t('restore.done', { date })}</Notice>
            <Group>
              <Button onClick={() => window.location.assign('/')}>{t('restore.toLogin')}</Button>
            </Group>
          </>
        )}
        {progress.phase === 'failed' && (
          <Notice kind="error">
            {t('restore.failed', { error: translateCode(progress.error ?? 'backup.restoreFailed') })}
            {progress.errorDetail && <Code block mt="xs">{progress.errorDetail}</Code>}
          </Notice>
        )}
        {progress.phase === 'swapFailed' && (
          <Notice kind="error">
            {t('restore.swapFailed')}
            <Code block mt="xs">{progress.consoleCommands}</Code>
          </Notice>
        )}
        {(progress.phase === 'running' || progress.phase === 'restarting') && <Text size="sm" c="dimmed">{t('restore.selfUpdating')}</Text>}
        {progress.phase === 'restarting' && restartingSince !== null && now - restartingSince > NO_RESTART_MS && <Notice kind="warning">{t('restore.noRestart')}</Notice>}
        {progress.phase === 'running' && <Notice kind="info">{t('restore.failedInfo')}</Notice>}
      </Stack>
    </Panel>
  );
}

/** Restore wizard: choose, check (passphrase again), confirm (brigade name), restore. */
export function RestorePage() {
  const { t, i18n } = useTranslation('backup');
  const { id = '' } = useParams();
  const [token, setToken] = useState<string | null>(storedToken);
  const [step, setStep] = useState(token ? 3 : 0);
  const [checked, setChecked] = useState<{ check: RestoreCheck; passphrase: string } | null>(null);
  const backup = useBackup(id);
  const entry = backup.data;
  const steps = ['choose', 'check', 'confirm', 'run'] as const;

  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={breadcrumbs(t, t('restore.title'))} title={t('restore.title')} />
      <Stepper active={step} size="sm" onStepClick={(next) => next < step && step < 3 && setStep(next)} allowNextStepsSelect={false}>
        {steps.map((name) => (
          <Stepper.Step key={name} label={t(`restore.steps.${name}`)} />
        ))}
      </Stepper>
      <Text fw={700}>{t('restore.stepOf', { step: step + 1, name: t(`restore.steps.${steps[step]}`) })}</Text>
      {step < 3 && backup.error instanceof ApiError && <Notice kind="error">{(backup.error as ApiError).translated()}</Notice>}
      {step === 0 && entry && (
        <Panel title={t('restore.backupOf', { date: formatDateTime(entry.startedAt, i18n.language) })} maw={640}>
          <Stack gap="sm">
            <TriggerText entry={entry} />
            <Text size="sm">{[entry.instance, entry.appVersion && t('backups.versionText', { version: entry.appVersion }), formatBytes(entry.size, i18n.language)].filter(Boolean).join(' · ')}</Text>
            {entry.fileName && <Code>{entry.fileName}</Code>}
            <VerificationText verification={entry.verification} />
            <Group justify="flex-end">
              <Button component={Link} to="/backup/backups" variant="default">{t('actions.cancel')}</Button>
              <Button disabled={entry.status !== 'ok'} onClick={() => setStep(1)}>{t('restore.next')}</Button>
            </Group>
          </Stack>
        </Panel>
      )}
      {step === 1 && (
        <CheckStep
          backupId={id}
          onChecked={(check, passphrase) => {
            setChecked({ check, passphrase });
            setStep(2);
          }}
        />
      )}
      {step === 2 && checked && (
        <ConfirmStep
          check={checked.check}
          passphrase={checked.passphrase}
          onStarted={(started) => {
            storeToken(started);
            setToken(started);
            setStep(3);
          }}
        />
      )}
      {step === 3 && token && <ProgressStep token={token} method={checked?.check.restoreMethod ?? null} />}
    </Stack>
  );
}
