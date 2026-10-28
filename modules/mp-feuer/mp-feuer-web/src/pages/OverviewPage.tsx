import { Anchor, Button, Group, List, SimpleGrid, Stack, Text } from '@mantine/core';
import { Link, useNavigate } from 'react-router';
import { formatDate, formatDateTime, useCan, useTranslation } from '@forga/web-sdk';
import { KpiTile, Notice, Panel, StatusBadge } from '@forga/web-ui';
import { isRunning, TRANSFER, useIncidentOperation, useMappings, useRuns } from '../api';
import { ModulePage } from '../components/ModulePage';
import { sumCounts } from '../components/RunBits';

/** Overview: last apply, working run, parallel operation of the incident reports, weekly routine. */
export function OverviewPage() {
  const { t, i18n } = useTranslation('mp-feuer');
  const navigate = useNavigate();
  const mayTransfer = useCan(TRANSFER);
  const { data: runs = [] } = useRuns();
  const { data: mappings = [] } = useMappings();
  const { data: incidents } = useIncidentOperation();
  const lastApplied = runs.find((r) => r.status === 'applied');
  const working = runs.find(isRunning);
  const problems = mappings.filter((m) => m.targetState !== 'active').length;
  const firstRun = runs.at(-1);
  const counts = lastApplied ? lastApplied.counts : sumCounts([]);

  return (
    <ModulePage>
      <Notice kind="info">{t('overview.intro')}</Notice>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <KpiTile
          value={lastApplied ? counts.error : '–'}
          label={t('overview.lastErrors')}
          hint={lastApplied ? t('overview.lastSummary', { date: formatDateTime(lastApplied.finishedAt, i18n.language), files: lastApplied.files.length, create: counts.create, update: counts.update, error: counts.error }) : t('overview.noApply')}
          attention={!!lastApplied && counts.error > 0}
          to={lastApplied ? `/mp-feuer/runs/${lastApplied.id}` : undefined}
        />
        <KpiTile value={mappings.length} label={t('overview.mappings')} hint={problems ? t('overview.mappingProblems', { count: problems }) : undefined} attention={problems > 0} to="/mp-feuer/mappings" />
        <KpiTile value={runs.length} label={t('overview.runs')} hint={firstRun ? t('overview.since', { date: formatDate(firstRun.createdAt, i18n.language) }) : undefined} to="/mp-feuer/history" />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Panel
          title={t('overview.state')}
          aside={incidents ? <StatusBadge tone={incidents.externalLeading === 'mp-feuer' ? 'warning' : 'done'}>{t(incidents.externalLeading === 'mp-feuer' ? 'overview.ledByMpFeuer' : 'overview.ledByForga')}</StatusBadge> : undefined}
        >
          <Stack gap="xs">
            <Text size="sm">
              <b>{t('overview.lastApply')}:</b>{' '}
              {lastApplied ? (
                <>
                  {t('overview.byUser', { date: formatDateTime(lastApplied.finishedAt, i18n.language), user: lastApplied.createdBy })} ·{' '}
                  <Anchor component={Link} to={`/mp-feuer/runs/${lastApplied.id}`}>{t('overview.report')}</Anchor>
                </>
              ) : (
                t('overview.none')
              )}
            </Text>
            <Text size="sm">
              <b>{t('overview.working')}:</b>{' '}
              {working ? <Anchor component={Link} to={`/mp-feuer/runs/${working.id}`}>{t('overview.workingSince', { date: formatDateTime(working.createdAt, i18n.language), user: working.createdBy })}</Anchor> : t('overview.none')}
            </Text>
            {incidents?.externalEventsFrom && (
              <Text size="sm">
                <b>{t('overview.eventsFrom')}:</b> {formatDate(incidents.externalEventsFrom, i18n.language)}
              </Text>
            )}
            <Text size="xs" c="dimmed">{t('overview.locked')}</Text>
          </Stack>
        </Panel>
        <Panel title={t('overview.routine')}>
          <Stack gap="md">
            <List type="ordered" size="sm" spacing={4}>
              <List.Item>{t('overview.routine1')}</List.Item>
              <List.Item>{t('overview.routine2')}</List.Item>
              <List.Item>{t('overview.routine3')}</List.Item>
            </List>
            {mayTransfer && (
              <Group grow>
                <Button onClick={() => navigate('/mp-feuer/transfer')}>{t('overview.newRun')}</Button>
              </Group>
            )}
          </Stack>
        </Panel>
      </SimpleGrid>
    </ModulePage>
  );
}
