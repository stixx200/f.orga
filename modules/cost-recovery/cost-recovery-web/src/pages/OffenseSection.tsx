import { Select, Text } from '@mantine/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { Panel, useAction } from '@forga/web-ui';
import { useCostSettings } from '../api';

/**
 * Card "Kostenersatz" on the incident (extension point `incidents.incident.sections`): for a chargeable incident the
 * commander chooses the legal ground once for the whole incident; the notice later starts with it instead of the suggestion.
 */
export function OffenseSection({ incidentId, chargeable, disabled }: { incidentId?: unknown; chargeable?: unknown; disabled?: unknown }) {
  const { t } = useTranslation('cost-recovery');
  const client = useQueryClient();
  const localized = useLocalized();
  const id = String(incidentId);
  const key = ['cost-recovery', 'offense', id];
  const { data: settings } = useCostSettings();
  const { data } = useQuery({ queryKey: key, queryFn: () => api<{ offenseKey: string | null }>(`cost-recovery/incidents/${id}/offense`), enabled: Boolean(chargeable) });
  const save = useAction((offenseKey: string | null) => send('PUT', `cost-recovery/incidents/${id}/offense`, { offenseKey }), { success: t('offense.saved'), onSuccess: () => client.invalidateQueries({ queryKey: key }) });
  if (!chargeable) return null;
  return (
    <Panel title={t('offense.title')}>
      <Select
        label={t('offense.label')}
        description={t('offense.hint')}
        data={(settings?.offenses ?? []).map((o) => ({ value: o.key, label: `${localized(o.name)} (${o.legalBasis})` }))}
        value={data?.offenseKey ?? null}
        onChange={(v) => save.mutate(v)}
        clearable
        disabled={Boolean(disabled)}
      />
      {!settings?.offenses?.length && <Text size="xs" c="dimmed" mt={4}>{t('offense.none')}</Text>}
    </Panel>
  );
}
