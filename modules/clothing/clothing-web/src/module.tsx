import { Navigate } from 'react-router';
import { defineWebModule, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { READ, SELF } from './api';
import { translations } from './i18n';
import { ArticlesPage } from './pages/ArticlesPage';
import { CarePage } from './pages/CarePage';
import { IssuePage } from './pages/IssuePage';
import { ItemPage } from './pages/ItemPage';
import { ItemsPage } from './pages/ItemsPage';
import { MyClothing, PersonTab } from './pages/PersonTab';

function NotFound() {
  const { t } = useTranslation('clothing');
  return <EmptyState title={t('notFound')} />;
}

export default defineWebModule({
  translations,
  routes: [
    { index: true, element: <Navigate to="items" replace /> },
    { path: 'items', element: <ItemsPage /> },
    { path: 'items/:id', element: <ItemPage /> },
    { path: 'issue', element: <IssuePage /> },
    { path: 'care', element: <CarePage /> },
    { path: 'articles', element: <ArticlesPage /> },
    { path: '*', element: <NotFound /> },
  ],
  extensions: {
    'masterdata.person.tab': { label: { de: 'Kleiderkammer', en: 'Clothing store' }, permission: READ, component: PersonTab },
    'core.me.sections': { label: { de: 'Meine Schutzausrüstung', en: 'My protective equipment' }, order: 30, permission: SELF, component: MyClothing },
  },
});
