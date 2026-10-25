import { formatMoney, useTranslation } from '@forga/web-sdk';
import { KpiTile } from '@forga/web-ui';
import { useOpenItems } from './api';

/** Open items for the next payout run; red edge when loss of earnings still lacks an amount. */
export function OpenItemsTile() {
  const { t, i18n } = useTranslation('compensation');
  const { data = [] } = useOpenItems();
  const open = data.filter((i) => !i.runId);
  const missing = data.filter((i) => i.amount === null).length;
  const total = open.reduce((s, i) => s + (i.amount ?? 0), 0);
  return <KpiTile value={formatMoney(total, i18n.language)} label={t('dashboard.open')} hint={missing ? t('dashboard.missing', { count: missing }) : t('dashboard.items', { count: open.length })} to="/compensation/items" attention={missing > 0} />;
}
