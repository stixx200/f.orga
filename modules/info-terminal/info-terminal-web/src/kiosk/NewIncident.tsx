import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { KioskIncidentInput, KioskMatch } from '@forga/info-terminal-contracts';
import { fromLocalInput, useLocalized, useTranslation } from '@forga/web-sdk';
import { berlinDay, clockTime, kioskApi } from './api';
import { useKiosk } from './context';
import classes from './kiosk.module.css';
import { cx, Dialog, ErrorNotice, Notice } from './parts';

const DAY_MS = 24 * 3_600_000;
const FUTURE_TOLERANCE_MS = 5 * 60_000;

/** "Neuer Einsatz": keyword, alarm today, dispatch number and location; matching incidents are offered first. */
export function NewIncident() {
  const { t } = useTranslation('info-terminal');
  const localized = useLocalized();
  const { terminal, department, go, now } = useKiosk();
  const keywords = useQuery({ queryKey: ['kiosk', 'keywords'], queryFn: kioskApi.keywords, staleTime: 5 * 60_000 });
  const [keyword, setKeyword] = useState('');
  const [alarm, setAlarm] = useState(() => clockTime(now().toISOString()));
  const [dispatchNumber, setDispatchNumber] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState(terminal.station.city);
  const [problem, setProblem] = useState<string | null>(null);
  const [matches, setMatches] = useState<{ input: KioskIncidentInput; list: KioskMatch[] } | null>(null);

  const create = useMutation({
    mutationFn: (input: KioskIncidentInput) => kioskApi.createIncident(input),
    onSuccess: ({ reportId }) => go({ kind: 'report', reportId }),
  });
  const check = useMutation({
    mutationFn: (input: KioskIncidentInput) => kioskApi.matches(input),
    onSuccess: (list, input) => {
      if (list.length) setMatches({ input, list });
      else create.mutate(input);
    },
  });

  /** The alarm today; a time later than now lies yesterday (e.g. 23:50 entered at 00:20). */
  const alarmedAt = (): string | null => {
    if (!/^\d{2}:\d{2}$/.test(alarm)) return null;
    const current = now();
    const today = fromLocalInput(`${berlinDay(current.toISOString())}T${alarm}`);
    if (Date.parse(today) <= current.getTime() + FUTURE_TOLERANCE_MS) return today;
    return fromLocalInput(`${berlinDay(new Date(current.getTime() - DAY_MS).toISOString())}T${alarm}`);
  };

  const next = () => {
    setProblem(null);
    if (!keyword) return setProblem(t('kiosk.newIncident.keywordRequired'));
    const at = alarmedAt();
    if (!at) return setProblem(t('kiosk.newIncident.alarmRequired'));
    if (Date.parse(at) > now().getTime() + FUTURE_TOLERANCE_MS) return setProblem(t('kiosk.newIncident.alarmInFuture'));
    if (Date.parse(at) < now().getTime() - terminal.maxAlarmAgeHours * 3_600_000) return setProblem(t('kiosk.newIncident.alarmTooOld', { hours: terminal.maxAlarmAgeHours }));
    check.mutate({ departmentId: department.id, alarmKeyword: keyword, alarmedAt: at, dispatchNumber: dispatchNumber.trim() || null, street, city, joinIncidentId: null });
  };

  const keywordName = (key: string) => {
    const found = keywords.data?.find((k) => k.key === key);
    return found ? `${found.key} · ${localized(found.name)}` : key;
  };

  return (
    <>
      <div className={classes.title}>
        <h1>{t('kiosk.newIncident.title')}</h1>
        <span className={classes.meta}>{t('kiosk.newIncident.subtitle', { department: department.shortName })}</span>
      </div>
      <ErrorNotice error={keywords.error} />
      <section className={classes.section}>
        <div className={classes.field}>
          <label htmlFor="kiosk-keyword" className={classes.required}>{t('kiosk.newIncident.keyword')}</label>
          <select id="kiosk-keyword" value={keyword} onChange={(e) => setKeyword(e.currentTarget.value)}>
            <option value="">{t('kiosk.booking.choose')}</option>
            {(keywords.data ?? []).map((k) => (
              <option key={k.key} value={k.key}>{keywordName(k.key)}</option>
            ))}
          </select>
        </div>
        <div className={classes.fields}>
          <div className={classes.field}>
            <label htmlFor="kiosk-alarm" className={classes.required}>{t('kiosk.newIncident.alarm')}</label>
            <input id="kiosk-alarm" type="time" value={alarm} onChange={(e) => setAlarm(e.currentTarget.value)} />
            <span className={classes.help}>{t('kiosk.newIncident.alarmHint', { hours: terminal.maxAlarmAgeHours })}</span>
          </div>
          <div className={classes.field}>
            <label htmlFor="kiosk-dispatch">{t('kiosk.newIncident.dispatchNumber')}</label>
            <input id="kiosk-dispatch" type="text" value={dispatchNumber} placeholder={t('kiosk.newIncident.dispatchPlaceholder')} onChange={(e) => setDispatchNumber(e.currentTarget.value)} />
          </div>
        </div>
        <div className={classes.fields}>
          <div className={classes.field}>
            <label htmlFor="kiosk-street">{t('kiosk.newIncident.street')}</label>
            <input id="kiosk-street" type="text" value={street} onChange={(e) => setStreet(e.currentTarget.value)} />
          </div>
          <div className={classes.field}>
            <label htmlFor="kiosk-city">{t('kiosk.newIncident.city')}</label>
            <input id="kiosk-city" type="text" value={city} onChange={(e) => setCity(e.currentTarget.value)} />
          </div>
        </div>
      </section>
      <Notice>{t('kiosk.newIncident.info')}</Notice>
      {problem && <Notice kind="error">{problem}</Notice>}
      <ErrorNotice error={check.error ?? create.error} />
      <div className={classes.bar}>
        <button type="button" className={classes.button} onClick={() => go({ kind: 'overview' })}>{t('kiosk.cancel')}</button>
        <button type="button" className={cx(classes.button, classes.primary, classes.big)} disabled={check.isPending || create.isPending} onClick={next}>
          {t('kiosk.newIncident.next')}
        </button>
      </div>
      {matches && (
        <Dialog
          opened
          title={t('kiosk.newIncident.matchesTitle')}
          onClose={() => setMatches(null)}
          actions={
            <button type="button" className={classes.button} disabled={create.isPending} onClick={() => create.mutate(matches.input)}>
              {t('kiosk.newIncident.createNew')}
            </button>
          }
        >
          <p>{t('kiosk.newIncident.matchesText')}</p>
          {matches.list.map((m) => (
            <section key={m.incidentId} className={classes.match}>
              <strong>{keywordName(m.alarmKeyword)}</strong>
              <br />
              <span className={classes.meta}>
                {t('kiosk.newIncident.matchMeta', { time: clockTime(m.alarmedAt), place: [m.city, m.street].filter(Boolean).join(', ') })} ·{' '}
                {m.departments.length ? t('kiosk.newIncident.matchReports', { departments: m.departments.join(', ') }) : t('kiosk.newIncident.noReports')}
              </span>
              <div style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className={cx(classes.button, classes.secondary)}
                  disabled={create.isPending}
                  onClick={() => create.mutate({ ...matches.input, joinIncidentId: m.incidentId })}
                >
                  {t(m.ownReport ? 'kiosk.newIncident.own' : 'kiosk.newIncident.join')}
                </button>
              </div>
            </section>
          ))}
          <p className={classes.meta}>{t('kiosk.newIncident.matchesHint', { department: department.shortName })}</p>
          <ErrorNotice error={create.error} />
        </Dialog>
      )}
    </>
  );
}
