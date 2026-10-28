import { Text } from '@mantine/core';
import { useCan, useTranslation } from '@forga/web-sdk';
import { RememberedMappings } from '@forga/web-ui';
import { TRANSFER } from '../api';
import { ModulePage } from '../components/ModulePage';

/** "Zuordnungen": the mapping list of the module, apart from the one of the table import. */
export function MappingsPage() {
  const { t } = useTranslation('mp-feuer');
  const mayDelete = useCan(TRANSFER);
  return (
    <ModulePage tab="mappings">
      <Text size="sm">{t('mappings.intro')}</Text>
      <RememberedMappings path="mp-feuer/mappings" deletable={mayDelete} />
    </ModulePage>
  );
}
