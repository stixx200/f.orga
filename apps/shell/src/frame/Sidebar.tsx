import { useQuery } from '@tanstack/react-query';
import { Fragment } from 'react';
import { NavLink } from 'react-router';
import type { Session } from '@forga/core-contracts';
import { api, can, useLocalized, useTranslation } from '@forga/web-sdk';
import type { LoadedModule } from '../modules';
import classes from './frame.module.css';
import { NAV_ICONS } from './icons';

interface Entry {
  to: string;
  label: string;
  icon?: string;
  badge?: number;
  end?: boolean;
}

const noBadges = (): Record<string, number | undefined> => ({});

/** Badges of a module come from its hook; components call hooks unconditionally, so each module gets one. */
function ModuleSection({ module, session, onNavigate }: { module: LoadedModule; session: Session; onNavigate?: () => void }) {
  const localized = useLocalized();
  const useBadges = module.web?.useNavigationBadges ?? noBadges;
  // The module list is fixed for the lifetime of the frame, so the hook never changes.
  // oxlint-disable-next-line react/rules-of-hooks
  const badges = useBadges();
  const entries: Entry[] = module.info.navigation
    .filter((n) => (n.section ?? 'module') === 'module' && (!n.permission || can(session, n.permission)))
    .map((n) => ({ to: `/${module.info.id}/${n.path}`, label: localized(n.label), icon: n.icon, badge: badges[n.path] }));
  return <Section title={localized(module.info.name)} entries={entries} onNavigate={onNavigate} />;
}

function Section({ title, entries, onNavigate }: { title: string; entries: Entry[]; onNavigate?: () => void }) {
  if (!entries.length) return null;
  return (
    <>
      <div className={classes.navSection}>{title}</div>
      {entries.map((entry) => {
        const Icon = entry.icon ? NAV_ICONS[entry.icon] : undefined;
        return (
          <NavLink key={entry.to} to={entry.to} end={entry.end} className={classes.navLink} onClick={onNavigate}>
            {Icon ? <Icon size={20} stroke={1.5} aria-hidden /> : <span style={{ width: 20 }} />}
            <span>{entry.label}</span>
            {entry.badge ? <span className={classes.navBadge}>{entry.badge}</span> : null}
          </NavLink>
        );
      })}
    </>
  );
}

/** Settings pages of the modules the user may open; shown on the page „Verwaltung → Module“, not in the menu. */
export function moduleSettings(modules: LoadedModule[], session: Session) {
  return modules.flatMap((m) =>
    m.info.navigation.filter((n) => n.section === 'settings' && (!n.permission || can(session, n.permission))).map((n) => ({ module: m.info.id, entry: n })),
  );
}

/** Flat navigation: overview, one section per module, administration (depending on permissions). */
export function Sidebar({ modules, session, onNavigate }: { modules: LoadedModule[]; session: Session; onNavigate?: () => void }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  // Only modules with labeled items (equipment, clothing) resolve codes; the server knows which the user may search.
  const { data: codeModules = [] } = useQuery({ queryKey: ['core', 'codes', 'modules'], queryFn: () => api<string[]>('core/codes/modules'), staleTime: Infinity });
  const overview: Entry[] = [
    { to: '/', label: t('nav.start'), icon: 'home', end: true },
    // "My area" for members linked to a person.
    ...(session.user.personId ? [{ to: '/me', label: t('me.title'), icon: 'user' }] : []),
    { to: '/lists', label: t('nav.lists'), icon: 'list' },
    ...(codeModules.length ? [{ to: '/scan', label: t('nav.scan'), icon: 'barcode' }] : []),
    ...(Object.keys(session.permissions).some((p) => p.endsWith('.write') || p.endsWith('.manage')) ? [{ to: '/import', label: t('nav.import'), icon: 'import' }] : []),
  ];
  const administration: Entry[] = [
    can(session, 'core.users.manage') && { to: '/admin/users', label: t('nav.users'), icon: 'users' },
    can(session, 'core.roles.manage') && { to: '/admin/roles', label: t('nav.roles'), icon: 'roles' },
    // Also for those who only manage the settings of a module: the settings pages are found there.
    (can(session, 'core.modules.manage') || moduleSettings(modules, session).length > 0) && { to: '/admin/modules', label: t('nav.modules'), icon: 'modules' },
    can(session, 'core.tokens.manage') && { to: '/admin/tokens', label: t('nav.tokens'), icon: 'tokens' },
    can(session, 'core.settings.manage') && { to: '/admin/settings', label: t('nav.settings'), icon: 'settings' },
    can(session, 'core.audit.read') && { to: '/admin/audit', label: t('nav.audit'), icon: 'audit' },
    can(session, 'core.retention.manage') && { to: '/admin/retention', label: t('nav.retention'), icon: 'retention' },
    // Global settings of the modules, e.g. catalogs of the master data.
    ...modules.flatMap((m) =>
      m.info.navigation
        .filter((n) => n.section === 'administration' && (!n.permission || can(session, n.permission)))
        .map((n) => ({ to: `/${m.info.id}/${n.path}`, label: localized(n.label), icon: n.icon })),
    ),
  ].filter(Boolean) as Entry[];

  return (
    <nav aria-label={t('nav.menu')}>
      <Section title={t('nav.overview')} entries={overview} onNavigate={onNavigate} />
      {modules.map((m) => (
        <Fragment key={m.info.id}>
          <ModuleSection module={m} session={session} onNavigate={onNavigate} />
        </Fragment>
      ))}
      <Section title={t('nav.administration')} entries={administration} onNavigate={onNavigate} />
    </nav>
  );
}
