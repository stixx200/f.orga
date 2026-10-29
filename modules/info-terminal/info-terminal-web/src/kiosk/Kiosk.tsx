import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Language } from '@forga/core-contracts';
import type { KioskTerminal } from '@forga/info-terminal-contracts';
import { i18n, useTranslation } from '@forga/web-sdk';
import { clockTime, isBlocked, isInactive, kioskApi } from './api';
import { KioskContext, type KioskContextValue, type Screen } from './context';
import classes from './kiosk.module.css';
import { NewIncident } from './NewIncident';
import { Overview } from './Overview';
import { DriverLicenseFlow } from './DriverLicenseFlow';
import { Icon, useKeyboardScan } from './parts';
import { ReportFlow } from './ReportFlow';
import { SessionFlow } from './SessionFlow';

const LANGUAGE_KEY = 'forga.terminal.language';
const LANGUAGES: Language[] = ['de', 'en'];

function storedLanguage(): Language | null {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY);
    return LANGUAGES.includes(value as Language) ? (value as Language) : null;
  } catch {
    return null;
  }
}

/** The terminal keeps nothing in the browser but its cookie and the language. */
function chooseLanguage(language: Language): void {
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // Storage unavailable: the language applies to this page only.
  }
  void i18n.changeLanguage(language);
}

/**
 * Opens the terminal: the key from the link (`#k=…`) is exchanged once for the device cookie and removed from the
 * address, so a bookmark holds no key; afterwards the cookie authenticates.
 */
async function start(): Promise<KioskTerminal & { offset: number }> {
  const key = new URLSearchParams(window.location.hash.slice(1)).get('k');
  const terminal = key ? await kioskApi.open(key) : await kioskApi.terminal();
  if (key) window.history.replaceState(null, '', window.location.pathname);
  return { ...terminal, offset: Date.parse(terminal.now) - Date.now() };
}

function FullScreen({ icon, title, children }: { icon: 'lock' | 'power'; title: string; children: ReactNode }) {
  const { t } = useTranslation('info-terminal');
  return (
    <div className={classes.page}>
      <header className={classes.header}>
        <img className={classes.crest} src="/logo.svg" alt={t('kiosk.crest')} />
        <div className={classes.station}><strong className={classes.stationName}>Infoterminal</strong></div>
      </header>
      <main className={classes.content}>
        <div className={classes.center}>
          <div className={classes.bigIcon}><Icon name={icon} size={44} /></div>
          <h1>{title}</h1>
          {children}
        </div>
      </main>
    </div>
  );
}

function Clock({ now }: { now: () => Date }) {
  const [time, setTime] = useState(() => clockTime(now().toISOString()));
  useEffect(() => {
    const timer = setInterval(() => setTime(clockTime(now().toISOString())), 5_000);
    return () => clearInterval(timer);
  }, [now]);
  return <span className={classes.clock} translate="no">{time}</span>;
}

