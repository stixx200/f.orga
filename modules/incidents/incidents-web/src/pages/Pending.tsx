import { useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';

/** Pages of the module that follow in a later stage. */
export function Pending() {
  const { t } = useTranslation('incidents');
  return <EmptyState title={t('pending')} />;
}
