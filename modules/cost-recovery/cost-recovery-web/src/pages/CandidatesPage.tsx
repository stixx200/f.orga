import { Anchor, Button, Group, Stack, Text } from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { type Candidate, CostRecoverySettings, missingConfiguration, type Notice } from '@forga/cost-recovery-contracts';
import { can, formatDateTime, send, useSession, useTranslation } from '@forga/web-sdk';
import { DataTable, Notice as Hint, PageHeader, StatusBadge, useAction } from '@forga/web-ui';
import { keys, SETTINGS, useCandidates, useCostSettings, useOffenseName, WRITE } from '../api';
import { NoticeStatusBadge } from '../parts';

/** Incidents marked chargeable, with or without notice; notices only once legal basis, regulation and remedy are configured. */
export function CandidatesPage() {
  const { t, i18n } = useTranslation('cost-recovery');
  const navigate = useNavigate();
  const session = useSession().data;
  const offense = useOffenseName();
  const { data: settings, isSuccess } = useCostSettings();
  const [year] = useState(() => new Date().getFullYear());
  const [from, setFrom] = useState<string | null>(`${year - 1}-01-01`);
  const [to, setTo] = useState<string | null>(`${year}-12-31`);
  const { data = [], isLoading } = useCandidates({ from: from ?? undefined, to: to ?? undefined });
  const missing = isSuccess ? missingConfiguration(CostRecoverySettings.parse(settings ?? {})) : [];
  const create = useAction((incidentId: string) => send<Notice>('POST', 'cost-recovery/notices', { incidentId }), { invalidate: [keys.all], onSuccess: (n) => navigate(`/cost-recovery/notices/${n.id}`) });
  // Only the button of the incident being created spins.
  const creating = create.isPending ? create.variables : null;
  return (
    <Stack gap="lg">
      <PageHeader breadcrumbs={[{ label: t('module') }, { label: t('candidates.title') }]} title={t('candidates.title')} subtitle={t('candidates.subtitle')} />
      {missing.length > 0 && (
        <Hint kind="warning" action={can(session, SETTINGS) ? <Button component={Link} to="/cost-recovery/settings" size="xs" variant="default">{t('candidates.toSettings')}</Button> : undefined}>
          {t('settings.missing', { parts: missing.map((p) => t(`settings.parts.${p}`)).join(', ') })}
        </Hint>
      )}
      <Group>
        <DateInput label={t('candidates.from')} value={from} onChange={setFrom} valueFormat="DD.MM.YYYY" />
        <DateInput label={t('candidates.to')} value={to} onChange={setTo} valueFormat="DD.MM.YYYY" />
      </Group>
      <DataTable<Candidate>
        rows={data}
        rowKey={(c) => c.incidentId}
        empty={isLoading ? t('loading') : t('candidates.empty')}
        columns={[
          { key: 'date', header: t('fields.alarmedAt'), render: (c) => formatDateTime(c.alarmedAt, i18n.language) },
          {
            key: 'incident',
            header: t('fields.incident'),
            render: (c) => (
              <>
                <Anchor component={Link} to={`/incidents/incidents/${c.incidentId}`} size="sm" fw={700}>{c.alarmKeyword} · {c.dispatchNumber}</Anchor>
                <Text size="xs" c="dimmed">{[c.object, c.location].filter(Boolean).join(' · ')}</Text>
                {c.chargeableReason && <Text size="xs">{c.chargeableReason}</Text>}
              </>
            ),
          },
          { key: 'offense', header: t('fields.offense'), render: (c) => offense(c.suggestedOffense) },
          { key: 'released', header: t('candidates.report'), render: (c) => <StatusBadge tone={c.released ? 'done' : 'warning'}>{c.released ? t('candidates.released') : t('candidates.notReleased')}</StatusBadge> },
          {
            key: 'notice',
            header: t('candidates.notice'),
            align: 'right',
            render: (c) =>
              c.noticeId ? (
                <Group gap="xs" justify="flex-end"><NoticeStatusBadge status={c.noticeStatus!} /><Button size="compact-xs" variant="default" onClick={() => navigate(`/cost-recovery/notices/${c.noticeId}`)}>{t('candidates.open')}</Button></Group>
              ) : (
                can(session, WRITE) && (
                  <Button size="compact-xs" loading={creating === c.incidentId} disabled={missing.length > 0 || (create.isPending && creating !== c.incidentId)} onClick={() => create.mutate(c.incidentId)}>
                    {t('candidates.create')}
                  </Button>
                )
              ),
          },
        ]}
      />
    </Stack>
  );
}