/** The kiosk page of the info terminal at `/terminal`: no shell frame, no user account. */
export function Kiosk() {
  const { t, i18n: instance } = useTranslation('info-terminal');
  const queryClient = useQueryClient();
  const terminal = useQuery({ queryKey: ['kiosk', 'terminal'], queryFn: start, retry: false, refetchInterval: 60_000, refetchOnWindowFocus: false });
  const [blockedCode, setBlockedCode] = useState<string | null>(null);
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'overview' });
  const lastInput = useRef(0);
  const data = terminal.data;
  const languageSet = useRef(false);

  // Language at the start: the one chosen on this device, else the one of the terminal.
  useEffect(() => {
    if (!data || languageSet.current) return;
    languageSet.current = true;
    const language = storedLanguage() ?? data.language;
    if (instance.language !== language) void i18n.changeLanguage(language);
  }, [data, instance.language]);

  const home = data?.departments[0]?.id ?? null;
  const department = data?.departments.find((d) => d.id === departmentId) ?? data?.departments[0];

  const reset = useCallback(() => {
    setDepartmentId(null);
    setScreen({ kind: 'overview' });
    void queryClient.invalidateQueries({ queryKey: ['kiosk'] });
  }, [queryClient]);
  const offset = data?.offset ?? 0;
  const now = useCallback(() => new Date(Date.now() + offset), [offset]);
  const blocked = useCallback((code: string) => setBlockedCode(code || 'info-terminal.invalidKey'), []);

  // After a while without input the terminal returns to the overview of the station's department.
  useEffect(() => {
    const touch = () => {
      lastInput.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    for (const event of events) window.addEventListener(event, touch, { passive: true });
    return () => {
      for (const event of events) window.removeEventListener(event, touch);
    };
  }, []);
  const idleSeconds = data?.idleSeconds ?? 60;
  const idle = screen.kind !== 'overview' || (departmentId !== null && departmentId !== home);
  useEffect(() => {
    if (!idle) return;
    lastInput.current = Date.now();
    const timer = setInterval(() => {
      if (Date.now() - lastInput.current >= idleSeconds * 1000) reset();
    }, 1_000);
    return () => clearInterval(timer);
  }, [idle, idleSeconds, reset]);

  // A reader in keyboard mode may scan a licence sticker right on the overview.
  useKeyboardScan((code) => setScreen({ kind: 'driver-license', code }), Boolean(data?.driverLicenseCheck) && screen.kind === 'overview');

  const context = useMemo<KioskContextValue | null>(
    () => (data && department ? { terminal: data, department, go: setScreen, reset, now, blocked } : null),
    [data, department, reset, now, blocked],
  );

  if (blockedCode || isBlocked(terminal.error)) {
    const code = blockedCode ?? (terminal.error as { code?: string }).code ?? 'info-terminal.invalidKey';
    return (
      <FullScreen icon="lock" title={t('kiosk.blocked.title')}>
        <p className={classes.meta}>{t('kiosk.blocked.text')}</p>
        <p className={classes.meta}>{t('kiosk.blocked.code', { code })}</p>
      </FullScreen>
    );
  }
  if (isInactive(terminal.error)) {
    return (
      <FullScreen icon="power" title={t('kiosk.inactive.title')}>
        <p className={classes.meta}>{t('kiosk.inactive.text')}</p>
      </FullScreen>
    );
  }
  if (terminal.error) {
    return (
      <FullScreen icon="power" title={t('kiosk.failed')}>
        <p className={classes.meta}>{terminal.error.message}</p>
      </FullScreen>
    );
  }
  if (!data || !department || !context) return <FullScreen icon="power" title={t('kiosk.loading')}>{null}</FullScreen>;

  const language = (LANGUAGES.includes(instance.language as Language) ? instance.language : 'de') as Language;
  const departments = data.departments;

  return (
    <KioskContext.Provider value={context}>
      <div className={classes.page}>
        <header className={classes.header}>
          {screen.kind !== 'overview' && (
            <button type="button" className={classes.home} onClick={() => setScreen({ kind: 'overview' })}>
              <Icon name="home" size={30} />
              <span>{t('kiosk.backToOverview')}</span>
            </button>
          )}
          <img className={classes.crest} src="/logo.svg" alt={t('kiosk.crest')} />
          <div className={classes.station}>
            <span className={classes.kicker}>{t('kiosk.kicker', { brigade: data.brigadeName })}</span>
            <strong className={classes.stationName}>{data.station.name}</strong>
          </div>
          <Clock now={now} />
          <div className={classes.languages} role="group" aria-label={t('kiosk.language')}>
            {LANGUAGES.map((l) => (
              <button key={l} type="button" aria-pressed={language === l} onClick={() => chooseLanguage(l)}>{l.toUpperCase()}</button>
            ))}
          </div>
        </header>
        <main className={classes.content} id="content">
          {departments.length > 1 && (screen.kind === 'overview' || screen.kind === 'session' || screen.kind === 'report') && (
            <nav className={classes.switcher} aria-label={t('kiosk.departments')}>
              {departments.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  aria-current={d.id === department.id ? 'page' : undefined}
                  onClick={() => {
                    setDepartmentId(d.id);
                    setScreen({ kind: 'overview' });
                  }}
                >
                  {d.shortName}
                </button>
              ))}
            </nav>
          )}
          <div key={`${department.id}:${JSON.stringify(screen)}`}>
            {screen.kind === 'overview' && <Overview />}
            {screen.kind === 'report' && <ReportFlow reportId={screen.reportId} />}
            {screen.kind === 'new-incident' && <NewIncident />}
            {screen.kind === 'session' && <SessionFlow sessionId={screen.sessionId} />}
            {screen.kind === 'driver-license' && <DriverLicenseFlow initialCode={screen.code} />}
          </div>
        </main>
      </div>
    </KioskContext.Provider>
  );
}
