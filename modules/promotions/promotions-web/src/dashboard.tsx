import { Loader } from '@mantine/core';
import { useState } from 'react';
import { localDate, useTranslation } from '@forga/web-sdk';
import { KpiTile } from '@forga/web-ui';
import { useCandidates } from './api';

/** Persons whose promotion conditions are met today. */
export function DueTile() {
  const { t } = useTranslation('promotions');
  const [today] = useState(() => localDate());
  const { data, isPending } = useCandidates(today);
  const candidates = data ?? [];
  const due = candidates.filter((c) => c.state === 'fulfilled').length;
  const soon = candidates.filter((c) => c.state === 'preview').length;
  return <KpiTile value={isPending ? <Loader size="sm" /> : due} label={t('dashboard.due')} hint={isPending ? undefined : t('dashboard.soon', { count: soon })} to="/promotions/lists" attention={!isPending && due > 0} />;
}
