import { Button, Code, Group, SimpleGrid, Stack, Text } from '@mantine/core';
import { Fragment, type ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { type BackupOverview, formatPassphraseId } from '@forga/backup-contracts';
import { formatDate, formatDateTime, formatTime, send, translateCode, useTranslation } from '@forga/web-sdk';
import { ConfirmDialog, KpiTile, Notice, PageHeader, Panel, StatusBadge, useAction } from '@forga/web-ui';
import { ALL, formatBytes, formatDuration, useOverview } from '../api';
import { BackupNowDialog, BackupTabs, breadcrumbs } from '../components';

function StateList({ overview }: { overview: BackupOverview }) {
  const { t } = useTranslation('backup');
  const s = overview.settings;
  const content = [t('overview.contentDatabase'), s.include.plugins && t('overview.contentPlugins'), s.include.settingsCopy && t('overview.contentSettings')].filter(Boolean).join(', ');
  const rows: [string, ReactNode][] = [
    [t('overview.target'), <Code key="target">{overview.target?.path || (overview.root ? `${overview.root}/${s.targetPath}` : s.targetPath)}</Code>],
    [
      t('overview.schedule'),
      s.schedule.mode === 'off'
        ? t('overview.scheduleOff', { count: s.keepCount, days: s.keepDays })
        : t('overview.scheduleText', { mode: t(`mode.${s.schedule.mode}`), time: s.schedule.time, count: s.keepCount, days: s.keepDays }),
    ],
    [t('overview.encryption'), s.encryption ? t('overview.encrypted', { id: formatPassphraseId(s.passphraseId) }) : t('overview.unencrypted')],
    [t('overview.content'), content],
    [t('overview.tools'), t('overview.toolsText', { client: overview.tools.pgDump ?? '–', server: overview.tools.server ?? '–' })],
    [t('overview.restoreMethod'), t(overview.restoreMethod === 'swap' ? 'overview.restoreSwap' : 'overview.restoreClean')],
    [t('overview.notification'), t(s.notify.onFailure ? 'overview.notificationText' : 'overview.notificationOff', { hours: s.notify.staleHours })],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, max-content) minmax(0, 1fr)', columnGap: 16, rowGap: 8 }}>
      {rows.map(([label, value]) => (
        <Fragment key={label}>
          <Text size="sm" fw={700}>{label}</Text>
          <Text size="sm" component="div">{value}</Text>
        </Fragment>
      ))}
    </div>
  );
}

function Events({ overview }: { overview: BackupOverview }) {
  const { t, i18n } = useTranslation('backup');
  if (!overview.events.length) return <Text size="sm" c="dimmed">{t('overview.noEvents')}</Text>;
  return (
    <Stack gap="sm">
      {overview.events.map((event, index) => {
        const entry = event.entry;
        const meta =
          event.kind === 'restored'
            ? [event.detail && t('event.restoredFrom', { date: formatDateTime(event.detail, i18n.language) }), event.userName]
            : event.kind === 'failed' || event.kind === 'verifyFailed' || event.kind === 'restoreFailed'
              ? [event.detail && translateCode(event.detail), entry && t(`trigger.${entry.trigger}`)]
              : [entry && t(`trigger.${entry.trigger}`), entry && formatBytes(entry.size, i18n.language), entry && formatDuration(entry.durationMs), event.userName ?? entry?.userName];
        return (
          <Group key={index} gap="md" wrap="nowrap" align="flex-start">
            <Text size="sm" c="dimmed" w={110} style={{ flexShrink: 0 }}>{formatDateTime(event.at, i18n.language)}</Text>
            <div>
              <Text size="sm" fw={700}>{t(`event.${event.kind}`)}</Text>
              <Text size="xs" c="dimmed">{meta.filter(Boolean).join(' · ')}</Text>
            </div>
          </Group>
        );
      })}
    </Stack>
  );
}

function PreviousDatabases({ names }: { names: string[] }) {
  const { t } = useTranslation('backup');
  const [name, setName] = useState<string | null>(null);
  const drop = useAction((database: string) => send('DELETE', `backup/previous-databases/${encodeURIComponent(database)}`), { success: t('overview.dropped'), invalidate: ALL, onSuccess: () => setName(null) });
  return (
    <Panel title={t('overview.previous')}>
      <Text size="sm" mb="sm">{t('overview.previousText')}</Text>
      <Stack gap="xs">
        {names.map((database) => (
          <Group key={database} justify="space-between">
            <Code>{database}</Code>
            <Button size="compact-sm" variant="default" onClick={() => setName(database)}>{t('overview.dropPrevious')}</Button>
          </Group>
        ))}
      </Stack>
      <ConfirmDialog
        opened={name !== null}
        onClose={() => setName(null)}
        title={t('overview.dropPreviousTitle')}
        description={t('overview.dropPreviousText', { name })}
        confirmLabel={t('overview.dropPrevious')}
        loading={drop.isPending}
        onConfirm={() => name && drop.mutate(name)}
      />
    </Panel>
  );
}

