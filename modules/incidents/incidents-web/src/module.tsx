import { Navigate } from 'react-router';
import { defineWebModule } from '@forga/web-sdk';
import { READ, RELEASE, WRITE } from './api';
import { MyOpenTile, RecentIncidents, ReviewTile, useNavigationBadges } from './dashboard';
import { translations } from './i18n';
import { CompensationPage } from './pages/CompensationPage';
import { DutyPage } from './pages/DutyPage';
import { IncidentPage } from './pages/IncidentPage';
import { OpenReportsPage } from './pages/OpenReportsPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatisticsPage } from './pages/StatisticsPage';
import { IncidentsPage } from './pages/IncidentsPage';
import { Pending } from './pages/Pending';
import { PersonIncidents } from './pages/PersonIncidents';
import { ReviewPage } from './pages/ReviewPage';
import { ReportPage } from './report/ReportPage';

export default defineWebModule({
  translations,
  routes: [
    { index: true, element: <Navigate to="incidents" replace /> },
    { path: 'incidents', element: <IncidentsPage /> },
    { path: 'incidents/:id', element: <IncidentPage /> },
    { path: 'reports/:id', element: <ReportPage /> },
    { path: 'review', element: <ReviewPage /> },
    { path: 'open', element: <OpenReportsPage /> },
    { path: 'compensation', element: <CompensationPage /> },
    { path: 'duty', element: <DutyPage /> },
    { path: 'statistics', element: <StatisticsPage /> },
    { path: 'settings', element: <SettingsPage /> },
    { path: '*', element: <Pending /> },
  ],
  dashboard: [
    { id: 'review', area: 'kpi', permission: RELEASE, order: 10, component: ReviewTile },
    { id: 'my-open', area: 'kpi', permission: WRITE, order: 20, component: MyOpenTile },
    { id: 'recent', area: 'main', order: 10, component: RecentIncidents },
  ],
  useNavigationBadges,
  extensions: {
    'masterdata.person.tab': { label: { de: 'Einsätze', en: 'Incidents' }, permission: READ, component: PersonIncidents },
  },
});
