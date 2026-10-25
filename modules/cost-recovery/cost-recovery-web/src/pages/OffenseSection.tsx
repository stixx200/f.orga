import { Anchor, Group, Select, Stack, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ENDED_STATUSES } from '@forga/cost-recovery-contracts';
import { api, can, formatMoney, send, useLocalized, useSession, useTranslation } from '@forga/web-sdk';
import { Notice as Hint, Panel, useAction } from '@forga/web-ui';
import { READ, useCostSettings, useIncidentNotices } from '../api';
import { NoticeStatusBadge } from '../parts';

/**
 * Card "Kostenersatz" on the incident (extension point `incidents.incident.sections`): for a chargeable incident the
 * commander chooses the legal ground once for the whole incident; the notice later starts with it instead of the suggestion.
 * With the right to read notices, the card lists the notices of the incident and warns when the incident is no longer
 * chargeable although a notice is in effect.
 */
export function OffenseSection({ incidentId, chargeable, disabled }: { incidentId?: unknown; chargeable?: unknown; disabled?: unknown }) {
  const { t, i18n } = useTranslation('cost-recovery');
  const client = useQueryClient();
  const localized = useLocalized();
  const session = useSession().data;
  const id = String(incidentId);
  const key = ['cost-recovery', 'offense', id];
  const { data: settings } = useCostSettings();
  const { data } = useQuery({ queryKey: key, queryFn: () => api<{ offenseKey: string | null }>(`cost-recovery/incidents/${id}/offense`), enabled: Boolean(chargeable) });
  const { data: notices = [] } = useIncidentNotices(id, can(session, READ));
  const save = useAction((offenseKey: string | null) => send('PUT', `cost-recovery/incidents/${id}/offense`, { offenseKey }), { success: t('offense.saved'), onSuccess: () => client.invalidateQueries({ queryKey: key }) });
  const inEffect = notices.filter((n) => !ENDED_STATUSES.includes(n.status));
  if (!chargeable && !notices.length) return null;
  return (
    <Panel title={t('offense.title')}>
      <Stack gap="sm">
        {!chargeable && inEffect.length > 0 && <Hint kind="warning">{t('offense.notChargeable', { count: inEffect.length })}</Hint>}
        {Boolean(chargeable) && (
          <>
            <Select
              label={t('offense.label')}
              description={t('offense.hint')}
              data={(settings?.offenses ?? []).map((o) => ({ value: o.key, label: `${localized(o.name)} (${o.legalBasis})` }))}
              value={data?.offenseKey ?? null}
              onChange={(v) => save.mutate(v)}
              clearable
              disabled={Boolean(disabled)}
            />
            {!settings?.offenses?.length && <Text size="xs" c="dimmed">{t('offense.none')}</Text>}
          </>
        )}
        {notices.length > 0 && (
          <Stack gap={4}>
            <Text size="sm" fw={700}>{t('offense.notices')}</Text>
            {notices.map((n) => (
              <Group key={n.id} gap="xs">
                <Anchor component={Link} to={`/cost-recovery/notices/${n.id}`} size="sm" fw={700}>{n.number}</Anchor>
                <NoticeStatusBadge status={n.status} />
                <Text size="sm" c="dimmed">{formatMoney(n.total, i18n.language)}</Text>
              </Group>
            ))}
          </Stack>
        )}
      </Stack>
    </Panel>
  );
}
