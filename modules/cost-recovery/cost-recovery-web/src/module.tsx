import { Navigate } from 'react-router';
import { defineWebModule, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { WRITE } from './api';
import { WithoutNoticeTile } from './dashboard';
import { translations } from './i18n';
import { CandidatesPage } from './pages/CandidatesPage';
import { DebtorsPage } from './pages/DebtorsPage';
import { NoticePage } from './pages/NoticePage';
import { NoticesPage } from './pages/NoticesPage';
import { OffenseSection } from './pages/OffenseSection';
import { SettingsPage } from './pages/SettingsPage';

function NotFound() {
  const { t } = useTranslation('cost-recovery');
  return <EmptyState title={t('notFound')} />;
}

export default defineWebModule({
  translations,
  routes: [
    { index: true, element: <Navigate to="candidates" replace /> },
    { path: 'candidates', element: <CandidatesPage /> },
    { path: 'notices', element: <NoticesPage /> },
    { path: 'notices/:id', element: <NoticePage /> },
    { path: 'debtors', element: <DebtorsPage /> },
    { path: 'settings', element: <SettingsPage /> },
    { path: '*', element: <NotFound /> },
  ],
  dashboard: [{ id: 'without-notice', area: 'kpi', permission: WRITE, order: 70, component: WithoutNoticeTile }],
  extensions: {
    'incidents.incident.sections': { label: { de: 'Kostenersatz', en: 'Cost recovery' }, order: 20, component: OffenseSection },
  },
});
