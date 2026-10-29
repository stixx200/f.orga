import { Anchor, Button, Code, Group, PasswordInput, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import { type FormEvent, useEffect, useState } from 'react';
import type { MfaEnrolment, RecoveryCodes, Session, StepUpResult } from '@forga/core-contracts';
import { formatTime, registerStepUpHandler, send, SESSION_QUERY_KEY, useTranslation } from '@forga/web-sdk';
import { Notice, notifyError, Panel, ResponsiveDialog, StatusBadge, useAction } from '@forga/web-ui';

/** The secret in groups of four characters, for typing it into the app by hand. */
const grouped = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

/** Offers the recovery codes as text file, to print or keep in the password manager. */
function downloadCodes(codes: string[], username: string) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([`f.orga – ${username}\n\n${codes.join('\n')}\n`], { type: 'text/plain' }));
  link.download = `forga-recovery-codes-${username}.txt`;
  link.click();
  URL.revokeObjectURL(link.href);
}

const submit = (event: FormEvent, run: () => void) => {
  event.preventDefault();
  run();
};

/** Recovery codes, shown only once after setting up or renewing. */
export function RecoveryCodeList({ codes, username }: { codes: string[]; username: string }) {
  const { t } = useTranslation('shell');
  return (
    <Stack gap="sm">
      <Text size="sm" c="dimmed">{t('mfa.codesHint')}</Text>
      <Code block translate="no" style={{ fontSize: '0.95rem', columnCount: 2 }}>{codes.join('\n')}</Code>
      <Group>
        <Button variant="default" onClick={() => downloadCodes(codes, username)}>{t('mfa.download')}</Button>
      </Group>
    </Stack>
  );
}

/**
 * Setting up the second factor (mockup `datenschutz/zwei-faktor.html`): 1 connect the app (password, QR code),
 * 2 confirm with a code, 3 recovery codes. Setting it up confirms the session as well. `columns`: the steps side by side
 * (page) or one below the other (dialog).
 */
export function MfaEnrolmentSteps({ session, columns = 1, onDone }: { session: Session; columns?: 1 | 3; onDone: () => void }) {
  const { t } = useTranslation('shell');
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [enrolment, setEnrolment] = useState<MfaEnrolment | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const start = useAction(() => send<MfaEnrolment>('POST', 'core/mfa/enrolment', session.mfa.passwordRequired ? { password } : {}), { onSuccess: setEnrolment });
  const confirm = useAction(() => send<RecoveryCodes>('POST', 'core/mfa/enrolment/confirm', { code }), {
    onSuccess: (result) => {
      setCodes(result.recoveryCodes);
      void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
    },
  });

  if (!session.mfa.available) return <Notice kind="error">{t('mfa.noSecretKey')}</Notice>;
  if (session.impersonator) return <Notice kind="info">{t('mfa.impersonation')}</Notice>;

  return (
    <SimpleGrid cols={{ base: 1, md: columns }} spacing="lg">
      <Panel title={t('mfa.step1')}>
        {enrolment ? (
          <Stack gap="sm">
            <Text size="sm" c="dimmed">{t('mfa.scan')}</Text>
            <QRCodeSVG value={enrolment.uri} size={176} marginSize={2} title={t('mfa.qr')} style={{ background: '#fff' }} />
            <Text size="sm" c="dimmed">{t('mfa.manual')} <Code translate="no">{grouped(enrolment.secret)}</Code></Text>
          </Stack>
        ) : (
          <form onSubmit={(e) => submit(e, () => start.mutate(undefined))}>
            <Stack gap="sm">
              <Text size="sm" c="dimmed">{t('mfa.appHint')}</Text>
              {session.mfa.passwordRequired && (
                <PasswordInput label={t('mfa.password')} value={password} onChange={(e) => setPassword(e.currentTarget.value)} required autoComplete="current-password" />
              )}
              <Group justify="flex-end">
                <Button type="submit" loading={start.isPending} disabled={session.mfa.passwordRequired && !password}>{t('mfa.start')}</Button>
              </Group>
            </Stack>
          </form>
        )}
      </Panel>
      <Panel title={t('mfa.step2')}>
        <form onSubmit={(e) => submit(e, () => confirm.mutate(undefined))}>
          <Stack gap="sm">
            <TextInput
              label={t('mfa.code')}
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              disabled={!enrolment || Boolean(codes)}
            />
            <Group justify="flex-end">
              <Button type="submit" loading={confirm.isPending} disabled={!enrolment || Boolean(codes) || !code.trim()}>{t('mfa.confirm')}</Button>
            </Group>
          </Stack>
        </form>
      </Panel>
      <Panel title={t('mfa.step3')}>
        {codes ? (
          <Stack gap="sm">
            <RecoveryCodeList codes={codes} username={session.user.username} />
            <Group justify="flex-end">
              <Button onClick={onDone}>{t('mfa.done')}</Button>
            </Group>
          </Stack>
        ) : (
          <Text size="sm" c="dimmed">{t('mfa.codesLater')}</Text>
        )}
      </Panel>
    </SimpleGrid>
  );
}

