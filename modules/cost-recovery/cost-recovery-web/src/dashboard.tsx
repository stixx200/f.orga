import { useState } from 'react';
import { useTranslation } from '@forga/web-sdk';
import { KpiTile } from '@forga/web-ui';
import { useCandidates } from './api';

/** Chargeable incidents without notice. */
export function WithoutNoticeTile() {
  const { t } = useTranslation('cost-recovery');
  const [period] = useState(() => ({ from: `${new Date().getFullYear() - 1}-01-01`, to: `${new Date().getFullYear()}-12-31` }));
  const { data = [] } = useCandidates(period);
  const open = data.filter((c) => !c.noticeId).length;
  return <KpiTile value={open} label={t('dashboard.withoutNotice')} hint={t('dashboard.hint')} to="/cost-recovery/candidates" attention={open > 0} />;
}
