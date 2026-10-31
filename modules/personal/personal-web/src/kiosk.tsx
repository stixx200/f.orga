import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Text, TextInput, Title } from '@mantine/core';
import {
  IconCalendarEvent,
  IconCertificate,
  IconChevronLeft,
  IconChevronRight,
  IconFlame,
  IconHome,
  IconLungs,
  IconSchool,
  IconShirt,
  IconUser,
  type IconProps,
} from '@tabler/icons-react';
import type { PersonalView } from '@forga/personal-contracts';
import { ApiError, api, defineKioskModule, formatDate, formatDateTime, send, useLocalized, useTranslation } from '@forga/web-sdk';
import { LanguageSwitch, StatusBadge, type Tone } from '@forga/web-ui';
import { kioskTranslations } from './kiosk/i18n';
import classes from './kiosk/kiosk.module.css';

const QUERY = ['personal', 'kiosk'] as const;
const HINT = 'forga.personal.install-hint';
const TONES: Record<'green' | 'yellow' | 'red' | 'grey', Tone> = {
  green: 'done',
  yellow: 'warning',
  red: 'error',
  grey: 'neutral',
};

const VIEWS = ['home', 'duty', 'incidents', 'respiratory', 'clothing', 'courses', 'qualifications', 'profile'] as const;
type ViewId = (typeof VIEWS)[number];
const ICONS: Record<ViewId, ComponentType<IconProps>> = {
  home: IconHome,
  duty: IconCalendarEvent,
  incidents: IconFlame,
  respiratory: IconLungs,
  clothing: IconShirt,
  courses: IconSchool,
  qualifications: IconCertificate,
  profile: IconUser,
};
const TABS: ViewId[] = ['home', 'duty', 'incidents', 'respiratory', 'profile'];

function keyFromHash(): string | null {
  return new URLSearchParams(window.location.hash.slice(1)).get('k');
}

function viewFromUrl(): ViewId {
  const value = new URLSearchParams(window.location.search).get('v');
  return VIEWS.find((view) => view === value) ?? 'home';
}

