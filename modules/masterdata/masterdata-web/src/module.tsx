import { Navigate } from 'react-router';
import { defineWebModule, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { translations } from './i18n';
import { CatalogsPage } from './catalogs/CatalogsPage';
import { CoursePlanningPage } from './courses/CoursePlanningPage';
import { OrganizationPage } from './organization/OrganizationPage';
import { VehiclesPage } from './organization/VehiclesPage';
import { PersonCreatePage } from './persons/PersonCreatePage';
import { PersonPage } from './persons/PersonPage';
import { PersonsPage } from './persons/PersonsPage';
import { MyData } from './self/MyData';
import { SettingsPage } from './settings/SettingsPage';

/** Pages of the module that follow in a later stage. */
function Pending() {
  const { t } = useTranslation('masterdata');
  return <EmptyState title={t('pending')} />;
}

export default defineWebModule({
  translations,
  routes: [
    { index: true, element: <Navigate to="organization" replace /> },
    { path: 'organization', element: <OrganizationPage /> },
    { path: 'persons', element: <PersonsPage /> },
    { path: 'persons/new', element: <PersonCreatePage /> },
    { path: 'persons/:id', element: <PersonPage /> },
    { path: 'vehicles', element: <VehiclesPage /> },
    { path: 'courses', element: <CoursePlanningPage /> },
    { path: 'catalogs', element: <CatalogsPage /> },
    { path: 'settings', element: <SettingsPage /> },
    { path: '*', element: <Pending /> },
  ],
  extensions: {
    'core.me.sections': { label: { de: 'Meine Daten', en: 'My data' }, order: 10, permission: 'masterdata.self', component: MyData },
  },
});
