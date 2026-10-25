import { useState } from 'react';
import { localDate, useTranslation } from '@forga/web-sdk';
import { KpiTile } from '@forga/web-ui';
import { useItems } from './api';

export function DueTile() {
  const { t } = useTranslation('equipment');
  const [today] = useState(() => localDate());
  const { data = [] } = useItems({ dueBefore: today });
  const defective = data.filter((i) => i.status === 'defective').length;
  return <KpiTile value={data.length} label={t('dashboard.due')} hint={t('dashboard.dueHint', { count: defective })} to="/equipment/inspections" attention={data.length > 0} />;
}
