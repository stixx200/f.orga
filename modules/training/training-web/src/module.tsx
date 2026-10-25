import { Navigate } from 'react-router';
import { defineWebModule, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { CLOSE, READ } from './api';
import { OpenSessionsTile, UpcomingSessions } from './dashboard';
import { translations } from './i18n';
import { CheckInPage } from './pages/CheckInPage';
import { ParticipationPage } from './pages/ParticipationPage';
import { MySessions } from './pages/MySessions';
import { PersonSessions } from './pages/PersonSessions';
import { SessionPage } from './pages/SessionPage';
import { SessionsPage } from './pages/SessionsPage';
import { SettingsPage } from './pages/SettingsPage';

function NotFound() {
  const { t } = useTranslation('training');
  return <EmptyState title={t('notFound')} />;
}

export default defineWebModule({
  translations,
  routes: [
    { index: true, element: <Navigate to="sessions" replace /> },
    { path: 'sessions', element: <SessionsPage /> },
    { path: 'sessions/:id', element: <SessionPage /> },
    { path: 'check-in', element: <CheckInPage /> },
    { path: 'participation', element: <ParticipationPage /> },
    { path: 'settings', element: <SettingsPage /> },
    { path: '*', element: <NotFound /> },
  ],
  dashboard: [
    { id: 'to-close', area: 'kpi', permission: CLOSE, order: 30, component: OpenSessionsTile },
    { id: 'upcoming', area: 'main', permission: READ, order: 20, component: UpcomingSessions },
  ],
  extensions: {
    'masterdata.person.tab': { label: { de: 'Dienste', en: 'Sessions' }, permission: READ, component: PersonSessions },
    'core.me.sections': { label: { de: 'Meine Dienste', en: 'My sessions' }, order: 20, permission: 'training.self', component: MySessions },
  },
});
