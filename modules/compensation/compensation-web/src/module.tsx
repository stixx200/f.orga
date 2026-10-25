import { Navigate } from 'react-router';
import { defineWebModule, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { READ, RUNS } from './api';
import { OpenItemsTile } from './dashboard';
import { IncidentRatesNotice } from './parts';
import { translations } from './i18n';
import { FunctionsPage } from './pages/FunctionsPage';
import { ItemsPage } from './pages/ItemsPage';
import { PersonTab } from './pages/PersonTab';
import { RunPage } from './pages/RunPage';
import { RunsPage } from './pages/RunsPage';
import { SettingsPage } from './pages/SettingsPage';

function NotFound() {
  const { t } = useTranslation('compensation');
  return <EmptyState title={t('notFound')} />;
}

export default defineWebModule({
  translations,
  routes: [
    { index: true, element: <Navigate to="runs" replace /> },
    { path: 'runs', element: <RunsPage /> },
    { path: 'runs/:id', element: <RunPage /> },
    { path: 'items', element: <ItemsPage /> },
    { path: 'functions', element: <FunctionsPage /> },
    { path: 'settings', element: <SettingsPage /> },
    { path: '*', element: <NotFound /> },
  ],
  dashboard: [{ id: 'open-items', area: 'kpi', permission: RUNS, order: 50, component: OpenItemsTile }],
  extensions: {
    'masterdata.person.tab': { label: { de: 'Entschädigung', en: 'Compensation' }, permission: READ, component: PersonTab },
    'incidents.settings.rates': { label: { de: 'Stundensätze', en: 'Hourly rates' }, component: IncidentRatesNotice },
  },
});
