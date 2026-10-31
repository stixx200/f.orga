import { Navigate } from 'react-router';
import { defineWebModule, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { READ } from './api';
import { NotFitTile } from './dashboard';
import { translations } from './i18n';
import { OverviewPage } from './pages/OverviewPage';
import { MyRecords } from './pages/MyRecords';
import { PersonTab, PersonTabGate } from './pages/PersonTab';
import { QuickEntryPage } from './pages/QuickEntryPage';
import { SettingsPage } from './pages/SettingsPage';

function NotFound() {
  const { t } = useTranslation('respiratory-protection');
  return <EmptyState title={t('notFound')} />;
}

export default defineWebModule({
  translations,
  routes: [
    { index: true, element: <Navigate to="overview" replace /> },
    { path: 'overview', element: <OverviewPage /> },
    { path: 'quick-entry', element: <QuickEntryPage /> },
    { path: 'settings', element: <SettingsPage /> },
    { path: '*', element: <NotFound /> },
  ],
  dashboard: [{ id: 'not-fit', area: 'kpi', permission: READ, order: 40, component: NotFitTile }],
  extensions: {
    'masterdata.person.tab': { label: { de: 'Atemschutz', en: 'Respiratory protection' }, permission: READ, component: PersonTab, gate: PersonTabGate },
    'core.me.sections': { label: { de: 'Mein Atemschutz', en: 'My respiratory protection' }, order: 30, permission: 'respiratory-protection.self', component: MyRecords },
  },
});
