import { useTranslation } from '@forga/web-sdk';
import { KpiTile } from '@forga/web-ui';
import { useStatus } from './api';

export function NotFitTile() {
  const { t } = useTranslation('respiratory-protection');
  const { data = [] } = useStatus();
  const red = data.filter((s) => s.color === 'red').length;
  return <KpiTile value={red} label={t('dashboard.red')} hint={t('dashboard.redHint', { count: data.filter((s) => s.color === 'yellow').length })} to="/respiratory-protection/overview" attention={red > 0} />;
}
