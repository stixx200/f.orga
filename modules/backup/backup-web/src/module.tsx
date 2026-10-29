import type { ReactNode } from 'react';
import { defineWebModule, useCan, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { MANAGE } from './api';
import { translations } from './i18n';
import { BackupsPage } from './pages/BackupsPage';
import { OverviewPage } from './pages/OverviewPage';
import { RestorePage } from './pages/RestorePage';
import { SettingsPage } from './pages/SettingsPage';

function NotFound() {
  const { t } = useTranslation('backup');
  return <EmptyState title={t('notFound')} />;
}

/** Every page needs `backup.manage`. */
function Guard({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common');
  return useCan(MANAGE) ? children : <EmptyState title={t('errors.auth.forbidden')} />;
}

export default defineWebModule({
  translations,
  routes: [
    { index: true, element: <Guard><OverviewPage /></Guard> },
    { path: 'backups', element: <Guard><BackupsPage /></Guard> },
    { path: 'settings', element: <Guard><SettingsPage /></Guard> },
    { path: 'restore/:id', element: <Guard><RestorePage /></Guard> },
    { path: '*', element: <NotFound /> },
  ],
});
