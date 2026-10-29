import { Stack, Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { MyImpersonation } from '@forga/core-contracts';
import { api, formatDateTime, formatTime, useTranslation } from '@forga/web-sdk';
import { DataTable, Panel } from '@forga/web-ui';

export const IMPERSONATIONS_KEY = ['core', 'me', 'impersonations'] as const;

/** "Anmeldungen als Sie" (L15): when an administrator logged in as the user, with the reason. Profile and My area. */
export function ImpersonationsPanel() {
  const { t, i18n } = useTranslation('shell');
  const { data = [] } = useQuery({ queryKey: IMPERSONATIONS_KEY, queryFn: () => api<MyImpersonation[]>('core/me/impersonations') });
  const period = (i: MyImpersonation) => `${formatDateTime(i.startedAt, i18n.language)}–${i.endedAt ? formatTime(i.endedAt, i18n.language) : t('transparency.impersonations.running')}`;
  return (
    <Panel title={t('transparency.impersonations.title')}>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">{t('transparency.impersonations.intro')}</Text>
        <DataTable
          rows={data}
          rowKey={(i) => i.startedAt}
          exportable={false}
          empty={t('transparency.impersonations.none')}
          columns={[
            { key: 'date', header: t('transparency.impersonations.columns.date'), width: 220, render: period },
            { key: 'administrator', header: t('transparency.impersonations.columns.administrator'), render: (i) => i.administrator },
            { key: 'reason', header: t('transparency.impersonations.columns.reason'), render: (i) => i.reason },
          ]}
        />
      </Stack>
    </Panel>
  );
}
