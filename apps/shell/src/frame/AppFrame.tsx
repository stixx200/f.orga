import { Alert, AppShell, Avatar, Burger, Button, Group, Loader, Menu, Stack, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { IconLogout, IconUser } from '@tabler/icons-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Suspense } from 'react';
import { Link, Outlet } from 'react-router';
import type { BrigadeSettings, Session } from '@forga/core-contracts';
import { api, formatTime, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { LanguageSwitch } from '@forga/web-ui';
import type { LoadedModule } from '../modules';
import classes from './frame.module.css';
import { GlobalSearch } from './GlobalSearch';
import { Sidebar } from './Sidebar';
import { TasksBell } from './TasksBell';
import { ElevationBadge } from '../auth/StepUp';

export function useBrigade() {
  return useQuery({ queryKey: ['core', 'settings', 'brigade'], queryFn: () => api<BrigadeSettings | null>('core/settings/brigade') });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function UserMenu({ session }: { session: Session }) {
  const { t } = useTranslation('shell');
  const queryClient = useQueryClient();
  return (
    <Menu position="bottom-end" shadow="lg">
      <Menu.Target>
        <UnstyledButton aria-label={session.user.displayName}>
          <Group gap={8} wrap="nowrap">
            <Avatar color="brand" radius="xl" size={36}>{initials(session.user.displayName)}</Avatar>
            <Text size="sm" fw={700} visibleFrom="md">{session.user.displayName}</Text>
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} to="/profile" leftSection={<IconUser size={16} />}>{t('user.profile')}</Menu.Item>
        <Menu.Item
          leftSection={<IconLogout size={16} />}
          onClick={async () => {
            await send('POST', 'core/logout');
            // Nothing of the previous user may stay in the cache (also not in module frontends): start fresh.
            queryClient.clear();
            window.location.assign('/');
          }}
        >
          {t('user.logout')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function Footer({ modules }: { modules: LoadedModule[] }) {
  const { t } = useTranslation('shell');
  const { data: brigade } = useBrigade();
  const address = brigade ? [brigade.name, brigade.street, [brigade.postalCode, brigade.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ') : '';
  const contact = brigade ? [brigade.phone && `${t('footer.phone')} ${brigade.phone}`, brigade.fax && `${t('footer.fax')} ${brigade.fax}`, brigade.website].filter(Boolean).join(' · ') : '';
  return (
    <footer className={classes.footer}>
      {address && <div>{address}</div>}
      {contact && <div>{contact}</div>}
      {/* The privacy notice is a page of the module `privacy` (without sign-in). */}
      {modules.some((m) => m.info.id === 'privacy') && (
        <div>
          <a href="/privacy-notice">{t('privacyNotice')}</a>
        </div>
      )}
    </footer>
  );
}

/** The uploaded coat of arms, otherwise the neutral f.orga symbol. */
export function BrigadeLogo({ size, fallback = '/logo.svg' }: { size: number; fallback?: string }) {
  return (
    <img
      src="/api/core/assets/logo"
      alt=""
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
      onError={(e) => {
        if (!e.currentTarget.src.endsWith(fallback)) e.currentTarget.src = fallback;
      }}
    />
  );
}

async function endImpersonation() {
  await send('POST', 'core/impersonation/end');
  window.location.assign('/admin/users');
}

/** Shown on every page while an administrator acts as another user. */
function ImpersonationBanner({ session }: { session: Session }) {
  const { t, i18n } = useTranslation('shell');
  return (
    <div className={classes.impersonation} role="status">
      <span>
        {t('impersonation.banner', {
          user: session.user.displayName,
          admin: session.impersonator?.displayName,
          until: formatTime(session.impersonator?.endsAt, i18n.language),
        })}
      </span>
      <Button size="xs" color="dark" onClick={() => void endImpersonation()}>{t('impersonation.end')}</Button>
    </div>
  );
}

/** Header with brigade, search, tasks, language and user; flat sidebar; footer with the brigade address. */
export function AppFrame({ modules, session }: { modules: LoadedModule[]; session: Session }) {
  const { t } = useTranslation('shell');
  const localized = useLocalized();
  const [opened, { toggle, close }] = useDisclosure();
  const phone = useMediaQuery('(max-width: 48em)');
  const { data: brigade } = useBrigade();

  return (
    <AppShell header={{ height: 64 }} navbar={{ width: 248, breakpoint: 'sm', collapsed: { mobile: !opened } }} padding="lg">
      <a href="#content" className="forga-skip-link">{t('skipToContent')}</a>
      <AppShell.Header className={classes.header}>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap" gap="md">
          <Group wrap="nowrap" gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size={36} className={classes.menu} aria-label={t('nav.menu')} />
            <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
              <BrigadeLogo size={40} />
              <Stack gap={0} visibleFrom="xs">
                <span className={classes.kicker}>{brigade?.name}</span>
                <Text size="xs" c="dimmed">{t('appName')}</Text>
              </Stack>
            </Link>
          </Group>
          {!phone && <GlobalSearch />}
          <Group wrap="nowrap" gap="sm">
            {!phone && <ElevationBadge session={session} />}
            <TasksBell />
            {!phone && <LanguageSwitch loggedIn receiveDigest={session.user.receiveDigest} />}
            <UserMenu session={session} />
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Navbar py="sm" style={{ overflowY: 'auto' }}>
        {phone && (
          <Stack px="md" pb="md" gap="sm">
            <GlobalSearch onNavigate={close} />
            <LanguageSwitch loggedIn receiveDigest={session.user.receiveDigest} />
          </Stack>
        )}
        <Sidebar modules={modules} session={session} onNavigate={close} />
      </AppShell.Navbar>
      <AppShell.Main id="content">
        {session.impersonator && <ImpersonationBanner session={session} />}
        {phone && <Group mb="sm"><ElevationBadge session={session} /></Group>}
        {modules
          .filter((m) => m.error)
          .map((m) => (
            <Alert key={m.info.id} color="brand" mb="md" title={t('moduleUnavailable', { name: localized(m.info.name) })}>
              {m.error}
            </Alert>
          ))}
        <Suspense fallback={<Loader m="xl" />}>
          <Outlet />
        </Suspense>
        <Footer modules={modules} />
      </AppShell.Main>
    </AppShell>
  );
}
