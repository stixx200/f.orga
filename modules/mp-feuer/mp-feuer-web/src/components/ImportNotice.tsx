import { Button } from '@mantine/core';
import { Link } from 'react-router';
import { useTranslation } from '@forga/web-sdk';
import { Notice } from '@forga/web-ui';

/** Hint on the import page of the shell: transfer files of MP-Feuer are taken over by this module. */
export function ImportNotice() {
  const { t } = useTranslation('mp-feuer');
  return (
    <Notice kind="info" action={<Button size="xs" variant="default" component={Link} to="/mp-feuer/overview">{t('importNotice.link')}</Button>}>
      {t('importNotice.text')}
    </Notice>
  );
}
