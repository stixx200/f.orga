import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { KioskEntry, KioskReport } from '@forga/info-terminal-contracts';
import { useLocalized, useTranslation } from '@forga/web-sdk';
import { clockTime, kioskApi, timeOn } from './api';
import { useKiosk } from './context';
import classes from './kiosk.module.css';
import { cx, Dialog, ErrorNotice, Icon, NameChooser, Notice, type TileStatus, useCountdown } from './parts';

interface Person {
  id: string;
  firstName: string;
  lastName: string;
}

type Step = { kind: 'persons' } | { kind: 'form'; person: Person } | { kind: 'list' };

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;
/** "LF 20/16" of "LF 20/16 · Florian Musterstadt 1/44 (Musterstadt)". */
const shortLabel = (label: string) => label.split(' · ')[0].replace(/ \([^)]*\)$/, '');

function useLabels(report: KioskReport) {
  const { t } = useTranslation('info-terminal');
  const localized = useLocalized();
  const vehicle = (entry: Pick<KioskEntry, 'vehicleId' | 'standby'>) =>
    entry.standby ? t('kiosk.persons.standby') : (report.vehicles.find((v) => v.id === entry.vehicleId)?.label ?? t('kiosk.booked.noVehicle'));
  const fn = (key: string | null) => (key ? (report.functions.find((f) => f.key === key) ? localized(report.functions.find((f) => f.key === key)!.name) : key) : '');
  return { vehicle, fn };
}

/** Times of an entry: whole incident, from, until, or from–until. */
function useTimeText() {
  const { t } = useTranslation('info-terminal');
  return (entry: Pick<KioskEntry, 'from' | 'to'>) => {
    if (entry.from && entry.to) return t('kiosk.done.range', { from: clockTime(entry.from), to: clockTime(entry.to) });
    if (entry.from) return t('kiosk.done.since', { time: clockTime(entry.from) });
    if (entry.to) return t('kiosk.done.until', { time: clockTime(entry.to) });
    return t('kiosk.done.wholeTime');
  };
}

