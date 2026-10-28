import { Navigate } from 'react-router';
import { defineWebModule, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { READ } from './api';
import { ImportNotice } from './components/ImportNotice';
import { translations } from './i18n';
import { ExportPage } from './pages/ExportPage';
import { HistoryPage } from './pages/HistoryPage';
import { MappingsPage } from './pages/MappingsPage';
import { NewRunPage } from './pages/NewRunPage';
import { OverviewPage } from './pages/OverviewPage';
import { RunPage } from './pages/RunPage';
import { SettingsPage } from './pages/SettingsPage';

function NotFound() {
  const { t } = useTranslation('mp-feuer');
  return <EmptyState title={t('notFound')} />;
}

export default defineWebModule({
  translations,
  routes: [
    { index: true, element: <Navigate to="overview" replace /> },
    { path: 'overview', element: <OverviewPage /> },
    { path: 'transfer', element: <NewRunPage /> },
    { path: 'runs/:id', element: <RunPage /> },
    { path: 'history', element: <HistoryPage /> },
    { path: 'mappings', element: <MappingsPage /> },
    { path: 'export', element: <ExportPage /> },
    { path: 'settings', element: <SettingsPage /> },
    { path: '*', element: <NotFound /> },
  ],
  extensions: {
    // Hint on the import page of the shell (no props).
    'core.imports.notice': { label: { de: 'MP-Feuer', en: 'MP-Feuer' }, permission: READ, component: ImportNotice },
  },
});
