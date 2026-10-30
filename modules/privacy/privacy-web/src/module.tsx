import type { ReactNode } from 'react';
import { PRIVACY_PERMISSION } from '@forga/privacy-contracts';
import { defineWebModule, useCan, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { extensions } from './extensions';
import { translations } from './i18n';
import { BreachPage } from './pages/BreachPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { RectificationPage } from './pages/Rectification';
import { RequestPage } from './pages/RequestPage';

function NotFound() {
  const { t } = useTranslation('privacy');
  return <EmptyState title={t('notFound')} />;
}

/** The pages of „Verwaltung → Datenschutz“ need `privacy.manage`. */
function Guard({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common');
  return useCan(PRIVACY_PERMISSION) ? children : <EmptyState title={t('errors.auth.forbidden')} />;
}

export default defineWebModule({
  translations,
  extensions,
  routes: [
    { index: true, element: <Guard><PrivacyPage tab="requests" /></Guard> },
    { path: 'information', element: <Guard><PrivacyPage tab="information" /></Guard> },
    { path: 'register', element: <Guard><PrivacyPage tab="register" /></Guard> },
    { path: 'breaches', element: <Guard><PrivacyPage tab="breaches" /></Guard> },
    { path: 'breaches/:id', element: <Guard><BreachPage /></Guard> },
    { path: 'requests/:id', element: <Guard><RequestPage /></Guard> },
    { path: 'settings', element: <Guard><PrivacyPage tab="settings" /></Guard> },
    // Rectifications are also corrected by the departments (no `privacy.manage` needed).
    { path: 'rectifications/:id', element: <RectificationPage /> },
    { path: '*', element: <NotFound /> },
  ],
});
