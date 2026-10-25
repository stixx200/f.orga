import type { SessionStatus } from '@forga/training-contracts';
import { useTranslation } from '@forga/web-sdk';
import { StatusBadge, type Tone } from '@forga/web-ui';

const TONES: Record<SessionStatus, Tone> = { planned: 'neutral', held: 'warning', closed: 'done' };

export function SessionStatusBadge({ status }: { status: SessionStatus }) {
  const { t } = useTranslation('training');
  return <StatusBadge tone={TONES[status]}>{t(`status.${status}`)}</StatusBadge>;
}