/** Dialog „Bitte bestätigen Sie mit Ihrem Code“ (`#d-stepup`); without a factor it leads to setting one up. */
function StepUpDialog({ session, onDone }: { session: Session; onDone: (confirmed: boolean) => void }) {
  const { t } = useTranslation('shell');
  const { t: common } = useTranslation('common');
  const [recovery, setRecovery] = useState(false);
  const [value, setValue] = useState('');
  // Fixed when the dialog opens: setting up the factor refreshes the session, the recovery codes must stay visible.
  const [enrolled] = useState(session.mfa.enrolled);
  const confirm = useAction(() => send<StepUpResult>('POST', 'core/step-up', recovery ? { recoveryCode: value } : { code: value }), {
    onSuccess: () => onDone(true),
  });
  const provider = useAction(() => send<{ url: string }>('POST', 'core/oidc/step-up', { returnTo: `${window.location.pathname}${window.location.search}` }), {
    onSuccess: ({ url }) => window.location.assign(url),
  });

  if (!enrolled) {
    return (
      <ResponsiveDialog opened onClose={() => onDone(false)} title={t('mfa.setupTitle')} size="lg">
        <Notice kind="info">{t('mfa.setupIntro')}</Notice>
        <MfaEnrolmentSteps session={session} onDone={() => onDone(true)} />
      </ResponsiveDialog>
    );
  }
  return (
    <ResponsiveDialog
      opened
      onClose={() => onDone(false)}
      title={t('mfa.dialogTitle')}
      actions={
        <>
          <Button variant="outline" color="gray" onClick={() => onDone(false)}>{common('actions.cancel')}</Button>
          <Button type="submit" form="forga-step-up" loading={confirm.isPending} disabled={!value.trim()}>{t('mfa.confirm')}</Button>
        </>
      }
    >
      <form
        id="forga-step-up"
        onSubmit={(event) => {
          event.preventDefault();
          confirm.mutate(undefined);
        }}
      >
        <Stack gap="sm">
          <Text size="sm">{t('mfa.dialogText')}</Text>
          <TextInput
            label={t(recovery ? 'mfa.recoveryCode' : 'mfa.code')}
            value={value}
            onChange={(e) => setValue(e.currentTarget.value)}
            inputMode={recovery ? 'text' : 'numeric'}
            autoComplete={recovery ? 'off' : 'one-time-code'}
            required
            data-autofocus
          />
          <Text size="sm">
            <Anchor component="button" type="button" onClick={() => { setRecovery(!recovery); setValue(''); }}>
              {t(recovery ? 'mfa.useApp' : 'mfa.useRecovery')}
            </Anchor>
          </Text>
          {session.mfa.viaProvider && (
            <Group>
              <Button variant="default" loading={provider.isPending} onClick={() => provider.mutate(undefined)}>{t('mfa.viaProvider')}</Button>
            </Group>
          )}
        </Stack>
      </form>
    </ResponsiveDialog>
  );
}

/**
 * Shows the step-up dialog when the API answers `auth.stepUpRequired` (registered with the web SDK, so module
 * frontends get it too). After the confirmation all data are loaded again, now with the sensitive parts.
 */
