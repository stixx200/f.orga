import { useState } from 'react';
import { localDate, useTranslation } from '@forga/web-sdk';
import { KpiTile } from '@forga/web-ui';
import { useCandidates } from './api';

/** Persons whose promotion conditions are met today. */
export function DueTile() {
  const { t } = useTranslation('promotions');
  const [today] = useState(() => localDate());
  const { data = [] } = useCandidates(today);
  const due = data.filter((c) => c.state === 'fulfilled').length;
  const soon = data.filter((c) => c.state === 'preview').length;
  return <KpiTile value={due} label={t('dashboard.due')} hint={t('dashboard.soon', { count: soon })} to="/promotions/lists" attention={due > 0} />;
}
