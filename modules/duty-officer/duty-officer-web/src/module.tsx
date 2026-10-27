import { Navigate } from 'react-router';
import { defineWebModule, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { translations } from './i18n';
import { IncidentSection } from './pages/IncidentSection';
import { RosterPage } from './pages/RosterPage';
import { SettingsPage } from './pages/SettingsPage';

function NotFound() {
  const { t } = useTranslation('duty-officer');
  return <EmptyState title={t('notFound')} />;
}

export default defineWebModule({
  translations,
  routes: [
    { index: true, element: <Navigate to="roster" replace /> },
    { path: 'roster', element: <RosterPage /> },
    { path: 'settings', element: <SettingsPage /> },
    { path: '*', element: <NotFound /> },
  ],
  extensions: {
    // Readers, writers and managers of the EvD reports; the card checks the permissions itself.
    'incidents.incident.sections': { label: { de: 'Einsatzleiter vom Dienst', en: 'Duty officer' }, order: 10, component: IncidentSection },
  },
});
