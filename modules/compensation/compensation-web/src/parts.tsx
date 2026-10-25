import { Button, Text } from '@mantine/core';
import { Link } from 'react-router';
import type { Item, RunStatus } from '@forga/compensation-contracts';
import { formatMoney, useTranslation } from '@forga/web-sdk';
import { Notice, StatusBadge, type Tone } from '@forga/web-ui';

const TONES: Record<RunStatus, Tone> = { draft: 'neutral', closed: 'warning', 'handed-over': 'primary', paid: 'done' };

export function RunStatusBadge({ status }: { status: RunStatus }) {
  const { t } = useTranslation('compensation');
  return <StatusBadge tone={TONES[status]}>{t(`runStatus.${status}`)}</StatusBadge>;
}

/** Amount with "(AZ)" for working hours and a hint for missing amounts. */
export function Amount({ item }: { item: Pick<Item, 'amount' | 'workingHours'> }) {
  const { t, i18n } = useTranslation('compensation');
  if (item.amount === null) return <Text size="sm" c="red.8" fw={700}>{t('items.amountMissing')}</Text>;
  return <Text size="sm">{formatMoney(item.amount, i18n.language)}{item.workingHours ? ' (AZ)' : ''}</Text>;
}

/** Label of an item with its source and a correction mark. */
export function ItemLabel({ item }: { item: Pick<Item, 'label' | 'source' | 'kind' | 'correction'> }) {
  const { t } = useTranslation('compensation');
  return (
    <>
      <Text size="sm" fw={700}>{item.label}{item.correction ? ` · ${t('items.correction')}` : ''}</Text>
      <Text size="xs" c="dimmed">{t(`source.${item.source}`)} · {t(`kind.${item.kind}`)}</Text>
    </>
  );
}

/** In the incident reports settings: the hourly rates and the rounding for incidents are set here (statute). */
export function IncidentRatesNotice() {
  const { t } = useTranslation('compensation');
  return (
    <Notice kind="info" action={<Button component={Link} to="/compensation/settings" size="xs" variant="default">{t('settings.open')}</Button>}>
      {t('settings.incidentRatesHere')}
    </Notice>
  );
}
