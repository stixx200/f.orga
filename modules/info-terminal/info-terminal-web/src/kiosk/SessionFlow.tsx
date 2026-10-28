import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { KioskSessionDetail } from '@forga/info-terminal-contracts';
import { useTranslation } from '@forga/web-sdk';
import { clockTime, kioskApi, timeOn } from './api';
import { useKiosk } from './context';
import classes from './kiosk.module.css';
import { cx, Dialog, ErrorNotice, NameChooser, Notice, type TileStatus, useCountdown } from './parts';

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

function CheckInForm({ session, person, onDone, onBack }: { session: KioskSessionDetail; person: Person; onDone: () => void; onBack: () => void }) {
  const { t } = useTranslation('info-terminal');
  const { department } = useKiosk();
  const queryClient = useQueryClient();
  const existing = session.attendance.find((a) => a.personId === person.id && a.editable);
  const [breathing, setBreathing] = useState(existing?.breathingApparatus ?? false);
  const [partly, setPartly] = useState(Boolean(existing?.from || existing?.to));
  const [from, setFrom] = useState(existing?.from ? clockTime(existing.from) : '');
  const [to, setTo] = useState(existing?.to ? clockTime(existing.to) : '');
  const [role, setRole] = useState(existing?.role ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['kiosk', 'session'] });
    void queryClient.invalidateQueries({ queryKey: ['kiosk', 'overview'] });
  };
  const save = useMutation({
    mutationFn: () =>
      kioskApi.checkIn(session.sessionId, {
        departmentId: department.id,
        personId: person.id,
        breathingApparatus: session.breathingApparatus && breathing,
        role: role.trim() || null,
        from: partly && from ? timeOn(session.startsAt, from) : null,
        to: partly && to ? timeOn(session.startsAt, to) : null,
      }),
    onSuccess: () => {
      invalidate();
      onDone();
    },
  });
  const remove = useMutation({
    mutationFn: () => kioskApi.cancelCheckIn(department.id, session.sessionId, person.id),
    onSuccess: () => {
      invalidate();
      setRemoving(false);
      onBack();
    },
  });
  const submit = () => {
    setProblem(null);
    if (partly && [from, to].some((v) => v && !timeOn(session.startsAt, v))) return setProblem(t('kiosk.booking.timeInvalid'));
    save.mutate();
  };
  const name = fullName(person);
  const present = session.attendance.filter((a) => a.personId !== person.id);

  return (
    <>
      <button type="button" className={classes.back} onClick={onBack}>{t('kiosk.booking.otherPerson')}</button>
      <div className={classes.title}>
        <div>
          <span className={classes.meta}>{t('kiosk.session.meta', { from: clockTime(session.startsAt), to: clockTime(session.endsAt) })}</span>
          <h1>{t('kiosk.session.title', { title: session.title, name })}</h1>
        </div>
        <span className={cx(classes.badge, classes.badgeWarn)}>{t('kiosk.session.bookUntil', { time: clockTime(session.closesAt) })}</span>
      </div>
      <section className={classes.section}>
        <h2>{t('kiosk.session.present')}</h2>
        <div className={classes.switches}>
          {session.breathingApparatus && (
            <label className={classes.switch}><input type="checkbox" checked={breathing} onChange={(e) => setBreathing(e.currentTarget.checked)} /> {t('kiosk.session.breathing')}</label>
          )}
          <label className={classes.switch}><input type="checkbox" checked={partly} onChange={(e) => setPartly(e.currentTarget.checked)} /> {t('kiosk.session.partly')}</label>
        </div>
        {partly && (
          <div className={classes.fields}>
            <div className={classes.field}>
              <label htmlFor="kiosk-session-from">{t('kiosk.session.from')}</label>
              <input id="kiosk-session-from" type="time" value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
            </div>
            <div className={classes.field}>
              <label htmlFor="kiosk-session-to">{t('kiosk.session.to')}</label>
              <input id="kiosk-session-to" type="time" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
            </div>
          </div>
        )}
        <div className={classes.field} style={{ marginTop: 8 }}>
          <label htmlFor="kiosk-session-role">{t('kiosk.session.role')}</label>
          <input id="kiosk-session-role" type="text" maxLength={100} value={role} placeholder={t('kiosk.session.rolePlaceholder')} onChange={(e) => setRole(e.currentTarget.value)} />
        </div>
        {!session.breathingApparatus && <p className={classes.meta} style={{ margin: 0 }}>{t('kiosk.session.noBreathing')}</p>}
      </section>
      <Notice kind="warning">{t('kiosk.session.provisional')}</Notice>
      <section className={classes.section}>
        <h2>{t('kiosk.session.alreadyPresent', { count: present.length })}</h2>
        <p className={classes.meta} style={{ margin: 0 }}>{present.length ? present.map(fullName).join(', ') : t('kiosk.session.nobody')}</p>
      </section>
      {problem && <Notice kind="error">{problem}</Notice>}
      <ErrorNotice error={save.error} />
      <div className={classes.bar}>
        {existing && <button type="button" className={cx(classes.button, classes.danger)} onClick={() => setRemoving(true)}>{t('kiosk.session.remove')}</button>}
        <button type="button" className={classes.button} onClick={onBack}>{t('kiosk.cancel')}</button>
        <button type="button" className={cx(classes.button, classes.primary, classes.big)} disabled={save.isPending} onClick={submit}>
          {t(existing ? 'kiosk.session.save' : 'kiosk.session.submit')}
        </button>
      </div>
      <Dialog
        opened={removing}
        title={t('kiosk.session.removeTitle', { name })}
        onClose={() => setRemoving(false)}
        actions={
          <>
            <button type="button" className={classes.button} onClick={() => setRemoving(false)}>{t('kiosk.cancel')}</button>
            <button type="button" className={cx(classes.button, classes.primary)} disabled={remove.isPending} onClick={() => remove.mutate()}>{t('kiosk.session.removeConfirm')}</button>
          </>
        }
      >
        <p>{t('kiosk.session.removeText', { name, title: session.title })}</p>
        <ErrorNotice error={remove.error} />
      </Dialog>
    </>
  );
}

