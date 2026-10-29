import { useMutation } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import type { KioskDriverLicense } from '@forga/info-terminal-contracts';
import { ApiError, formatDate, formatDateTime, useTranslation } from '@forga/web-sdk';
import { CodeCamera, nfcSupported, readNfc, signalScan } from '@forga/web-ui';
import { kioskApi } from './api';
import { useKiosk } from './context';
import classes from './kiosk.module.css';
import { cx, Dialog, ErrorNotice, Icon, Notice, useCountdown, useKeyboardScan } from './parts';

/** "Den Aufkleber an das Lesegerät halten": keyboard readers, Web NFC (Android) or the camera (barcode). */
function Scan({ onCode }: { onCode: (code: string) => void }) {
  const { t } = useTranslation('info-terminal');
  const [camera, setCamera] = useState(false);
  useKeyboardScan(onCode, !camera);
  // Web NFC reads stickers while the screen is open (Chrome on Android).
  useEffect(() => {
    if (!nfcSupported()) return;
    const controller = new AbortController();
    readNfc(controller.signal)
      .then((code) => {
        signalScan();
        onCode(code);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [onCode]);

  return (
    <div className={classes.center}>
      <div className={classes.bigIcon}><Icon name="license" size={44} /></div>
      <h1>{t('kiosk.license.scanTitle')}</h1>
      <p className={classes.meta}>{t('kiosk.license.scanText')}</p>
      {camera ? (
        <CodeCamera
          onCode={(code) => {
            signalScan();
            onCode(code);
          }}
        />
      ) : (
        <p><button type="button" className={cx(classes.button, classes.big)} onClick={() => setCamera(true)}>{t('kiosk.license.camera')}</button></p>
      )}
      <p className={classes.meta}>{t('kiosk.license.noSticker')}</p>
    </div>
  );
}

function Done({ result }: { result: KioskDriverLicense }) {
  const { t, i18n } = useTranslation('info-terminal');
  const { reset } = useKiosk();
  const seconds = useCountdown(10, true, reset);
  return (
    <Dialog opened title={t('kiosk.license.doneTitle')} onClose={reset} actions={<button type="button" className={cx(classes.button, classes.primary)} onClick={reset}>{t('kiosk.done.finish')}</button>}>
      <div className={classes.success}>
        <div className={classes.tick} aria-hidden="true">✓</div>
        <p>
          <strong>{`${result.firstName} ${result.lastName}`}</strong>
          <br />
          {t('kiosk.license.doneText', { time: formatDateTime(result.confirmed?.checkedAt, i18n.language) })}
        </p>
        <p className={classes.meta}>
          {result.confirmed?.nextDueOn && t('kiosk.license.nextDue', { date: formatDate(result.confirmed.nextDueOn, i18n.language) })} {t('kiosk.done.back', { seconds })}
        </p>
      </div>
    </Dialog>
  );
}

/** Name, classes and latest check of the scanned licence; the self-declaration and "Bestätigen" when allowed. */
function Confirm({ code, view, onDone }: { code: string; view: KioskDriverLicense; onDone: (result: KioskDriverLicense) => void }) {
  const { t, i18n } = useTranslation('info-terminal');
  const { reset } = useKiosk();
  const [declared, setDeclared] = useState(false);
  const confirm = useMutation({ mutationFn: () => kioskApi.driverLicense({ code, confirm: true, language: i18n.language === 'en' ? 'en' : 'de' }), onSuccess: onDone });
  const expiries = [...new Set(view.classes.flatMap((c) => (c.expiresOn ? [c.expiresOn] : [])))].toSorted();
  const due = view.next ? t(`kiosk.license.dues.${view.next.kind}`, { classes: view.next.classes.join(', '), date: formatDate(view.next.dueOn, i18n.language), defaultValue: formatDate(view.next.dueOn, i18n.language) }) : null;

  return (
    <>
      <div className={classes.title}><h1>{`${view.firstName} ${view.lastName}`}</h1></div>
      <section className={classes.section}>
        <h2>{t('kiosk.license.yours')}</h2>
        <p style={{ margin: 0 }}>
          <strong>{t('kiosk.license.classes')}:</strong> {view.classes.map((c) => c.class).join(', ') || '–'}
        </p>
        {expiries.map((date) => (
          <p key={date} style={{ margin: 0 }}>
            <strong>{t('kiosk.license.validUntil', { classes: view.classes.filter((c) => c.expiresOn === date).map((c) => c.class).join(', ') })}:</strong> {formatDate(date, i18n.language)}
          </p>
        ))}
        <p style={{ margin: 0 }}>
          <strong>{t('kiosk.license.lastCheck')}:</strong>{' '}
          {view.lastCheck ? `${formatDate(view.lastCheck.checkedOn, i18n.language)} · ${t(`kiosk.license.methods.${view.lastCheck.method}`)}` : '–'}
        </p>
      </section>
      {view.state === 'allowed' && (
        <section className={classes.section}>
          <h2>{t('kiosk.license.declaration')}</h2>
          <label className={classes.switch}>
            <input type="checkbox" checked={declared} onChange={(e) => setDeclared(e.currentTarget.checked)} /> {t('kiosk.license.declarationText')}
          </label>
          <p className={classes.meta} style={{ margin: '8px 0 0' }}>
            {t('kiosk.license.selfCheckHint')} {view.inPersonDueOn && t('kiosk.license.inPersonBy', { date: formatDate(view.inPersonDueOn, i18n.language) })}
          </p>
        </section>
      )}
      {view.state === 'in-person' && <Notice kind="warning">{t('kiosk.license.inPerson')}</Notice>}
      {view.state === 'off' && <Notice kind="info">{due ? t('kiosk.license.recordedNext', { due }) : t('kiosk.license.recorded')}</Notice>}
      <ErrorNotice error={confirm.error} />
      <div className={classes.bar}>
        <button type="button" className={classes.button} onClick={reset}>{t(view.state === 'allowed' ? 'kiosk.license.notMe' : 'kiosk.done.finish')}</button>
        {view.state === 'allowed' && (
          <button type="button" className={cx(classes.button, classes.primary, classes.big)} disabled={!declared || confirm.isPending} onClick={() => confirm.mutate()}>
            {t('kiosk.license.confirm')}
          </button>
        )}
      </div>
    </>
  );
}

/** Self-check of a driving licence at the terminal: scan the sticker, check name and classes, confirm. */
export function DriverLicenseFlow({ initialCode }: { initialCode: string | null }) {
  const { t } = useTranslation('info-terminal');
  const { reset } = useKiosk();
  const [code, setCode] = useState<string | null>(initialCode);
  const [done, setDone] = useState<KioskDriverLicense | null>(null);
  const lookup = useMutation({ mutationFn: (scanned: string) => kioskApi.driverLicense({ code: scanned, confirm: false }) });
  const { mutate } = lookup;
  useEffect(() => {
    if (code) mutate(code);
  }, [code, mutate]);
  const unknown = lookup.error instanceof ApiError && lookup.error.code === 'info-terminal.licenseNotRegistered';

  if (done) return <Done result={done} />;
  if (!code) return <Scan onCode={setCode} />;
  if (lookup.data) return <Confirm code={code} view={lookup.data} onDone={setDone} />;
  return (
    <>
      {!unknown && <ErrorNotice error={lookup.error} />}
      {lookup.error && !unknown && (
        <p><button type="button" className={classes.button} onClick={() => setCode(null)}>{t('kiosk.license.again')}</button></p>
      )}
      <Dialog
        opened={unknown}
        title={t('kiosk.license.unknownTitle')}
        onClose={reset}
        actions={<button type="button" className={cx(classes.button, classes.primary)} onClick={reset}>{t('kiosk.backToOverview')}</button>}
      >
        <p>{t('kiosk.license.unknownText')}</p>
      </Dialog>
    </>
  );
}
