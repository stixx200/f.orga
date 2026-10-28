import { Modal } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import type { KioskPerson } from '@forga/info-terminal-contracts';
import { useTranslation } from '@forga/web-sdk';
import { errorText, isBlocked, kioskApi } from './api';
import { useKiosk } from './context';
import classes from './kiosk.module.css';

export const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(' ');

/** Single-colour line icons like in the mockups. */
const ICONS = {
  home: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="1" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  terminal: <><rect x="4" y="3" width="16" height="13" rx="1" /><path d="M9 21h6M12 16v5" /><path d="M8 8h3M8 11h8" /></>,
  power: <><path d="M12 3v9" /><path d="M6.3 7.5a8 8 0 1 0 11.4 0" /></>,
};

export function Icon({ name, size = 20 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name]}
    </svg>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warning' | 'error'; children: ReactNode }) {
  return (
    <div className={cx(classes.notice, kind === 'warning' && classes.noticeWarning, kind === 'error' && classes.noticeError)} role={kind === 'error' ? 'alert' : undefined}>
      <span className={classes.noticeIcon} aria-hidden="true">{kind === 'info' ? 'i' : '!'}</span>
      <span>{children}</span>
    </div>
  );
}

/** An error of the server in the current language; a device that is no longer enabled shows the blocked screen. */
export function ErrorNotice({ error }: { error: unknown }) {
  const { blocked } = useKiosk();
  const code = (error as { code?: string } | null)?.code ?? '';
  useEffect(() => {
    if (isBlocked(error)) blocked(code);
  }, [error, code, blocked]);
  if (!error) return null;
  return <Notice kind="error">{errorText(error)}</Notice>;
}

export function Dialog({ opened, title, onClose, children, actions }: { opened: boolean; title: string; onClose: () => void; children: ReactNode; actions: ReactNode }) {
  return (
    <Modal opened={opened} onClose={onClose} title={<strong style={{ fontSize: '1.25rem' }}>{title}</strong>} centered size="lg" radius={4}>
      {children}
      <div className={classes.dialogActions}>{actions}</div>
    </Modal>
  );
}

/** Seconds counting down to 0; calls `onEnd` once at 0. */
export function useCountdown(seconds: number, active: boolean, onEnd: () => void): number {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (!active) {
      setLeft(seconds);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => {
      const remaining = Math.max(0, seconds - Math.floor((Date.now() - started) / 1000));
      setLeft(remaining);
      if (remaining === 0) {
        clearInterval(timer);
        onEnd();
      }
    }, 250);
    return () => clearInterval(timer);
    // `onEnd` changes with every render of the caller; the countdown restarts only when it is (de)activated.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, seconds]);
  return left;
}

const initial = (p: KioskPerson) => p.lastName.charAt(0).toLocaleUpperCase('de');

export type TileStatus = { kind: 'free' } | { kind: 'booked'; meta: string; editable: boolean } | { kind: 'blocked'; reason: string };

function NameTile({ person, status, onPick, meta }: { person: KioskPerson; status: TileStatus; onPick: () => void; meta?: string }) {
  const name = `${person.firstName} ${person.lastName}`;
  if (status.kind === 'blocked') {
    return (
      <button type="button" className={cx(classes.name, classes.blocked)} disabled aria-disabled="true">
        <strong>{name}</strong>
        <span className={classes.meta}>{[meta, status.reason].filter(Boolean).join(' · ')}</span>
      </button>
    );
  }
  return (
    <button type="button" className={cx(classes.name, status.kind === 'booked' && classes.booked)} onClick={onPick}>
      <strong>{name}</strong>
      <span className={classes.meta}>{status.kind === 'booked' ? status.meta : meta}</span>
    </button>
  );
}

/**
 * "Wer sind Sie?": name tiles of the active members of the department with a jump bar, and the search over all
 * persons who have not left (from 3 letters).
 */
export function NameChooser({ status, onPick, guestsHint }: { status: (personId: string) => TileStatus; onPick: (person: KioskPerson, status: TileStatus) => void; guestsHint?: boolean }) {
  const { t } = useTranslation('info-terminal');
  const { department, terminal } = useKiosk();
  const members = useQuery({ queryKey: ['kiosk', 'members', department.id], queryFn: () => kioskApi.members(department.id), staleTime: 60_000 });
  const [letter, setLetter] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);
  const search = useQuery({
    queryKey: ['kiosk', 'search', department.id, debounced],
    queryFn: () => kioskApi.search(department.id, debounced),
    enabled: debounced.length >= 3,
    staleTime: 30_000,
  });
  const list = members.data ?? [];
  const letters = [...new Set(list.map(initial))].toSorted((a, b) => a.localeCompare(b, 'de'));
  const shown = letter ? list.filter((p) => initial(p) === letter) : list;

  return (
    <>
      {letters.length > 1 && (
        <div className={classes.letters} role="group" aria-label={t('kiosk.persons.jump')}>
          <button type="button" aria-pressed={letter === null} onClick={() => setLetter(null)}>{t('kiosk.persons.all')}</button>
          {letters.map((l) => (
            <button key={l} type="button" aria-pressed={letter === l} onClick={() => setLetter(l)}>{l}</button>
          ))}
        </div>
      )}
      <ErrorNotice error={members.error} />
      {members.isSuccess && !list.length && <p className={classes.meta}>{t('kiosk.persons.noMembers')}</p>}
      <div className={classes.names}>
        {shown.map((p) => (
          <NameTile key={p.id} person={p} status={status(p.id)} meta={department.shortName} onPick={() => onPick(p, status(p.id))} />
        ))}
      </div>
      <section className={classes.section}>
        <h2>{t('kiosk.persons.notThere')}</h2>
        <div className={classes.field}>
          <label htmlFor="kiosk-search">{t('kiosk.persons.search')}</label>
          <input id="kiosk-search" type="search" autoComplete="off" value={query} placeholder={t('kiosk.persons.searchPlaceholder')} onChange={(e) => setQuery(e.currentTarget.value)} />
        </div>
        <ErrorNotice error={search.error} />
        {debounced.length >= 3 && search.isSuccess && (
          search.data.length ? (
            <div className={classes.names} style={{ marginBottom: 0 }}>
              {search.data.map((p) => (
                <NameTile key={p.id} person={p} status={status(p.id)} meta={p.departments.join(', ')} onPick={() => onPick(p, status(p.id))} />
              ))}
            </div>
          ) : (
            <p className={classes.meta}>{t('kiosk.persons.noResults')}</p>
          )
        )}
        <p className={cx(classes.meta, classes.small)} style={{ margin: '8px 0 0' }}>
          {t('kiosk.persons.searchHint')} {guestsHint && t('kiosk.persons.guestsHint')}
        </p>
      </section>
      <p className={classes.meta}>{t('kiosk.persons.tilesHint', { seconds: terminal.idleSeconds })}</p>
    </>
  );
}