function DoneDialog({ session, person }: { session: KioskSessionDetail; person: Person | null }) {
  const { t } = useTranslation('info-terminal');
  const { reset } = useKiosk();
  const seconds = useCountdown(10, Boolean(person), reset);
  if (!person) return null;
  return (
    <Dialog opened title={t('kiosk.done.title')} onClose={reset} actions={<button type="button" className={cx(classes.button, classes.primary)} onClick={reset}>{t('kiosk.done.finish')}</button>}>
      <div className={classes.success}>
        <div className={classes.tick} aria-hidden="true">✓</div>
        <p><strong>{t('kiosk.session.done', { name: fullName(person) })}</strong></p>
        <p className={classes.meta}>
          {t('kiosk.session.doneText', { title: session.title, time: clockTime(session.closesAt) })} {t('kiosk.done.back', { seconds })}
        </p>
      </div>
    </Dialog>
  );
}

/** Check-in for a session: who are you, then the form (unconfirmed until the attendance list is saved). */
export function SessionFlow({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation('info-terminal');
  const { department } = useKiosk();
  const session = useQuery({ queryKey: ['kiosk', 'session', department.id, sessionId], queryFn: () => kioskApi.session(department.id, sessionId), refetchInterval: 30_000 });
  const [person, setPerson] = useState<Person | null>(null);
  const [done, setDone] = useState<Person | null>(null);
  const data = session.data;
  if (!data) return <ErrorNotice error={session.error} />;

  const status = (personId: string): TileStatus => {
    const attendance = data.attendance.find((a) => a.personId === personId);
    if (!attendance) return { kind: 'free' };
    const meta = [attendance.role, t('kiosk.persons.present'), !attendance.editable && t('kiosk.persons.locked')].filter(Boolean).join(' · ');
    return attendance.editable ? { kind: 'booked', meta, editable: true } : { kind: 'blocked', reason: meta };
  };

  return (
    <>
      <ErrorNotice error={session.error} />
      {person ? (
        <CheckInForm
          key={person.id}
          session={data}
          person={person}
          onBack={() => setPerson(null)}
          onDone={() => {
            setDone(person);
            setPerson(null);
          }}
        />
      ) : (
        <>
          <div className={classes.title}>
            <div>
              <span className={classes.meta}>{t('kiosk.persons.sessionMeta', { from: clockTime(data.startsAt), to: clockTime(data.endsAt) })}</span>
              <h1>{t('kiosk.persons.title', { title: data.title })}</h1>
            </div>
            <span className={cx(classes.badge, classes.badgeWarn)}>{t('kiosk.session.bookUntil', { time: clockTime(data.closesAt) })}</span>
          </div>
          <NameChooser status={status} onPick={(p) => setPerson(p)} />
        </>
      )}
      <DoneDialog session={data} person={done} />
    </>
  );
}
