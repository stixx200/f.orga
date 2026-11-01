import { Alert, Loader } from '@mantine/core';
import { useQueries, useQuery } from '@tanstack/react-query';
import { type ComponentType, createContext, type ReactNode, Suspense, lazy, useContext, useEffect, useMemo } from 'react';
import { createBrowserRouter, RouterProvider, useRoutes, type RouteObject } from 'react-router';
import type { ActiveModule, Session } from '@forga/core-contracts';
import { ApiError, can, currentLanguage, extensionsOf, setLanguage, useLocalized, useMaintenance, useSession, useSetupState, useTranslation } from '@forga/web-sdk';
import { EmptyState } from '@forga/web-ui';
import { LoginPage } from './auth/LoginPage';
import { MaintenancePage } from './auth/MaintenancePage';
import { ConfirmEmailPage } from './auth/ConfirmEmailPage';
import { ResetPasswordPage } from './auth/ResetPasswordPage';
import { SetupPage } from './auth/SetupPage';
import { StepUpHost } from './auth/StepUp';
import { AppFrame } from './frame/AppFrame';
import { SplashScreen } from './frame/SplashScreen';
import { StageBand } from './frame/StageBand';
import { moduleSettings } from './frame/Sidebar';
import {
  KIOSK_PATHS,
  type LoadedModule,
  fetchActiveModules,
  loadKiosk,
  loadModuleFrontend,
  moduleFrontendQueryKey,
} from './modules';
import { StartPage } from './pages/StartPage';

