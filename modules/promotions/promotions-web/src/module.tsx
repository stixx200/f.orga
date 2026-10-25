import { Navigate } from 'react-router';
import { defineWebModule, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { DECIDE, READ } from './api';
import { DueTile } from './dashboard';
import { translations } from './i18n';
import { ExclusionsPage } from './pages/ExclusionsPage';
import { ListPage } from './pages/ListPage';
import { ListsPage } from './pages/ListsPage';
import { PersonTab } from './pages/PersonTab';
import { RulesPage } from './pages/RulesPage';

function NotFound() {
  const { t } = useTranslation('promotions');
  return <EmptyState title={t('notFound')} />;
}

export default defineWebModule({
  translations,
  routes: [
    { index: true, element: <Navigate to="lists" replace /> },
    { path: 'lists', element: <ListsPage /> },
    { path: 'lists/:id', element: <ListPage /> },
    { path: 'exclusions', element: <ExclusionsPage /> },
    { path: 'rules', element: <RulesPage /> },
    { path: '*', element: <NotFound /> },
  ],
  dashboard: [{ id: 'due', area: 'kpi', permission: DECIDE, order: 80, component: DueTile }],
  extensions: {
    'masterdata.person.tab': { label: { de: 'Dienstgrad', en: 'Rank' }, permission: READ, component: PersonTab },
  },
});
