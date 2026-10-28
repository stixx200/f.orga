import { Navigate } from 'react-router';
import { defineWebModule, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { READ } from './api';
import { translations } from './i18n';
import { SettingsPage } from './pages/SettingsPage';
import { StationSection } from './pages/StationSection';
import { TerminalsPage } from './pages/TerminalsPage';

function NotFound() {
  const { t } = useTranslation('info-terminal');
  return <EmptyState title={t('notFound')} />;
}

export default defineWebModule({
  translations,
  routes: [
    { index: true, element: <Navigate to="terminals" replace /> },
    { path: 'terminals', element: <TerminalsPage /> },
    { path: 'settings', element: <SettingsPage /> },
    { path: '*', element: <NotFound /> },
  ],
  extensions: {
    // Card of the info terminals at a station in the organization (props: `{ station }`).
    'masterdata.station.sections': { label: { de: 'Infoterminal', en: 'Info terminal' }, permission: READ, component: StationSection },
  },
});
