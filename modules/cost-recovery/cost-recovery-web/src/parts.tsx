import type { NoticeStatus } from '@forga/cost-recovery-contracts';
import { useTranslation } from '@forga/web-sdk';
import { StatusBadge, type Tone } from '@forga/web-ui';

const TONES: Record<NoticeStatus, Tone> = { draft: 'neutral', review: 'warning', issued: 'primary', 'handed-over': 'primary', paid: 'done', objection: 'error', cancelled: 'neutral', amended: 'neutral' };

export function NoticeStatusBadge({ status }: { status: NoticeStatus }) {
  const { t } = useTranslation('cost-recovery');
  return <StatusBadge tone={TONES[status]}>{t(`status.${status}`)}</StatusBadge>;
}