/** Keeps the open view in `?v=` so the back button of the phone returns to the start page. */
function useViewNavigation() {
  const [view, setView] = useState<ViewId>(viewFromUrl);
  useEffect(() => {
    const onPop = () => setView(viewFromUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = (next: ViewId) => {
    if (next === view) return;
    window.scrollTo(0, 0);
    if (next === 'home' && (window.history.state as { personalView?: string } | null)?.personalView) {
      window.history.back();
      return;
    }
    const url = next === 'home' ? window.location.pathname : `${window.location.pathname}?v=${next}`;
    if (view === 'home') window.history.pushState({ personalView: next }, '', url);
    else window.history.replaceState(next === 'home' ? null : { personalView: next }, '', url);
    setView(next);
  };
  return { view, go, back: () => go('home') };
}

function launchedFromHomeScreen(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches;
}

/** Links the install manifest and a service worker so the page can live on the home screen. */
function useInstallable() {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/personal.webmanifest';
    document.head.append(link);
    const theme = document.createElement('meta');
    theme.name = 'theme-color';
    theme.content = '#8C1D18';
    document.head.append(theme);
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/personal-sw.js', { scope: '/personal' }).catch(() => undefined);
    return () => {
      link.remove();
      theme.remove();
    };
  }, []);
}

/** Survives the switch from the key form to the file, so the first visit still shows the hint. */
let hintOpen = false;
let hintDecided = false;

function InstallHint() {
  const { t } = useTranslation('personal');
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [open, setOpen] = useState(() => {
    if (!hintDecided) {
      hintDecided = true;
      hintOpen = !launchedFromHomeScreen() && localStorage.getItem(HINT) !== '1';
    }
    return hintOpen;
  });
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);
  if (!open) return null;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(navigator.userAgent);
  const dismiss = () => {
    hintOpen = false;
    localStorage.setItem(HINT, '1');
    setOpen(false);
  };
  const add = async () => {
    if (!prompt) return;
    await prompt.prompt();
    dismiss();
  };
  return (
    <aside className={classes.install}>
      <Text fw={700}>{t('install.title')}</Text>
      <Text size="sm">{t('install.text')}</Text>
      <Text size="sm">{t(ios ? 'install.ios' : android ? 'install.android' : 'install.other')}</Text>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {prompt ? <Button size="compact-sm" onClick={() => void add()}>{t('install.add')}</Button> : null}
        <Button size="compact-sm" variant="default" onClick={dismiss}>{t('install.later')}</Button>
      </div>
    </aside>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function PersonalViewPage() {
  const { t } = useTranslation('personal');
  const queryClient = useQueryClient();
  const [pasted, setPasted] = useState('');
  useInstallable();
  const file = useQuery({
    queryKey: QUERY,
    retry: false,
    queryFn: async () => {
      const key = keyFromHash();
      if (key) {
        await send('POST', 'personal/kiosk/session', { key });
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
      return api<PersonalView>('personal/kiosk/file');
    },
  });
  const open = useMutation({
    mutationFn: (key: string) => send('POST', 'personal/kiosk/session', { key: key.trim() }),
    onSuccess: async () => {
      setPasted('');
      await queryClient.invalidateQueries({ queryKey: QUERY });
    },
  });
  const logout = useMutation({
    mutationFn: () => send('POST', 'personal/kiosk/logout'),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: QUERY });
      await queryClient.invalidateQueries({ queryKey: QUERY });
    },
  });

  const error = open.error ?? file.error;
  const message = error instanceof ApiError ? error.translated() : null;
  const waiting = file.isPending && !file.isError;
  return (
    <main className={classes.page}>
      <div className={classes.app}>
        {file.isSuccess ? <File view={file.data} onLogout={() => logout.mutate()} /> : (
          <>
            <header className={classes.header}>
              <Title order={2} className={classes.name}>{t('title')}</Title>
              <LanguageSwitch loggedIn={false} />
            </header>
            <InstallHint />
            <div className={classes.gate}>
              <Text>{t('intro')}</Text>
              {message && !waiting ? <Text c="brand">{message}</Text> : null}
              <TextInput label={t('key')} value={pasted} onChange={(event) => setPasted(event.currentTarget.value)} autoComplete="off" />
              <Button loading={open.isPending || waiting} disabled={!pasted.trim()} onClick={() => open.mutate(pasted)}>
                {t('open')}
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function File({ view, onLogout }: { view: PersonalView; onLogout: () => void }) {
  const { t, i18n } = useTranslation('personal');
  const localized = useLocalized();
  const navigation = useViewNavigation();
  const date = (value: string) => formatDate(value, i18n.language);
  const dateTime = (value: string) => formatDateTime(value, i18n.language);
  const hours = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 });
  const address = [view.street, [view.postalCode, view.city].filter(Boolean).join(' ')].filter(Boolean);
  const phones = [view.phonePrivate, view.phoneMobile, view.phoneWork].filter(Boolean);
  const initials = `${view.firstName.slice(0, 1)}${view.lastName.slice(0, 1)}`.toUpperCase();

  const available: Record<ViewId, boolean> = {
    home: true,
    duty: Boolean(view.upcoming ?? view.sessions),
    incidents: Boolean(view.incidents),
    respiratory: Boolean(view.respiratory && (view.respiratory.color !== 'grey' || view.respiratory.evidence.length || view.respiratory.examinations.length)),
    clothing: Boolean(view.clothing),
    courses: true,
    qualifications: true,
    profile: true,
  };
  const current = available[navigation.view] ? navigation.view : 'home';
  const next = view.upcoming?.[0];
  const lastIncident = view.incidents?.[0];
  const summaries: Record<Exclude<ViewId, 'home'>, ReactNode> = {
    duty: next ? t('summary.next', { date: dateTime(next.startsAt) }) : t('summary.noUpcoming'),
    incidents: lastIncident ? t('summary.lastIncident', { date: date(lastIncident.alarmedAt) }) : t('summary.noIncidents'),
    respiratory: view.respiratory ? <StatusBadge tone={TONES[view.respiratory.color]}>{t(`color.${view.respiratory.color}`)}</StatusBadge> : null,
    clothing: t('summary.pieces', { count: view.clothing?.length ?? 0 }),
    courses: view.courses.length ? t('summary.openCourses', { count: view.courses.length }) : t('summary.noCourses'),
    qualifications: t('summary.qualifications', { count: view.qualifications.length }),
    profile: t('summary.profile'),
  };

  const pages: Record<Exclude<ViewId, 'home'>, ReactNode> = {
    duty: (
      <>
        {view.upcoming ? (
          <Section title={t('upcoming')} empty={!view.upcoming.length}>
            {view.upcoming.map((item) => (
              <Item key={item.startsAt + item.title} primary={item.title} secondary={`${dateTime(item.startsAt)} · ${localized(item.typeName)}`} />
            ))}
          </Section>
        ) : null}
        {view.sessions ? (
          <Section title={t('sessions')} empty={!view.sessions.length}>
            {view.sessions.map((item) => (
              <Item key={`${item.startsAt}-${item.title}`} primary={item.title} secondary={`${dateTime(item.startsAt)} · ${t(`attendance.${item.status}`)}`} />
            ))}
          </Section>
        ) : null}
      </>
    ),
    incidents: (
      <Section title={t('incidents')} empty={!view.incidents?.length}>
        {view.incidents?.map((item) => (
          <Item
            key={`${item.dispatchNumber}-${item.alarmedAt}`}
            primary={`${item.alarmKeyword} · ${item.dispatchNumber}`}
            secondary={[dateTime(item.alarmedAt), item.location, t('hours', { hours: hours.format(item.hours) })].filter(Boolean).join(' · ')}
          />
        ))}
      </Section>
    ),
    respiratory: view.respiratory ? (
      <>
        <section className={classes.card}>
          <h2>{t('status')}</h2>
          <div className={classes.badge}><StatusBadge tone={TONES[view.respiratory.color]}>{t(`color.${view.respiratory.color}`)}</StatusBadge></div>
          <div className={classes.line}><span>{view.respiratory.nextDue ? t('nextDue', { date: date(view.respiratory.nextDue) }) : t('noDeadline')}</span></div>
        </section>
        <Section title={t('examinations')} empty={!view.respiratory.examinations.length}>
          {view.respiratory.examinations.map((item) => (
            <Item
              key={item.date}
              primary={date(item.date)}
              secondary={[item.result ? t(`examinationResult.${item.result}`) : '', item.validUntil ? t('validUntil', { date: date(item.validUntil) }) : ''].filter(Boolean).join(' · ')}
            />
          ))}
        </Section>
        <Section title={t('evidence')} empty={!view.respiratory.evidence.length}>
          {view.respiratory.evidence.map((item) => (
            <Item
              key={`${item.kind}-${item.date}`}
              primary={t(`kind.${item.kind}`, { defaultValue: item.kind })}
              secondary={[date(item.date), item.passed === true ? t('passed') : item.passed === false ? t('notPassed') : '', item.validUntil ? t('validUntil', { date: date(item.validUntil) }) : ''].filter(Boolean).join(' · ')}
            />
          ))}
        </Section>
      </>
    ) : null,
    clothing: (
      <Section title={t('clothing')} empty={!view.clothing?.length}>
        {view.clothing?.map((item) => (
          <Item
            key={item.inventoryNumber}
            primary={`${localized(item.name)}${item.size ? ` · ${item.size}` : ''}`}
            secondary={[item.inventoryNumber, item.issuedOn ? t('issuedOn', { date: date(item.issuedOn) }) : ''].filter(Boolean).join(' · ')}
          />
        ))}
      </Section>
    ),
    courses: (
      <Section title={t('courses')} empty={!view.courses.length}>
        {view.courses.map((item) => (
          <Item
            key={`${localized(item.name)}-${item.startsOn ?? ''}`}
            primary={localized(item.name)}
            secondary={[t(`nomination.${item.status}`), item.startsOn ? date(item.startsOn) : '', item.location].filter(Boolean).join(' · ')}
          />
        ))}
      </Section>
    ),
    qualifications: (
      <>
        <Section title={t('qualifications')} empty={!view.qualifications.length}>
          {view.qualifications.map((item) => (
            <Item key={item.key} primary={localized(item.name)} secondary={[t('since', { date: date(item.acquiredOn) }), item.validUntil ? t('validUntil', { date: date(item.validUntil) }) : ''].filter(Boolean).join(' · ')} />
          ))}
        </Section>
        <Section title={t('offices')} empty={!view.offices.length}>
          {view.offices.map((item) => (
            <Item key={`${item.key}-${item.from}`} primary={localized(item.name)} secondary={[t('since', { date: date(item.from) }), item.to ? t('until', { date: date(item.to) }) : ''].filter(Boolean).join(' · ')} />
          ))}
        </Section>
      </>
    ),
    profile: (
      <>
        <section className={classes.card}>
          <h2>{t('master')}</h2>
          <div className={classes.stack}>
            <Line label={t('status')} value={t(`statusName.${view.status}`, { defaultValue: view.status })} />
            {view.joinedOn ? <Line label={t('joined')} value={date(view.joinedOn)} /> : null}
            <Line label={t('departments')} value={view.memberships.map((m) => m.name + (m.primary ? ` (${t('primary')})` : '')).join(', ') || t('none')} />
            <Line label={t('address')} value={address.join(', ') || t('noAddress')} />
            {phones.length ? <Line label={t('phones')} value={phones.join(' · ')} /> : null}
            {view.email ? <Line label={t('email')} value={view.email} /> : null}
          </div>
        </section>
        <Button className={classes.logout} variant="default" onClick={onLogout}>{t('logout')}</Button>
      </>
    ),
  };

  const tiles = VIEWS.filter((id): id is Exclude<ViewId, 'home'> => id !== 'home' && available[id]);
  const tabs = TABS.filter((id) => available[id]);
  return (
    <>
      {current === 'home' ? (
        <header className={classes.header}>
          <div className={classes.who}>
            <div className={classes.avatar} aria-hidden>{initials}</div>
            <div>
              <h1 className={classes.name}>{view.firstName} {view.lastName}</h1>
              <p className={classes.sub}>{[view.rank ? localized(view.rank.name) : '', view.memberships.find((m) => m.primary)?.name].filter(Boolean).join(' · ') || t('title')}</p>
            </div>
          </div>
          <LanguageSwitch loggedIn={false} />
        </header>
      ) : (
        <header className={`${classes.header} ${classes.subHeader}`}>
          <button type="button" className={classes.back} onClick={navigation.back} aria-label={t('nav.back')}>
            <IconChevronLeft size={24} />
          </button>
          <h1 className={classes.name}>{t(`nav.${current}`)}</h1>
          <LanguageSwitch loggedIn={false} />
        </header>
      )}
      <InstallHint />
      <div className={classes.body}>
        {current === 'home' ? (
          <div className={classes.tiles}>
            {tiles.map((id) => {
              const Icon = ICONS[id];
              return (
                <button key={id} type="button" className={classes.tile} onClick={() => navigation.go(id)}>
                  <span className={classes.tileIcon}><Icon size={22} stroke={1.8} /></span>
                  <span className={classes.tileTitle}>{t(`nav.${id}`)}</span>
                  <span className={classes.tileSummary}>{summaries[id]}</span>
                  <IconChevronRight size={16} className={classes.tileArrow} />
                </button>
              );
            })}
          </div>
        ) : pages[current]}
      </div>
      <nav className={classes.nav} style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((id) => {
          const Icon = ICONS[id];
          return (
            <button key={id} type="button" className={classes.navItem} aria-current={current === id ? 'page' : undefined} onClick={() => navigation.go(id)}>
              <Icon size={22} stroke={1.8} />
              <span>{t(`tab.${id}`)}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}

function Section({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  const { t } = useTranslation('personal');
  return (
    <section className={classes.card}>
      <h2>{title}</h2>
      <div className={classes.stack}>{empty ? <div className={classes.line}><span>{t('none')}</span></div> : children}</div>
    </section>
  );
}

function Item({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <div className={classes.line}>
      <span>
        <strong>{primary}</strong>
        {secondary ? <Text span size="sm" c="dimmed" display="block">{secondary}</Text> : null}
      </span>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className={classes.line}>
      <span className={classes.muted}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Personal view, served by the shell at `/personal` without frame and login. */
export default defineKioskModule({
  translations: kioskTranslations,
  component: PersonalViewPage,
});