/** „Verwaltung → Datensicherung“: state, warnings, latest events, „Jetzt sichern“. */
export function OverviewPage() {
  const { t, i18n } = useTranslation('backup');
  const { data: overview } = useOverview();
  const [now, setNow] = useState(false);
  const language = i18n.language;
  const last = overview?.lastSuccess;
  const free = overview?.target?.freeBytes ?? null;
  const perBackup = last?.size ?? null;
  return (
    <Stack gap="lg">
      <PageHeader
        breadcrumbs={breadcrumbs(t)}
        title={t('overview.title')}
        actions={
          <>
            <Button component={Link} to="/backup/settings" variant="default">{t('actions.settings')}</Button>
            <Button onClick={() => setNow(true)} disabled={!overview?.configured || overview.running}>{t('actions.now')}</Button>
          </>
        }
      />
      <BackupTabs />
      {overview && (
        <>
          <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
            <KpiTile
              value={last ? formatTime(last.startedAt, language) : '–'}
              label={t('overview.last')}
              hint={last ? [t('overview.lastHint', { date: formatDate(last.startedAt, language), size: formatBytes(last.size, language) }), last.verification?.ok ? t('overview.verified') : null].filter(Boolean).join(' · ') : t('overview.none')}
              attention={overview.warnings.includes('backup.stale') || overview.warnings.includes('backup.lastFailed')}
            />
            <KpiTile
              value={overview.nextScheduled ? formatTime(overview.nextScheduled, language) : '–'}
              label={t('overview.next')}
              hint={overview.nextScheduled ? t('overview.nextHint', { date: formatDate(overview.nextScheduled, language), mode: t(`mode.${overview.settings.schedule.mode}`) }) : t('overview.noSchedule')}
            />
            <KpiTile value={overview.backups} label={t('overview.count')} hint={overview.oldest ? t('overview.oldest', { date: formatDate(overview.oldest, language) }) : undefined} />
            <KpiTile
              value={formatBytes(free, language)}
              label={t('overview.free')}
              hint={free !== null && perBackup ? t('overview.freeHint', { count: Math.floor(free / perBackup) }) : undefined}
              attention={overview.warnings.includes('backup.targetNotWritable')}
            />
          </SimpleGrid>
          {overview.running && <Notice kind="info">{t('overview.running')}</Notice>}
          {overview.warnings.map((warning) => (
            <Notice key={warning} kind={warning === 'backup.notConfigured' ? 'info' : warning === 'backup.lastFailed' || warning === 'backup.targetNotWritable' ? 'error' : 'warning'}>
              {t(`warnings.${warning}`)}
            </Notice>
          ))}
          {overview.realData && (
            <Notice kind="warning">
              {t('overview.realData', { date: formatDate(overview.realData.deleteAt, i18n.language), reason: overview.realData.reason, user: overview.realData.userName ?? '–' })}
            </Notice>
          )}
          {overview.configured && !overview.settingsSaved && (
            <Notice kind="info" action={<Button component={Link} to="/backup/settings" size="compact-sm" variant="default">{t('actions.settings')}</Button>}>
              {t('overview.notSetUp')}
            </Notice>
          )}
          {overview.settingsSaved && overview.settings.encryption && <Notice kind="warning">{t('overview.passphraseWarning')}</Notice>}
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Panel title={t('overview.state')} aside={<StatusBadge tone={overview.warnings.length ? 'warning' : 'done'}>{t(overview.warnings.length ? 'overview.attention' : 'overview.ok')}</StatusBadge>}>
              <StateList overview={overview} />
            </Panel>
            <Panel title={t('overview.events')} aside={<Button component={Link} to="/backup/backups" size="compact-sm" variant="default">{t('actions.all')}</Button>}>
              <Events overview={overview} />
            </Panel>
          </SimpleGrid>
          {overview.oldDatabases.length > 0 && <PreviousDatabases names={overview.oldDatabases} />}
          {now && <BackupNowDialog overview={overview} onClose={() => setNow(false)} />}
        </>
      )}
    </Stack>
  );
}
