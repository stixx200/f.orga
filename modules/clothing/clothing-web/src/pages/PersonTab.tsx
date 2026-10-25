import { Text } from '@mantine/core';
import { useTranslation } from '@forga/web-sdk';
import { usePersonClothing } from '../api';
import { PersonClothingView } from './PersonClothingView';

/** Tab "Kleiderkammer" in the person file (extension point `masterdata.person.tab`). */
export function PersonTab({ personId }: { personId?: unknown }) {
  const { t } = useTranslation('clothing');
  const { data, isLoading } = usePersonClothing(String(personId));
  if (isLoading) return <Text c="dimmed">{t('loading')}</Text>;
  return data ? <PersonClothingView data={data} /> : null;
}

/** "My area": the own protective equipment. */
export function MyClothing() {
  const { t } = useTranslation('clothing');
  const { data, isLoading } = usePersonClothing(null, true);
  if (isLoading) return <Text c="dimmed">{t('loading')}</Text>;
  return data ? <PersonClothingView data={data} links={false} /> : null;
}
