import { Loader } from '@mantine/core';
import { useTranslation } from '@forga/web-sdk';
import { KpiTile } from '@forga/web-ui';
import { useStatus } from './api';

export function NotFitTile() {
  const { t } = useTranslation('respiratory-protection');
  const { data, isPending } = useStatus();
  const statuses = data ?? [];
  const red = statuses.filter((s) => s.color === 'red').length;
  return <KpiTile value={isPending ? <Loader size="sm" /> : red} label={t('dashboard.red')} hint={isPending ? undefined : t('dashboard.redHint', { count: statuses.filter((s) => s.color === 'yellow').length })} to="/respiratory-protection/overview" attention={!isPending && red > 0} />;
}
