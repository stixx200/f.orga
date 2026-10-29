import { Alert, Loader } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useMemo } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import type { Session } from '@forga/core-contracts';
import { ApiError, can, currentLanguage, setLanguage, useMaintenance, useSession, useSetupState, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { LoginPage } from './auth/LoginPage';
import { MaintenancePage } from './auth/MaintenancePage';
import { ConfirmEmailPage } from './auth/ConfirmEmailPage';
import { ResetPasswordPage } from './auth/ResetPasswordPage';
import { SetupPage } from './auth/SetupPage';
import { StepUpHost } from './auth/StepUp';
import { AppFrame } from './frame/AppFrame';
import { StageBand } from './frame/StageBand';
import { moduleSettings } from './frame/Sidebar';
import { KIOSK_PATHS, type LoadedModule, loadKiosk, loadModules } from './modules';
import { AuditPage } from './pages/admin/AuditPage';
import { ModulesPage } from './pages/admin/ModulesPage';
import { RetentionPage } from './pages/admin/RetentionPage';
import { RolesPage } from './pages/admin/RolesPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { TokensPage } from './pages/admin/TokensPage';
import { UsersPage } from './pages/admin/UsersPage';
import { ImportPage } from './pages/ImportPage';
import { ListsPage } from './pages/ListsPage';
import { MyAreaPage } from './pages/MyAreaPage';
import { ProfilePage } from './pages/ProfilePage';
import { ScanPage } from './pages/ScanPage';
import { StartPage } from './pages/StartPage';

function NotFound() {
  const { t } = useTranslation('shell');
  return <EmptyState title={t('notFound')} />;
}

/** Pages of the administration need the matching core permission. */
function Guard({ session, permission, children }: { session: Session; permission: string; children: ReactNode }) {
  const { t } = useTranslation('common');
  return can(session, permission) ? children : <EmptyState title={t('errors.auth.forbidden')} />;
}

function Router({ modules, session }: { modules: LoadedModule[]; session: Session }) {
  const router = useMemo(
    () =>
      createBrowserRouter([
        {
          path: '/',
          element: <AppFrame modules={modules} session={session} />,
          children: [
            { index: true, element: <StartPage modules={modules} session={session} /> },
            { path: 'profile', element: <ProfilePage session={session} modules={modules} /> },
            { path: 'me', element: <MyAreaPage session={session} /> },
            { path: 'lists', element: <ListsPage modules={modules} /> },
            { path: 'scan', element: <ScanPage /> },
            { path: 'import', element: <ImportPage /> },
            { path: 'admin/users', element: <Guard session={session} permission="core.users.manage"><UsersPage /></Guard> },
            { path: 'admin/roles', element: <Guard session={session} permission="core.roles.manage"><RolesPage modules={modules} /></Guard> },
            {
              path: 'admin/modules',
              element: can(session, 'core.modules.manage') || moduleSettings(modules, session).length ? <ModulesPage modules={modules} session={session} /> : <Guard session={session} permission="core.modules.manage"><ModulesPage modules={modules} session={session} /></Guard>,
            },
            { path: 'admin/tokens', element: <Guard session={session} permission="core.tokens.manage"><TokensPage /></Guard> },
            { path: 'admin/settings', element: <Guard session={session} permission="core.settings.manage"><SettingsPage modules={modules} /></Guard> },
            { path: 'admin/audit', element: <Guard session={session} permission="core.audit.read"><AuditPage /></Guard> },
            { path: 'admin/retention', element: <Guard session={session} permission="core.retention.manage"><RetentionPage /></Guard> },
            ...modules.flatMap(({ info, web }) => (web ? [{ path: `${info.id}/*`, children: web.routes }] : [])),
            { path: '*', element: <NotFound /> },
          ],
        },
      ]),
    [modules, session],
  );
  return <RouterProvider router={router} />;
}

function LoggedIn({ session }: { session: Session }) {
  const { t } = useTranslation('shell');
  const { data: modules, error } = useQuery({ queryKey: ['core', 'modules'], queryFn: loadModules });

  // After login the language stored in the user's profile applies.
  useEffect(() => {
    if (session.user.language !== currentLanguage()) void setLanguage(session.user.language);
  }, [session.user.language]);

  if (error) return <Alert color="brand" title={t('serverUnavailable')}>{error.message}</Alert>;
  if (!modules) return <Loader m="xl" />;
  return (
    <>
      <Router modules={modules} session={session} />
      <StepUpHost session={session} />
    </>
  );
}

/** A page of a module without shell frame and login, e.g. the info terminal at `/terminal`. */
function KioskPage({ path }: { path: string }) {
  const { t } = useTranslation('shell');
  const { data, error } = useQuery({ queryKey: ['core', 'kiosk', path], queryFn: () => loadKiosk(path), retry: false, staleTime: Infinity });
  if (error instanceof ApiError && error.status === 404) return <EmptyState title={t(error.code === 'modules.inactive' ? 'kioskInactive' : 'notFound')} />;
  if (error) return <Alert color="brand" title={t('serverUnavailable')} m="xl">{error.message}</Alert>;
  if (!data) return <Loader m="xl" />;
  const Kiosk = data.component;
  return <Kiosk />;
}

export function App() {
  return (
    <>
      <StageBand />
      <Pages />
    </>
  );
}

function Pages() {
  const kiosk = KIOSK_PATHS.find((path) => window.location.pathname === `/${path}` || window.location.pathname.startsWith(`/${path}/`));
  // While a backup is being restored every request answers `503 maintenance`.
  const maintenance = useMaintenance();
  if (maintenance) return <MaintenancePage kiosk={Boolean(kiosk)} />;
  if (kiosk) return <KioskPage path={kiosk} />;
  if (window.location.pathname === '/reset-password') return <ResetPasswordPage />;
  if (window.location.pathname === '/confirm-email') return <ConfirmEmailPage />;
  return <Main />;
}

function Main() {
  const { t } = useTranslation('shell');
  const setup = useSetupState();
  const session = useSession();

  if (setup.error || session.error) {
    return <Alert color="brand" title={t('serverUnavailable')} m="xl">{(setup.error ?? session.error)?.message}</Alert>;
  }
  if (!setup.data || session.data === undefined) return <Loader m="xl" />;
  if (setup.data.required) return <SetupPage />;
  if (!session.data) return <LoginPage brigadeName={setup.data.brigadeName} oidc={setup.data.oidc} />;
  return <LoggedIn session={session.data} />;
}

export default App;