const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const MyAreaPage = lazy(() => import('./pages/MyAreaPage').then((m) => ({ default: m.MyAreaPage })));
const ListsPage = lazy(() => import('./pages/ListsPage').then((m) => ({ default: m.ListsPage })));
const ScanPage = lazy(() => import('./pages/ScanPage').then((m) => ({ default: m.ScanPage })));
const ImportPage = lazy(() => import('./pages/ImportPage').then((m) => ({ default: m.ImportPage })));
const UsersPage = lazy(() => import('./pages/admin/UsersPage').then((m) => ({ default: m.UsersPage })));
const RolesPage = lazy(() => import('./pages/admin/RolesPage').then((m) => ({ default: m.RolesPage })));
const ModulesPage = lazy(() => import('./pages/admin/ModulesPage').then((m) => ({ default: m.ModulesPage })));
const TokensPage = lazy(() => import('./pages/admin/TokensPage').then((m) => ({ default: m.TokensPage })));
const SettingsPage = lazy(() => import('./pages/admin/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const AuditPage = lazy(() => import('./pages/admin/AuditPage').then((m) => ({ default: m.AuditPage })));
const RetentionPage = lazy(() => import('./pages/admin/RetentionPage').then((m) => ({ default: m.RetentionPage })));

const ModulesContext = createContext<LoadedModule[]>([]);

function useModules(): LoadedModule[] {
  return useContext(ModulesContext);
}

function NotFound() {
  const { t } = useTranslation('shell');
  return <EmptyState title={t('notFound')} />;
}

/** Pages of the administration need the matching core permission. */
function Guard({ session, permission, children }: { session: Session; permission: string; children: ReactNode }) {
  const { t } = useTranslation('common');
  return can(session, permission) ? children : <EmptyState title={t('errors.auth.forbidden')} />;
}

const emptyRoutes: RouteObject[] = [];

/** Loads a module remote on demand and mounts its routes under `/<module-id>/`. */
function ModuleRoute({ info }: { info: ActiveModule }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const { data, error, isPending } = useQuery({
    queryKey: moduleFrontendQueryKey(info.id),
    queryFn: () => loadModuleFrontend(info),
    staleTime: Infinity,
  });
  const element = useRoutes(data?.web?.routes ?? emptyRoutes);
  if (error) return <Alert color="brand" title={t('serverUnavailable')}>{error.message}</Alert>;
  if (isPending || !data) return <Loader m="xl" />;
  if (data.error) return <Alert color="brand" title={t('moduleUnavailable', { name: localized(info.name) })}>{data.error}</Alert>;
  if (!data.web) return <NotFound />;
  return element;
}

function Frame({ session }: { session: Session }) {
  return <AppFrame modules={useModules()} session={session} />;
}

function StartRoute({ session }: { session: Session }) {
  return <StartPage modules={useModules()} session={session} />;
}

function ProfileRoute({ session }: { session: Session }) {
  return <ProfilePage session={session} modules={useModules()} />;
}

function ListsRoute() {
  return <ListsPage modules={useModules()} />;
}

function RolesRoute() {
  return <RolesPage modules={useModules()} />;
}

function ModulesRoute({ session }: { session: Session }) {
  const modules = useModules();
  if (can(session, 'core.modules.manage') || moduleSettings(modules, session).length) {
    return <ModulesPage modules={modules} session={session} />;
  }
  return (
    <Guard session={session} permission="core.modules.manage">
      <ModulesPage modules={modules} session={session} />
    </Guard>
  );
}

function SettingsRoute() {
  return <SettingsPage modules={useModules()} />;
}

function Router({ active, session }: { active: ActiveModule[]; session: Session }) {
  const router = useMemo(
    () =>
      createBrowserRouter([
        {
          path: '/',
          element: <Frame session={session} />,
          children: [
            { index: true, element: <StartRoute session={session} /> },
            { path: 'profile', element: <ProfileRoute session={session} /> },
            { path: 'me', element: <MyAreaPage session={session} /> },
            { path: 'lists', element: <ListsRoute /> },
            { path: 'scan', element: <ScanPage /> },
            { path: 'import', element: <ImportPage /> },
            { path: 'admin/users', element: <Guard session={session} permission="core.users.manage"><UsersPage /></Guard> },
            { path: 'admin/roles', element: <Guard session={session} permission="core.roles.manage"><RolesRoute /></Guard> },
            { path: 'admin/modules', element: <ModulesRoute session={session} /> },
            { path: 'admin/tokens', element: <Guard session={session} permission="core.tokens.manage"><TokensPage /></Guard> },
            { path: 'admin/settings', element: <Guard session={session} permission="core.settings.manage"><SettingsRoute /></Guard> },
            { path: 'admin/audit', element: <Guard session={session} permission="core.audit.read"><AuditPage /></Guard> },
            { path: 'admin/retention', element: <Guard session={session} permission="core.retention.manage"><RetentionPage /></Guard> },
            ...active
              .filter((info) => info.frontend)
              .map((info) => ({ path: `${info.id}/*`, element: <ModuleRoute info={info} /> })),
            { path: '*', element: <NotFound /> },
          ],
        },
      ]),
    // Router shape depends on the active module list and session; frontends arrive later via React Query.
    [active, session],
  );
  return (
    <Suspense fallback={<Loader m="xl" />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}

/** Loads every active module frontend in parallel; missing entries still expose navigation from the manifest. */
function useLoadedModules(active: ActiveModule[]): LoadedModule[] {
  const results = useQueries({
    queries: active.map((info) => ({
      queryKey: moduleFrontendQueryKey(info.id),
      queryFn: () => loadModuleFrontend(info),
      staleTime: Infinity,
    })),
  });
  return active.map((info, index) => results[index]?.data ?? { info });
}

function LoggedIn({ session }: { session: Session }) {
  const { t } = useTranslation('shell');
  const { data: active, error } = useQuery({
    queryKey: ['core', 'modules'],
    queryFn: fetchActiveModules,
    staleTime: Infinity,
  });
  const modules = useLoadedModules(active ?? []);
  // Privacy registers `core.session.gate`; open the shell once that remote is ready, without waiting for every module.
  const privacy = active?.find((module) => module.id === 'privacy');
  const privacyFrontend = useQuery({
    queryKey: moduleFrontendQueryKey('privacy'),
    queryFn: () => loadModuleFrontend(privacy!),
    enabled: Boolean(privacy?.frontend),
    staleTime: Infinity,
  });

  // After login the language stored in the user's profile applies.
  useEffect(() => {
    if (session.user.language !== currentLanguage()) void setLanguage(session.user.language);
  }, [session.user.language]);

  if (error) return <Alert color="brand" title={t('serverUnavailable')}>{error.message}</Alert>;
  if (!active) return <Loader m="xl" />;
  if (privacy?.frontend && !privacyFrontend.isSuccess) {
    if (privacyFrontend.error) {
      return <Alert color="brand" title={t('serverUnavailable')}>{privacyFrontend.error.message}</Alert>;
    }
    return <Loader m="xl" />;
  }

  const app = (
    <ModulesContext.Provider value={modules}>
      <Router active={active} session={session} />
      <StepUpHost session={session} />
    </ModulesContext.Provider>
  );
  return extensionsOf('core.session.gate').reduceRight<ReactNode>((inner, gate) => {
    const Gate = gate.component as ComponentType<{ session: Session; children: ReactNode }>;
    return <Gate key={gate.module} session={session}>{inner}</Gate>;
  }, app);
}

/** A page of a module without shell frame and login, e.g. the info terminal at `/terminal`. */
function KioskPage({ path }: { path: string }) {
  const { t } = useTranslation('shell');
  const { data, error } = useQuery({ queryKey: ['core', 'kiosk', path], queryFn: () => loadKiosk(path), retry: false, staleTime: Infinity });
  if (error instanceof ApiError && error.status === 404) return <EmptyState title={t(error.code === 'modules.inactive' ? 'kioskInactive' : 'notFound')} />;
  if (error) return <Alert color="brand" title={t('serverUnavailable')} m="xl">{error.message}</Alert>;
  if (!data) return <SplashScreen />;
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
  if (!setup.data || session.data === undefined) return <SplashScreen />;
  if (setup.data.required) return <SetupPage />;
  if (!session.data) return <LoginPage brigadeName={setup.data.brigadeName} oidc={setup.data.oidc} rememberAllowed={setup.data.rememberAllowed} />;
  return <LoggedIn session={session.data} />;
}

export default App;
