import { defineWebModule, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { READ } from './api';
import { translations } from './i18n';
import { LinksPage } from './pages/LinksPage';
import { PersonTab } from './pages/PersonTab';

function NotFound() {
  const { t } = useTranslation('personal');
  return <EmptyState title={t('notFound')} />;
}

export default defineWebModule({
  translations,
  routes: [
    { index: true, element: <LinksPage /> },
    { path: 'links', element: <LinksPage /> },
    { path: '*', element: <NotFound /> },
  ],
  extensions: {
    'masterdata.person.tab': { label: { de: 'Persönlicher Zugang', en: 'Personal access' }, permission: READ, component: PersonTab },
  },
});
