import { Text } from '@mantine/core';
import { useState } from 'react';
import type { ItemStatus } from '@forga/clothing-contracts';
import { formatDate, localDate, useTranslation } from '@forga/web-sdk';
import { StatusBadge, type Tone } from '@forga/web-ui';

const STATUS_TONES: Record<ItemStatus, Tone> = { stock: 'neutral', issued: 'done', retired: 'warning' };

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  const { t } = useTranslation('clothing');
  return <StatusBadge tone={STATUS_TONES[status]}>{t(`status.${status}`)}</StatusBadge>;
}

/** A due date, red when overdue, highlighted within 30 days. */
export function Due({ date }: { date: string | null }) {
  const { i18n } = useTranslation('clothing');
  const [{ today, soon }] = useState(() => ({ today: localDate(), soon: localDate(new Date(Date.now() + 30 * 86_400_000)) }));
  if (!date) return null;
  return (
    <Text span size="sm" c={date < today ? 'red.8' : date <= soon ? 'orange.8' : undefined} fw={date <= soon ? 700 : undefined}>
      {formatDate(date, i18n.language)}
    </Text>
  );
}
