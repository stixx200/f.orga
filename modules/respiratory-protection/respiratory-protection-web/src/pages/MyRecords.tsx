import { Text } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import type { Evidence, PersonRespiratoryProtection } from '@forga/respiratory-protection-contracts';
import { api, formatDate, useTranslation } from '@forga/web-sdk';
import { DataTable, Panel } from '@forga/web-ui';
import { ConditionList, FitnessBadge } from '../parts';

/** "My area": own fitness as breathing apparatus wearer and the own records (read only). */
export function MyRecords() {
  const { t, i18n } = useTranslation('respiratory-protection');
  const { data } = useQuery({ queryKey: ['respiratory-protection', 'me'], queryFn: () => api<PersonRespiratoryProtection>('respiratory-protection/me') });
  // Members without the qualification see nothing here.
  if (!data || data.status.color === 'grey') return null;
  return (
    <Panel title={t('person.title')} aside={<FitnessBadge color={data.status.color} />}>
      <ConditionList conditions={data.status.conditions} />
      <Text size="sm" fw={700} mt="md" mb={4}>{t('person.evidence')}</Text>
      <DataTable<Evidence>
        rows={data.evidence.filter((e) => !e.withdrawn).slice(0, 10)}
        rowKey={(e) => e.id}
        empty={t('person.noEvidence')}
        columns={[
          { key: 'date', header: t('evidence.date'), render: (e) => formatDate(e.date, i18n.language) },
          { key: 'kind', header: t('evidence.kind'), render: (e) => t(`kind.${e.kind}`) },
          { key: 'valid', header: t('evidence.details'), render: (e) => (e.validUntil ? t('evidence.validUntilShort', { date: formatDate(e.validUntil, i18n.language) }) : '') },
        ]}
      />
    </Panel>
  );
}
