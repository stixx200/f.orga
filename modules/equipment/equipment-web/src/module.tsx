import { Navigate } from 'react-router';
import { defineWebModule, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { READ } from './api';
import { DueTile } from './dashboard';
import { translations } from './i18n';
import { BulkPage } from './pages/BulkPage';
import { DefectsPage } from './pages/DefectsPage';
import { InspectionsPage } from './pages/InspectionsPage';
import { MyDefects } from './pages/MyDefects';
import { ItemPage } from './pages/ItemPage';
import { ItemsPage } from './pages/ItemsPage';
import { LabelsPage } from './pages/LabelsPage';
import { ReportSection, SessionSection } from './pages/ReportSection';
import { SettingsPage } from './pages/SettingsPage';

function NotFound() {
  const { t } = useTranslation('equipment');
  return <EmptyState title={t('notFound')} />;
}

export default defineWebModule({
  translations,
  routes: [
    { index: true, element: <Navigate to="items" replace /> },
    { path: 'items', element: <ItemsPage /> },
    { path: 'items/:id', element: <ItemPage /> },
    { path: 'inspections', element: <InspectionsPage /> },
    { path: 'bulk', element: <BulkPage /> },
    { path: 'defects', element: <DefectsPage /> },
    { path: 'labels', element: <LabelsPage /> },
    { path: 'settings', element: <SettingsPage /> },
    { path: '*', element: <NotFound /> },
  ],
  dashboard: [{ id: 'due', area: 'kpi', permission: READ, order: 60, component: DueTile }],
  extensions: {
    'incidents.report.sections': { label: { de: 'Geräte', en: 'Equipment' }, permission: READ, component: ReportSection },
    'training.session.sections': { label: { de: 'Geräte', en: 'Equipment' }, permission: READ, component: SessionSection },
    'core.me.sections': { label: { de: 'Mängel melden', en: 'Report defects' }, order: 40, permission: 'equipment.defects.report', component: MyDefects },
  },
});