function BookingForm({ report, person, onDone, onBack }: { report: KioskReport; person: Person; onDone: (entry: KioskEntry) => void; onBack: () => void }) {
  const { t } = useTranslation('info-terminal');
  const localized = useLocalized();
  const { terminal, department } = useKiosk();
  const queryClient = useQueryClient();
  const existing = report.entries.find((e) => e.personId === person.id && e.editable);
  const [where, setWhere] = useState<string | null>(existing ? (existing.standby ? 'standby' : existing.vehicleId) : null);
  const [fn, setFn] = useState<string>(existing?.function ?? '');
  const [breathing, setBreathing] = useState(existing?.breathingApparatus ?? false);
  const [loss, setLoss] = useState(existing?.lossOfEarnings ?? false);
  const [working, setWorking] = useState(existing?.duringWorkingHours ?? false);
  const [partly, setPartly] = useState(Boolean(existing?.from || existing?.to));
  const [from, setFrom] = useState(existing?.from ? clockTime(existing.from) : '');
  const [to, setTo] = useState(existing?.to ? clockTime(existing.to) : '');
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const standby = where === 'standby';
  const vehicle = !standby && where ? where : null;
  const atStation = report.vehicles.filter((v) => v.atStation || v.id === vehicle);
  const others = report.vehicles.filter((v) => !v.atStation);
  const used = (id: string) => report.entries.filter((e) => e.vehicleId === id && !e.standby && e.personId !== person.id).length;
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['kiosk', 'report'] });
    void queryClient.invalidateQueries({ queryKey: ['kiosk', 'overview'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const own = partly && vehicle;
      const fromIso = own && from ? timeOn(report.alarmedAt, from) : null;
      const toIso = own && to ? timeOn(report.alarmedAt, to) : null;
      return kioskApi.book(report.reportId, {
        departmentId: department.id,
        personId: person.id,
        vehicleId: vehicle,
        standby,
        function: fn || null,
        breathingApparatus: Boolean(vehicle) && breathing,
        lossOfEarnings: loss,
        duringWorkingHours: working,
        from: fromIso,
        to: toIso,
      });
    },
    onSuccess: (entry) => {
      invalidate();
      onDone(entry);
    },
  });
  const remove = useMutation({
    mutationFn: () => kioskApi.cancel(department.id, report.reportId, person.id),
    onSuccess: () => {
      invalidate();
      setRemoving(false);
      onBack();
    },
  });
  const submit = () => {
    setProblem(null);
    if (!where) return setProblem(t('kiosk.booking.whereRequired'));
    if (partly && vehicle && [from, to].some((v) => v && !timeOn(report.alarmedAt, v))) return setProblem(t('kiosk.booking.timeInvalid'));
    save.mutate();
  };
  const name = fullName(person);

  return (
    <>
      <button type="button" className={classes.back} onClick={onBack}>{t('kiosk.booking.otherPerson')}</button>
      <div className={classes.title}>
        <div>
          <span className={classes.meta}>{t('kiosk.booking.meta', { title: report.alarmKeyword, time: clockTime(report.alarmedAt) })}</span>
          <h1>{t(existing ? 'kiosk.booking.titleChange' : 'kiosk.booking.title', { name })}</h1>
        </div>
      </div>
      <section className={classes.section}>
        <h2>{t('kiosk.booking.where')}</h2>
        <div className={classes.choices} role="radiogroup" aria-label={t('kiosk.booking.where')}>
          {atStation.map((v) => (
            <label key={v.id} className={cx(classes.choice, where === v.id && classes.choiceActive)}>
              <input type="radio" name="where" checked={where === v.id} onChange={() => setWhere(v.id)} />
              <span>{v.label}<small>{t('kiosk.booking.seats', { used: used(v.id), seats: v.seats })}</small></span>
            </label>
          ))}
          <label className={cx(classes.choice, standby && classes.choiceActive)}>
            <input type="radio" name="where" checked={standby} onChange={() => setWhere('standby')} />
            <span>{t('kiosk.booking.standby')}<small>{t('kiosk.booking.standbyAt', { station: terminal.station.name })}</small></span>
          </label>
        </div>
        {others.length > 0 && (
          <div className={cx(classes.field, classes.other)}>
            <label htmlFor="kiosk-other-vehicle">{t('kiosk.booking.otherVehicle')}</label>
            <select id="kiosk-other-vehicle" value={others.some((v) => v.id === where) ? (where as string) : ''} onChange={(e) => e.currentTarget.value && setWhere(e.currentTarget.value)}>
              <option value="">{t('kiosk.booking.choose')}</option>
              {others.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
            <span className={classes.help}>{t('kiosk.booking.otherVehicleLabel')}</span>
          </div>
        )}
      </section>
      <section className={classes.section}>
        <h2>{t('kiosk.booking.function')}</h2>
        <div className={cx(classes.choices, classes.narrow)} role="radiogroup" aria-label={t('kiosk.booking.function')}>
          {[...report.functions.map((f) => ({ key: f.key, label: localized(f.name) })), { key: '', label: t('kiosk.booking.noFunction') }].map((f) => (
            <label key={f.key || 'none'} className={cx(classes.choice, fn === f.key && classes.choiceActive)}>
              <input type="radio" name="function" checked={fn === f.key} onChange={() => setFn(f.key)} />
              <span>{f.label}</span>
            </label>
          ))}
        </div>
      </section>
      <section className={classes.section}>
        <h2>{t('kiosk.booking.more')}</h2>
        <div className={classes.switches}>
          {!standby && (
            <label className={classes.switch}><input type="checkbox" checked={breathing} onChange={(e) => setBreathing(e.currentTarget.checked)} /> {t('kiosk.booking.breathing')}</label>
          )}
          <label className={classes.switch}><input type="checkbox" checked={loss} onChange={(e) => setLoss(e.currentTarget.checked)} /> {t('kiosk.booking.lossOfEarnings')}</label>
          <label className={classes.switch}><input type="checkbox" checked={working} onChange={(e) => setWorking(e.currentTarget.checked)} /> {t('kiosk.booking.duringWorkingHours')}</label>
          {!standby && (
            <label className={classes.switch}><input type="checkbox" checked={partly} onChange={(e) => setPartly(e.currentTarget.checked)} /> {t('kiosk.booking.partly')}</label>
          )}
        </div>
        {standby && <Notice>{t('kiosk.booking.standbyNotice')}</Notice>}
        {!standby && partly && (
          <div className={classes.fields}>
            <div className={classes.field}>
              <label htmlFor="kiosk-from">{t('kiosk.booking.from')}</label>
              <input id="kiosk-from" type="time" value={from} onChange={(e) => setFrom(e.currentTarget.value)} />
              <span className={classes.help}>{t('kiosk.booking.fromHint')}</span>
            </div>
            <div className={classes.field}>
              <label htmlFor="kiosk-to">{t('kiosk.booking.to')}</label>
              <input id="kiosk-to" type="time" value={to} onChange={(e) => setTo(e.currentTarget.value)} />
              <span className={classes.help}>{t('kiosk.booking.toHint')}</span>
            </div>
          </div>
        )}
        <p className={classes.meta} style={{ margin: 0 }}>{t('kiosk.booking.authorHint')}</p>
      </section>
      {problem && <Notice kind="error">{problem}</Notice>}
      <ErrorNotice error={save.error} />
      <div className={classes.bar}>
        <span className={classes.barStatus}>{t('kiosk.booking.status', { department: department.shortName })}</span>
        {existing && <button type="button" className={cx(classes.button, classes.danger)} onClick={() => setRemoving(true)}>{t('kiosk.booking.remove')}</button>}
        <button type="button" className={classes.button} onClick={onBack}>{t('kiosk.cancel')}</button>
        <button type="button" className={cx(classes.button, classes.primary, classes.big)} disabled={save.isPending} onClick={submit}>
          {t(existing ? 'kiosk.booking.save' : 'kiosk.booking.submit')}
        </button>
      </div>
      <RemoveDialog
        opened={removing}
        name={name}
        text={t('kiosk.booked.removeText', { name, department: department.shortName, title: report.alarmKeyword })}
        error={remove.error}
        pending={remove.isPending}
        onClose={() => setRemoving(false)}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}

function RemoveDialog({ opened, name, text, error, pending, onClose, onConfirm }: { opened: boolean; name: string; text: string; error: unknown; pending: boolean; onClose: () => void; onConfirm: () => void }) {
  const { t } = useTranslation('info-terminal');
  return (
    <Dialog
      opened={opened}
      title={t('kiosk.booked.removeTitle', { name })}
      onClose={onClose}
      actions={
        <>
          <button type="button" className={classes.button} onClick={onClose}>{t('kiosk.cancel')}</button>
          <button type="button" className={cx(classes.button, classes.primary)} disabled={pending} onClick={onConfirm}>{t('kiosk.booked.removeConfirm')}</button>
        </>
      }
    >
      <p>{text}</p>
      <ErrorNotice error={error} />
    </Dialog>
  );
}

/** Signed in persons by vehicle: own terminal entries can be changed, those of the author are locked. */
function BookedList({ report, onChange, onBack }: { report: KioskReport; onChange: (person: Person) => void; onBack: () => void }) {
  const { t } = useTranslation('info-terminal');
  const labels = useLabels(report);
  const groups = new Map<string, KioskEntry[]>();
  for (const entry of report.entries.toSorted((a, b) => a.lastName.localeCompare(b.lastName, 'de'))) {
    const key = entry.standby ? 'standby' : (entry.vehicleId ?? 'none');
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  return (
    <>
      <button type="button" className={classes.back} onClick={onBack}>{t('kiosk.booked.toNames')}</button>
      <div className={classes.title}>
        <div>
          <span className={classes.meta}>{t('kiosk.persons.incidentMeta', { time: clockTime(report.alarmedAt), place: [report.city, report.street].filter(Boolean).join(', ') })}</span>
          <h1>{t('kiosk.booked.title', { title: report.alarmKeyword, count: report.entries.length })}</h1>
        </div>
        <span className={cx(classes.badge, classes.badgeWarn)}>{t('kiosk.booked.changeUntil', { time: clockTime(report.closesAt) })}</span>
      </div>
      {!report.entries.length && <p className={classes.meta}>{t('kiosk.booked.empty')}</p>}
      {[...groups].map(([key, entries]) => {
        const vehicle = report.vehicles.find((v) => v.id === key);
        return (
          <section key={key} className={classes.section}>
            <h2>{labels.vehicle(entries[0])}</h2>
            {vehicle && <p className={classes.meta}>{t('kiosk.booking.seats', { used: entries.length, seats: vehicle.seats })}</p>}
            <ul className={classes.crew}>
              {entries.map((e) => (
                <li key={e.personId}>
                  <span className={classes.who}>
                    <strong>{fullName(e)}</strong>
                    <br />
                    <span className={classes.meta}>{[labels.fn(e.function), e.breathingApparatus && t('kiosk.booked.breathing'), (e.from || e.to) && (e.from ? t('kiosk.done.since', { time: clockTime(e.from) }) : t('kiosk.done.until', { time: clockTime(e.to!) }))].filter(Boolean).join(' · ')}</span>
                  </span>
                  {e.editable ? (
                    <>
                      <span className={cx(classes.badge, classes.badgeOk)}>{t('kiosk.booked.viaTerminal', { time: e.bookedAt ? clockTime(e.bookedAt) : '' })}</span>
                      <button type="button" className={classes.button} onClick={() => onChange({ id: e.personId, firstName: e.firstName, lastName: e.lastName })}>{t('kiosk.booked.change')}</button>
                    </>
                  ) : (
                    <span className={cx(classes.badge, classes.badgeGrey)}><Icon name="lock" size={14} />{t('kiosk.booked.locked')}</span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className={classes.meta}>{t('kiosk.booked.hint')}</p>
    </>
  );
}

function DoneDialog({ report, entry, onList }: { report: KioskReport; entry: KioskEntry | null; onList: () => void }) {
  const { t } = useTranslation('info-terminal');
  const { reset, department } = useKiosk();
  const labels = useLabels(report);
  const times = useTimeText();
  const seconds = useCountdown(10, Boolean(entry), reset);
  if (!entry) return null;
  return (
    <Dialog
      opened
      title={t('kiosk.done.title')}
      onClose={reset}
      actions={
        <>
          <button type="button" className={classes.button} onClick={onList}>{t('kiosk.done.showBooked')}</button>
          <button type="button" className={cx(classes.button, classes.primary)} onClick={reset}>{t('kiosk.done.finish')}</button>
        </>
      }
    >
      <div className={classes.success}>
        <div className={classes.tick} aria-hidden="true">✓</div>
        <p>
          <strong>{fullName(entry)}</strong>
          <br />
          {labels.vehicle(entry)}
          <br />
          {[labels.fn(entry.function), times(entry)].filter(Boolean).join(' · ')}
        </p>
        <p className={classes.meta}>
          {t('kiosk.done.text', { title: report.alarmKeyword, department: department.shortName, time: clockTime(report.closesAt) })} {t('kiosk.done.back', { seconds })}
        </p>
      </div>
    </Dialog>
  );
}

/** Signing in for an incident: who are you, the form, the list of the signed in. */
export function ReportFlow({ reportId }: { reportId: string }) {
  const { t } = useTranslation('info-terminal');
  const { department } = useKiosk();
  const labels = { vehicle: (label: string) => shortLabel(label) };
  const report = useQuery({ queryKey: ['kiosk', 'report', department.id, reportId], queryFn: () => kioskApi.report(department.id, reportId), refetchInterval: 30_000 });
  const [step, setStep] = useState<Step>({ kind: 'persons' });
  const [done, setDone] = useState<KioskEntry | null>(null);
  const localized = useLocalized();
  const data = report.data;
  if (!data) return <ErrorNotice error={report.error} />;

  const status = (personId: string): TileStatus => {
    const entry = data.entries.find((e) => e.personId === personId);
    if (entry) {
      const vehicle = entry.standby ? t('kiosk.persons.standby') : labels.vehicle(data.vehicles.find((v) => v.id === entry.vehicleId)?.label ?? '');
      const fn = entry.function ? localized(data.functions.find((f) => f.key === entry.function)?.name ?? { de: entry.function, en: entry.function }) : '';
      const meta = [vehicle, fn, !entry.editable && t('kiosk.persons.locked')].filter(Boolean).join(' · ');
      return { kind: 'booked', meta, editable: entry.editable };
    }
    const other = data.elsewhere[personId];
    if (other) return { kind: 'blocked', reason: t('kiosk.persons.elsewhere', { department: localized(other) }) };
    return { kind: 'free' };
  };

  return (
    <>
      <ErrorNotice error={report.error} />
      {!data.bookable && <Notice kind="warning">{t('kiosk.persons.finished')}</Notice>}
      {step.kind === 'persons' && (
        <>
          <div className={classes.title}>
            <div>
              <span className={classes.meta}>{t('kiosk.persons.incidentMeta', { time: clockTime(data.alarmedAt), place: [data.city, data.street].filter(Boolean).join(', ') })}</span>
              <h1>{t('kiosk.persons.title', { title: data.alarmKeyword })}</h1>
            </div>
            <button type="button" className={classes.button} onClick={() => setStep({ kind: 'list' })}>{t('kiosk.persons.bookedList', { count: data.entries.length })}</button>
          </div>
          {data.bookable && (
            <NameChooser
              guestsHint
              status={status}
              onPick={(person, s) => setStep(s.kind === 'booked' && !s.editable ? { kind: 'list' } : { kind: 'form', person })}
            />
          )}
        </>
      )}
      {step.kind === 'form' && data.bookable && (
        <BookingForm key={step.person.id} report={data} person={step.person} onBack={() => setStep({ kind: 'persons' })} onDone={setDone} />
      )}
      {step.kind === 'list' && <BookedList report={data} onBack={() => setStep({ kind: 'persons' })} onChange={(person) => setStep({ kind: 'form', person })} />}
      <DoneDialog
        report={data}
        entry={done}
        onList={() => {
          setDone(null);
          setStep({ kind: 'list' });
        }}
      />
    </>
  );
}

