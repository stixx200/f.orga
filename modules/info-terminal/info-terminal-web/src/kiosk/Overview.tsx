import { useQuery } from '@tanstack/react-query';
import type { KioskIncident, KioskSession } from '@forga/info-terminal-contracts';
import { formatLongDate, useTranslation } from '@forga/web-sdk';
import { clockTime, kioskApi } from './api';
import { useKiosk } from './context';
import classes from './kiosk.module.css';
import { cx, ErrorNotice, Icon } from './parts';

function IncidentTile({ incident }: { incident: KioskIncident }) {
  const { t } = useTranslation('info-terminal');
  const { go } = useKiosk();
  const place = [incident.city, incident.street].filter(Boolean).join(', ');
  const art = incident.endedAt ? t('kiosk.overview.ended', { time: clockTime(incident.endedAt) }) : t('kiosk.overview.running');
  const content = (
    <>
      <span className={classes.eventArt}>{art}</span>
      <strong>{incident.alarmKeyword}</strong>
      <span>{[t('kiosk.overview.alarm', { time: clockTime(incident.alarmedAt) }), place].filter(Boolean).join(' · ')}</span>
      <span className={classes.eventFoot}>
        <span className={cx(classes.badge, classes.badgeOk)}>{t('kiosk.overview.booked', { count: incident.booked })}</span>
        {!incident.bookable ? (
          <span className={cx(classes.badge, classes.badgeGrey)}>{t('kiosk.overview.finished')}</span>
        ) : incident.endedAt ? (
          <span className={cx(classes.badge, classes.badgeWarn)}>{t('kiosk.overview.bookOnlyUntil', { time: clockTime(incident.closesAt) })}</span>
        ) : (
          <span className={classes.meta}>{t('kiosk.overview.bookUntil', { time: clockTime(incident.closesAt) })}</span>
        )}
      </span>
    </>
  );
  if (!incident.bookable) return <div className={cx(classes.event, classes.closed)} aria-disabled="true">{content}</div>;
  return (
    <button type="button" className={classes.event} onClick={() => go({ kind: 'report', reportId: incident.reportId })}>
      {content}
    </button>
  );
}

function SessionTile({ session, open }: { session: KioskSession; open: boolean }) {
  const { t } = useTranslation('info-terminal');
  const { go } = useKiosk();
  const content = (
    <>
      <span className={classes.eventArt}>{t('kiosk.overview.session', { from: clockTime(session.startsAt), to: clockTime(session.endsAt) })}</span>
      <strong>{session.title}</strong>
      {session.stationName && <span>{session.stationName}</span>}
      <span className={classes.eventFoot}>
        {open ? (
          <>
            <span className={cx(classes.badge, classes.badgeOk)}>{t('kiosk.overview.booked', { count: session.present })}</span>
            <span className={classes.meta}>{t('kiosk.overview.bookUntil', { time: clockTime(session.closesAt) })}</span>
          </>
        ) : (
          <span className={classes.meta}>{t('kiosk.overview.opensAt', { time: clockTime(session.opensAt) })}</span>
        )}
      </span>
    </>
  );
  if (!open) return <div className={cx(classes.event, classes.session, classes.closed)} aria-disabled="true">{content}</div>;
  return (
    <button type="button" className={cx(classes.event, classes.session)} onClick={() => go({ kind: 'session', sessionId: session.sessionId })}>
      {content}
    </button>
  );
}

/** Tile "Führerschein kontrollieren" when self-checks of driving licences are switched on. */
function LicenseTile() {
  const { t } = useTranslation('info-terminal');
  const { go } = useKiosk();
  return (
    <button type="button" className={cx(classes.event, classes.session)} onClick={() => go({ kind: 'driver-license', code: null })}>
      <span className={classes.eventArt}>{t('kiosk.license.tileArt')}</span>
      <strong>{t('kiosk.license.tile')}</strong>
      <span>{t('kiosk.license.tileText')}</span>
    </button>
  );
}

/** Start screen: what is open for signing in in the chosen department. */
export function Overview() {
  const { t, i18n } = useTranslation('info-terminal');
  const { terminal, department, go, now } = useKiosk();
  const overview = useQuery({ queryKey: ['kiosk', 'overview', department.id], queryFn: () => kioskApi.overview(department.id), refetchInterval: 30_000 });
  const newIncident = terminal.allowNewIncident && department.operational;
  const data = overview.data;
  const empty = data && !data.incidents.length && !data.sessions.length && !data.upcoming.length;

  if (empty) {
    return (
      <div className={classes.center}>
        <div className={classes.bigIcon}><Icon name="terminal" size={44} /></div>
        <h1>{t('kiosk.overview.emptyTitle')}</h1>
        <p className={classes.meta}>
          {t('kiosk.overview.emptyText')}{' '}
          {data.next && <strong>{t('kiosk.overview.next', { date: `${formatLongDate(data.next.startsAt, i18n.language)} ${clockTime(data.next.startsAt)}`, title: data.next.title })}</strong>}
        </p>
        {newIncident && (
          <button type="button" className={cx(classes.button, classes.primary, classes.big)} onClick={() => go({ kind: 'new-incident' })}>
            {t('kiosk.overview.newIncident')}
          </button>
        )}
        {terminal.driverLicenseCheck && (
          <p>
            <button type="button" className={cx(classes.button, classes.big)} onClick={() => go({ kind: 'driver-license', code: null })}>
              {t('kiosk.license.tile')}
            </button>
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      <div className={classes.title}>
        <h1>{t('kiosk.overview.title')}</h1>
        <span className={classes.meta}>{formatLongDate(now(), i18n.language)}{department.operational ? '' : ` · ${department.name}`}</span>
      </div>
      <ErrorNotice error={overview.error} />
      {data && (
        <div className={classes.events}>
          {data.incidents.map((incident) => <IncidentTile key={incident.reportId} incident={incident} />)}
          {data.sessions.map((session) => <SessionTile key={session.sessionId} session={session} open />)}
          {data.upcoming.map((session) => <SessionTile key={session.sessionId} session={session} open={false} />)}
          {newIncident && (
            <button type="button" className={classes.newIncident} onClick={() => go({ kind: 'new-incident' })}>
              {t('kiosk.overview.newIncident')}
            </button>
          )}
          {terminal.driverLicenseCheck && <LicenseTile />}
        </div>
      )}
      <p className={classes.meta}>
        {department.operational
          ? t('kiosk.overview.hint', { after: terminal.afterEndMinutes, hours: terminal.openEndHours })
          : t('kiosk.overview.servicesOnly')}
      </p>
    </>
  );
}
