import { Group } from '@mantine/core';
import type { NoticeStatus } from '@forga/cost-recovery-contracts';
import { useTranslation } from '@forga/web-sdk';
import { StatusBadge, type Tone } from '@forga/web-ui';

const TONES: Record<NoticeStatus, Tone> = {
  draft: 'neutral', review: 'warning', issued: 'primary', 'handed-over': 'primary', paid: 'done', objection: 'error', cancelled: 'neutral', amended: 'neutral', discarded: 'neutral',
};

/** Status of a notice, with "überfällig" when it is past due and not paid in full, and "Erstattung" when overpaid. */
export function NoticeStatusBadge({ status, overdue = false, refund = false }: { status: NoticeStatus; overdue?: boolean; refund?: boolean }) {
  const { t } = useTranslation('cost-recovery');
  return (
    <Group gap={4} wrap="nowrap">
      <StatusBadge tone={TONES[status]}>{t(`status.${status}`)}</StatusBadge>
      {overdue && <StatusBadge tone="error">{t('notices.overdue')}</StatusBadge>}
      {refund && <StatusBadge tone="warning">{t('notices.refund')}</StatusBadge>}
    </Group>
  );
}
