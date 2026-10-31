import { Loader } from '@mantine/core';
import { useState } from 'react';
import { localDate, useTranslation } from '@forga/web-sdk';
import { KpiTile } from '@forga/web-ui';
import { useItems } from './api';

export function DueTile() {
  const { t } = useTranslation('equipment');
  const [today] = useState(() => localDate());
  const { data, isPending } = useItems({ dueBefore: today });
  const items = data ?? [];
  const defective = items.filter((i) => i.status === 'defective' || i.blocked).length;
  return <KpiTile value={isPending ? <Loader size="sm" /> : items.length} label={t('dashboard.due')} hint={isPending ? undefined : t('dashboard.dueHint', { count: defective })} to="/equipment/inspections" attention={!isPending && items.length > 0} />;
}