export function StepUpHost({ session }: { session: Session }) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<((confirmed: boolean) => void) | null>(null);

  useEffect(() => {
    registerStepUpHandler(() => new Promise<boolean>((resolve) => setPending(() => resolve)));
    return () => registerStepUpHandler(null);
  }, []);

  if (!pending) return null;
  return (
    <StepUpDialog
      session={session}
      onDone={(confirmed) => {
        setPending(null);
        if (confirmed) {
          void queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
          // Everything shown so far lacks the sensitive parts: load it again.
          void queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== SESSION_QUERY_KEY[0] || query.queryKey[1] !== SESSION_QUERY_KEY[1] });
        }
        pending(confirmed);
      }}
    />
  );
}

/** Header plaque „Bestätigt bis 10:42“ with „Beenden“ while the session is confirmed with the second factor. */
export function ElevationBadge({ session }: { session: Session }) {
  const { t, i18n } = useTranslation('shell');
  const queryClient = useQueryClient();
  const until = session.elevatedUntil ? Date.parse(session.elevatedUntil) : 0;
  const [now, setNow] = useState(() => Date.now());

  // At the end of the confirmation the session and all data are loaded again (without the sensitive parts).
  useEffect(() => {
    if (!until) return;
    const timer = setTimeout(() => {
      setNow(Date.now());
      void queryClient.invalidateQueries();
    }, Math.max(0, until - Date.now()) + 500);
    return () => clearTimeout(timer);
  }, [until, queryClient]);

  if (!until || until <= now) return null;
  const end = async () => {
    try {
      await send('POST', 'core/step-up/end');
      await queryClient.invalidateQueries();
    } catch (error) {
      notifyError(error);
    }
  };
  return (
    <Group gap={6} wrap="nowrap">
      <StatusBadge tone="done">{t('mfa.confirmedUntil', { time: formatTime(session.elevatedUntil, i18n.language) })}</StatusBadge>
      <Button size="compact-xs" variant="subtle" onClick={() => void end()}>{t('mfa.end')}</Button>
    </Group>
  );
}

/** Profile section „Zwei-Faktor“: status, setting up, renewing the recovery codes, ending the confirmation. */
export function MfaPanel({ session }: { session: Session }) {
  const { t } = useTranslation('shell');
  const [setup, setSetup] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const renew = useAction(() => send<RecoveryCodes>('POST', 'core/mfa/recovery-codes'), {
    invalidate: [SESSION_QUERY_KEY],
    onSuccess: (result) => setCodes(result.recoveryCodes),
  });
  const needed = session.stepUpPermissions.length > 0;

  return (
    <Panel title={t('mfa.title')} aside={<StatusBadge tone={session.mfa.enrolled ? 'done' : needed ? 'warning' : 'neutral'}>{t(session.mfa.enrolled ? 'mfa.enrolled' : needed ? 'mfa.missing' : 'mfa.notNeeded')}</StatusBadge>}>
      <Stack gap="sm">
        <Text size="sm">{t('mfa.intro')}</Text>
        <Title order={3} size="h6">{t('mfa.areasTitle')}</Title>
        <Text size="sm">{t('mfa.areasYes')}</Text>
        <Text size="sm" c="dimmed">{t('mfa.areasNo')}</Text>
        {session.mfa.enrolled && <Text size="sm">{t('mfa.codesLeft', { count: session.mfa.recoveryCodesLeft })}</Text>}
        {!session.mfa.available && <Notice kind="warning">{t('mfa.noSecretKey')}</Notice>}
        <Group justify="flex-end">
          {session.mfa.enrolled ? (
            <Button variant="default" loading={renew.isPending} disabled={Boolean(session.impersonator)} onClick={() => renew.mutate(undefined)}>{t('mfa.renew')}</Button>
          ) : (
            <Button disabled={!session.mfa.available || Boolean(session.impersonator)} onClick={() => setSetup(true)}>{t('mfa.setup')}</Button>
          )}
        </Group>
      </Stack>
      {setup && (
        <ResponsiveDialog opened onClose={() => setSetup(false)} title={t('mfa.setupTitle')} size="lg">
          <MfaEnrolmentSteps session={session} onDone={() => setSetup(false)} />
        </ResponsiveDialog>
      )}
      {codes && (
        <ResponsiveDialog opened onClose={() => setCodes(null)} title={t('mfa.newCodes')} actions={<Button onClick={() => setCodes(null)}>{t('mfa.done')}</Button>}>
          <RecoveryCodeList codes={codes} username={session.user.username} />
        </ResponsiveDialog>
      )}
    </Panel>
  );
}
